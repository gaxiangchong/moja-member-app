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
import { randomInt, randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { envFlagTrue } from '../config/env-flags';
import { CustomersService } from '../customers/customers.service';
import { PhoneNormalizerService } from '../customers/phone-normalizer.service';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenJwtPayload } from './types/jwt-payload.type';
import type { ShopHandoffJwtPayload } from './types/shop-handoff-jwt-payload.type';
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
    private readonly metrics: MetricsService,
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

    const mode = this.resolveOtpMode();
    const fixedCode = this.config.get<string>('OTP_MOCK_FIXED_CODE')?.trim();
    const code =
      mode === 'mock' && fixedCode
        ? fixedCode
        : String(randomInt(0, 1_000_000)).padStart(6, '0');
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

    const waConfigured = this.whatsappOtp.isConfigured();

    if (mode === 'whatsapp' && !waConfigured) {
      throw new ServiceUnavailableException({
        code: 'OTP_DELIVERY_NOT_CONFIGURED',
        message:
          'OTP mode is whatsapp but WhatsApp credentials are missing. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.',
      });
    }

    if (mode !== 'mock' && waConfigured) {
      await this.whatsappOtp.sendOtp(phoneE164, code);
    }

    const channel = mode === 'mock' ? 'mock' : waConfigured ? 'whatsapp' : 'dev';
    const returnCode = channel !== 'whatsapp';

    return {
      sent: true,
      channel,
      expiresAt: expiresAt.toISOString(),
      ...(returnCode ? { _devCode: code } : {}),
    };
  }

  async verifyOtp(phoneRaw: string, code: string, referralCode?: string) {
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

    const customer = await this.customers.ensureCustomerForPhone(phoneE164, {
      referralCode: referralCode?.trim() || undefined,
    });
    await this.customers.touchLastLogin(customer.id);

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

  private resolveOtpMode(): 'mock' | 'whatsapp' | 'auto' {
    const raw = this.config.get<string>('OTP_DELIVERY_MODE', 'auto').toLowerCase();
    if (raw === 'mock' || raw === 'whatsapp') {
      return raw;
    }
    return 'auto';
  }

  async issueShopHandoff(customerId: string) {
    if (!envFlagTrue(this.config.get<string>('FEATURE_SHOP_SSO'))) {
      throw new ServiceUnavailableException({
        code: 'FEATURE_DISABLED',
        message: 'Shop SSO handoff is disabled (FEATURE_SHOP_SSO).',
      });
    }

    this.metrics.incShopHandoffRequested();
    await this.audit.log({
      actorType: 'customer',
      actorId: customerId,
      action: 'shop.handoff.requested',
      entityType: 'customer',
      entityId: customerId,
    });

    const shopBase = this.config.get<string>('SHOP_WEB_BASE_URL')?.trim();
    if (!shopBase) {
      this.metrics.incShopHandoffIssueFailed();
      throw new ServiceUnavailableException({
        code: 'SHOP_HANDOFF_MISCONFIGURED',
        message: 'SHOP_WEB_BASE_URL is not set on the member API.',
      });
    }

    let consumeBase: URL;
    try {
      const shopOrigin = new URL(
        shopBase.endsWith('/') ? shopBase : `${shopBase}/`,
      ).origin;
      consumeBase = new URL('/sso/consume', `${shopOrigin}/`);
    } catch {
      this.metrics.incShopHandoffIssueFailed();
      throw new ServiceUnavailableException({
        code: 'SHOP_HANDOFF_MISCONFIGURED',
        message: 'SHOP_WEB_BASE_URL is not a valid URL.',
      });
    }

    const ttlSec = Math.min(
      Math.max(this.config.get<number>('SHOP_HANDOFF_TTL_SEC', 45), 15),
      60,
    );
    const issuer =
      this.config.get<string>('SHOP_HANDOFF_ISSUER')?.trim() ||
      `http://localhost:${this.config.get<number>('PORT', 3153)}`;
    const audience =
      this.config.get<string>('SHOP_HANDOFF_AUDIENCE')?.trim() || 'shop';
    const secret =
      this.config.get<string>('SHOP_HANDOFF_JWT_SECRET')?.trim() ||
      this.config.getOrThrow<string>('JWT_SECRET');

    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + ttlSec * 1000);
    const payload: ShopHandoffJwtPayload = {
      sub: customerId,
      aud: audience,
      iss: issuer,
      jti,
    };

    const handoffToken = await this.jwt.signAsync(payload, {
      secret,
      expiresIn: ttlSec,
    });

    await this.prisma.shopHandoffJti.create({
      data: {
        jti,
        customerId,
        expiresAt,
      },
    });

    consumeBase.searchParams.set('handoff', handoffToken);
    const consumeUrl = consumeBase.toString();

    this.metrics.incShopHandoffIssued();
    await this.audit.log({
      actorType: 'customer',
      actorId: customerId,
      action: 'shop.handoff.issued',
      entityType: 'customer',
      entityId: customerId,
      metadata: { jti, expiresInSec: ttlSec },
    });

    return {
      handoffToken,
      expiresInSec: ttlSec,
      consumeUrl,
    };
  }
}
