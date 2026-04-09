import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { P, permissionsForRole } from '../permissions';
import type { AdminAuthState } from '../types/admin-auth.types';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<
      Request & { adminAuth?: AdminAuthState }
    >();
    const ip =
      String(
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
          req.ip ||
          '',
      ) || undefined;

    const authz = req.headers.authorization;
    if (typeof authz === 'string' && authz.startsWith('Bearer ')) {
      const token = authz.slice(7).trim();
      const secret =
        this.config.get<string>('ADMIN_JWT_SECRET') ||
        this.config.getOrThrow<string>('JWT_SECRET');
      let payload: { sub: string; typ?: string };
      try {
        payload = this.jwt.verify(token, { secret }) as { sub: string; typ?: string };
      } catch {
        throw new UnauthorizedException({
          code: 'ADMIN_TOKEN_INVALID',
          message: 'Invalid or expired admin token',
        });
      }
      if (payload.typ !== 'admin') {
        throw new UnauthorizedException({
          code: 'ADMIN_TOKEN_WRONG_TYPE',
          message: 'Not an admin access token',
        });
      }
      const user = await this.prisma.adminUser.findUnique({
        where: { id: payload.sub },
      });
      if (!user?.isActive) {
        throw new UnauthorizedException({
          code: 'ADMIN_USER_INACTIVE',
          message: 'Admin account is disabled',
        });
      }
      const permissions = permissionsForRole(user.role);
      req.adminAuth = {
        kind: 'user',
        actorLabel: `admin:${user.email}`,
        permissions,
        isSuper: permissions.has(P.ALL),
        adminUserId: user.id,
        role: user.role,
        email: user.email,
        ip,
      };
      return true;
    }

    const header = req.headers['x-admin-api-key'];
    const keyRaw = Array.isArray(header) ? header[0] : header;
    const key = (keyRaw ?? '').trim().replace(/^['"]|['"]$/g, '');
    const raw = this.config.get<string>('ADMIN_API_KEYS', '');
    const allowed = raw
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);

    if (!allowed.length) {
      throw new UnauthorizedException({
        code: 'ADMIN_AUTH_REQUIRED',
        message:
          'Provide Authorization: Bearer <admin JWT> or configure ADMIN_API_KEYS for legacy access',
      });
    }
    if (!key || !allowed.includes(key)) {
      throw new UnauthorizedException({
        code: 'ADMIN_UNAUTHORIZED',
        message: 'Invalid admin credentials',
      });
    }
    req.adminAuth = {
      kind: 'api_key',
      actorLabel: `key:${key.slice(0, 6)}…`,
      permissions: new Set([P.ALL]),
      isSuper: true,
      ip,
    };
    return true;
  }
}
