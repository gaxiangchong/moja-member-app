import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AdminRoleCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AdminAuthState } from './types/admin-auth.types';
import type { AdminBootstrapDto } from './dto/admin-bootstrap.dto';
import type { AdminLoginDto } from './dto/admin-login.dto';
import type { CreateAdminUserDto } from './dto/create-admin-user.dto';
import type { UpdateAdminUserDto } from './dto/update-admin-user.dto';

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private jwtSecret(): string {
    return (
      this.config.get<string>('ADMIN_JWT_SECRET') ||
      this.config.getOrThrow<string>('JWT_SECRET')
    );
  }

  private jwtExpiresSec(): number {
    return this.config.get<number>(
      'ADMIN_JWT_EXPIRES_IN_SEC',
      this.config.get<number>('JWT_EXPIRES_IN_SEC', 604800) ?? 604800,
    );
  }

  async bootstrap(dto: AdminBootstrapDto) {
    const n = await this.prisma.adminUser.count();
    if (n > 0) {
      throw new BadRequestException({
        code: 'ADMIN_BOOTSTRAP_DONE',
        message: 'Admin users already exist. Use login or an existing super admin.',
      });
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.adminUser.create({
      data: {
        email: dto.email.toLowerCase().trim(),
        passwordHash,
        displayName: dto.displayName ?? null,
        role: AdminRoleCode.SUPER_ADMIN,
      },
      select: {
        id: true,
        email: true,
        role: true,
        displayName: true,
      },
    });
    await this.audit.log({
      actorType: 'system',
      actorId: 'bootstrap',
      action: 'admin.bootstrap',
      entityType: 'admin_user',
      entityId: user.id,
      metadata: { email: user.email },
    });
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
    };
  }

  async login(dto: AdminLoginDto, ip?: string) {
    const user = await this.prisma.adminUser.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });
    if (!user?.isActive) {
      throw new UnauthorizedException({
        code: 'ADMIN_LOGIN_FAILED',
        message: 'Invalid email or password',
      });
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException({
        code: 'ADMIN_LOGIN_FAILED',
        message: 'Invalid email or password',
      });
    }
    await this.prisma.adminUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    const secret = this.jwtSecret();
    const expiresIn = this.jwtExpiresSec();
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, typ: 'admin', role: user.role },
      { secret, expiresIn },
    );
    await this.audit.log({
      actorType: 'admin',
      actorId: `admin:${user.email}`,
      action: 'admin.login',
      entityType: 'admin_user',
      entityId: user.id,
      adminUserId: user.id,
      adminRole: user.role,
      ipAddress: ip ?? null,
      metadata: { email: user.email },
    });
    return {
      accessToken,
      expiresIn,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        displayName: user.displayName,
      },
    };
  }

  async me(auth: AdminAuthState) {
    if (auth.kind === 'api_key') {
      return {
        kind: 'api_key' as const,
        actorLabel: auth.actorLabel,
      };
    }
    const user = await this.prisma.adminUser.findUnique({
      where: { id: auth.adminUserId! },
      select: {
        id: true,
        email: true,
        role: true,
        displayName: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException({ code: 'ADMIN_NOT_FOUND', message: 'User not found' });
    }
    return { kind: 'user' as const, ...user };
  }

  async listUsers() {
    return this.prisma.adminUser.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        role: true,
        displayName: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
  }

  async createUser(actor: AdminAuthState, dto: CreateAdminUserDto) {
    const exists = await this.prisma.adminUser.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });
    if (exists) {
      throw new ConflictException({ code: 'ADMIN_EMAIL_TAKEN', message: 'Email already in use' });
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.adminUser.create({
      data: {
        email: dto.email.toLowerCase().trim(),
        passwordHash,
        role: dto.role,
        displayName: dto.displayName ?? null,
      },
      select: {
        id: true,
        email: true,
        role: true,
        displayName: true,
        isActive: true,
        createdAt: true,
      },
    });
    await this.audit.log({
      actorType: 'admin',
      actorId: actor.actorLabel,
      action: 'admin.user_created',
      entityType: 'admin_user',
      entityId: user.id,
      adminUserId: actor.adminUserId ?? null,
      adminRole: actor.role as string | undefined,
      ipAddress: actor.ip ?? null,
      afterValue: { email: user.email, role: user.role } as object,
      metadata: { createdBy: actor.actorLabel },
    });
    return user;
  }

  async updateUser(actor: AdminAuthState, id: string, dto: UpdateAdminUserDto) {
    const before = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException({ code: 'ADMIN_USER_NOT_FOUND', message: 'User not found' });
    }
    const user = await this.prisma.adminUser.update({
      where: { id },
      data: {
        role: dto.role,
        isActive: dto.isActive,
        displayName: dto.displayName,
      },
      select: {
        id: true,
        email: true,
        role: true,
        displayName: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    const roleChanged = dto.role !== undefined && dto.role !== before.role;
    await this.audit.log({
      actorType: 'admin',
      actorId: actor.actorLabel,
      action: roleChanged ? 'admin.permission_updated' : 'admin.user_updated',
      entityType: 'admin_user',
      entityId: id,
      adminUserId: actor.adminUserId ?? null,
      adminRole: actor.role as string | undefined,
      ipAddress: actor.ip ?? null,
      beforeValue: {
        role: before.role,
        isActive: before.isActive,
        displayName: before.displayName,
      } as object,
      afterValue: {
        role: user.role,
        isActive: user.isActive,
        displayName: user.displayName,
      } as object,
    });
    return user;
  }
}
