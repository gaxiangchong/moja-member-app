import {
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { CustomersService } from '../customers/customers.service';
import { PhoneNormalizerService } from '../customers/phone-normalizer.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenJwtPayload } from './types/jwt-payload.type';
import { WhatsappOtpService } from './whatsapp-otp.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly phoneNormalizer: PhoneNormalizerService,
    private readonly customers: CustomersService,
    private readonly audit: AuditService,
    private readonly whatsappOtp: WhatsappOtpService,
  ) {}

  async requestOtp(phoneRaw: string, ipAddress?: string | null) {
    const phoneE164 = this.phoneNormalizer.normalizeToE164(phoneRaw);

    const windowMinutes = this.config.get<number>(
      'OTP_REQUEST_WINDOW_MINUTES',
      15,
    );
    const maxPerWindow = this.config.get<number>(
      'OTP_MAX_REQUESTS_PER_WINDOW',
      3,
    );
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    const recentCount = await this.prisma.otpRequestLog.count({
      where: {
        phoneE164,
        createdAt: { gte: since },
      },
    });

    if (recentCount >= maxPerWindow) {
      await this.audit.log({
        actorType: 'system',
        action: 'otp.request_rate_limited',
        entityType: 'phone',
        entityId: null,
        metadata: { phoneE164, ipAddress: ipAddress ?? null },
      });
      throw new HttpException(
        {
          code: 'OTP_RATE_LIMITED',
          message: 'Too many OTP requests. Try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const otpHash = await bcrypt.hash(code, 12);
    const ttlMinutes = this.config.get<number>('OTP_TTL_MINUTES', 10);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await this.prisma.$transaction([
      this.prisma.otpChallenge.create({
        data: {
          phoneE164,
          otpHash,
          expiresAt,
        },
      }),
      this.prisma.otpRequestLog.create({
        data: {
          phoneE164,
          ipAddress: ipAddress ?? null,
        },
      }),
    ]);

    await this.audit.log({
      actorType: 'system',
      action: 'otp.requested',
      entityType: 'phone',
      entityId: null,
      metadata: { phoneE164, ipAddress: ipAddress ?? null },
    });

    const isProduction =
      this.config.get<string>('NODE_ENV', 'development') === 'production';
    const waConfigured = this.whatsappOtp.isConfigured();

    if (isProduction && !waConfigured) {
      throw new ServiceUnavailableException({
        code: 'OTP_DELIVERY_NOT_CONFIGURED',
        message:
          'WhatsApp OTP is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.',
      });
    }

    if (waConfigured) {
      await this.whatsappOtp.sendOtp(phoneE164, code);
    }

    const devReturnCode = !isProduction && !waConfigured;

    return {
      sent: true,
      channel: waConfigured ? 'whatsapp' : 'dev',
      expiresAt: expiresAt.toISOString(),
      ...(devReturnCode ? { _devCode: code } : {}),
    };
  }

  async verifyOtp(phoneRaw: string, code: string) {
    const phoneE164 = this.phoneNormalizer.normalizeToE164(phoneRaw);

    const challenge = await this.prisma.otpChallenge.findFirst({
      where: {
        phoneE164,
        usedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) {
      throw new UnauthorizedException({
        code: 'OTP_INVALID',
        message: 'Invalid or unknown verification code',
      });
    }

    if (challenge.expiresAt.getTime() < Date.now()) {
      throw new GoneException({
        code: 'OTP_EXPIRED',
        message: 'Verification code has expired',
      });
    }

    const match = await bcrypt.compare(code, challenge.otpHash);
    if (!match) {
      throw new UnauthorizedException({
        code: 'OTP_INVALID',
        message: 'Invalid or unknown verification code',
      });
    }

    await this.prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { usedAt: new Date() },
    });

    const customer = await this.customers.ensureCustomerForPhone(phoneE164);

    await this.audit.log({
      actorType: 'customer',
      actorId: customer.id,
      action: 'otp.verified',
      entityType: 'customer',
      entityId: customer.id,
      metadata: { phoneE164 },
    });

    const payload: AccessTokenJwtPayload = {
      sub: customer.id,
      phoneE164: customer.phoneE164,
    };

    const accessToken = await this.jwt.signAsync(payload);

    return {
      accessToken,
      tokenType: 'Bearer' as const,
      customerId: customer.id,
      status: customer.status,
    };
  }
}
