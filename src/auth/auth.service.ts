import {
  BadRequestException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CustomerStatus, OtpPurpose } from '@prisma/client';
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

  async loginLookup(phoneRaw: string) {
    const phoneE164 = this.phoneNormalizer.normalizeToE164(phoneRaw);
    const customer = await this.prisma.customer.findUnique({
      where: { phoneE164 },
      select: { loginPinHash: true },
    });
    return {
      registered: Boolean(customer),
      hasPin: Boolean(customer?.loginPinHash),
    };
  }

  async requestOtp(
    phoneRaw: string,
    ipAddress?: string | null,
    purposeInput?: 'register' | 'recovery',
  ) {
    const phoneE164 = this.phoneNormalizer.normalizeToE164(phoneRaw);
    const purpose = await this.resolveOtpRequestPurpose(phoneE164, purposeInput);

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
          purpose,
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
      metadata: {
        phoneE164,
        ipAddress: ipAddress ?? null,
        purpose,
      },
    });

    const waConfigured = this.whatsappOtp.isConfigured();

    if (mode === 'whatsapp' && !waConfigured) {
      throw new ServiceUnavailableException({
        code: 'OTP_DELIVERY_NOT_CONFIGURED',
        message:
          'OTP mode is whatsapp but WhatsApp credentials are missing. ' +
          'Set WHATSAPP_PROVIDER plus the provider credentials — ' +
          'Meta: WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID, ' +
          'Twilio: TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + (TWILIO_WHATSAPP_FROM or TWILIO_MESSAGING_SERVICE_SID).',
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
      purpose: purpose === OtpPurpose.REGISTER ? 'register' : 'recovery',
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

    const setupExpiresInSec = Math.min(
      Math.max(this.config.get<number>('PIN_SETUP_JWT_TTL_SEC', 15 * 60), 60),
      60 * 60,
    );

    if (challenge.purpose === OtpPurpose.RECOVERY) {
      const customer = await this.prisma.customer.findUnique({
        where: { phoneE164 },
      });
      if (!customer) {
        throw new UnauthorizedException({
          code: 'OTP_INVALID',
          message: 'Invalid or unknown verification code',
        });
      }

      const setupToken = await this.signPinSetupToken(
        customer.id,
        customer.phoneE164,
        setupExpiresInSec,
      );

      await this.audit.log({
        actorType: 'customer',
        actorId: customer.id,
        action: 'otp.recovery_verified',
        entityType: 'customer',
        entityId: customer.id,
        metadata: { phoneE164 },
      });

      return {
        setupToken,
        setupExpiresInSec,
        purpose: 'recovery' as const,
      };
    }

    const customer = await this.customers.ensureCustomerForPhone(phoneE164, {
      referralCode: referralCode?.trim() || undefined,
    });

    await this.audit.log({
      actorType: 'customer',
      actorId: customer.id,
      action: 'otp.verified',
      entityType: 'customer',
      entityId: customer.id,
      metadata: { phoneE164 },
    });

    const setupToken = await this.signPinSetupToken(
      customer.id,
      customer.phoneE164,
      setupExpiresInSec,
    );

    return {
      setupToken,
      setupExpiresInSec,
      purpose: 'register' as const,
    };
  }

  async setPinFromSetup(setupToken: string, pin: string, pinConfirm: string) {
    if (pin !== pinConfirm) {
      throw new BadRequestException({
        code: 'PIN_MISMATCH',
        message: 'PIN entries do not match.',
      });
    }
    const { customerId } = await this.verifyPinSetupToken(setupToken);
    const hash = await bcrypt.hash(pin, 12);
    const customer = await this.prisma.customer.update({
      where: { id: customerId },
      data: { loginPinHash: hash },
    });
    await this.customers.touchLastLogin(customer.id);
    await this.audit.log({
      actorType: 'customer',
      actorId: customer.id,
      action: 'pin.set',
      entityType: 'customer',
      entityId: customer.id,
      metadata: { phoneE164: customer.phoneE164 },
    });
    return this.issueAccessToken(customer);
  }

  async loginWithPin(phoneRaw: string, pin: string) {
    const phoneE164 = this.phoneNormalizer.normalizeToE164(phoneRaw);
    const customer = await this.prisma.customer.findUnique({
      where: { phoneE164 },
    });
    if (!customer?.loginPinHash) {
      throw new UnauthorizedException({
        code: 'PIN_NOT_SET',
        message:
          'No login PIN for this number yet. Continue with WhatsApp verification or Forgot PIN.',
      });
    }
    const match = await bcrypt.compare(pin, customer.loginPinHash);
    if (!match) {
      await this.audit.log({
        actorType: 'customer',
        actorId: customer.id,
        action: 'pin.login_failed',
        entityType: 'customer',
        entityId: customer.id,
        metadata: { phoneE164 },
      });
      throw new UnauthorizedException({
        code: 'PIN_INVALID',
        message: 'Incorrect PIN.',
      });
    }
    await this.customers.touchLastLogin(customer.id);
    await this.audit.log({
      actorType: 'customer',
      actorId: customer.id,
      action: 'pin.login',
      entityType: 'customer',
      entityId: customer.id,
      metadata: { phoneE164 },
    });
    return this.issueAccessToken(customer);
  }

  private async resolveOtpRequestPurpose(
    phoneE164: string,
    purposeInput?: 'register' | 'recovery',
  ): Promise<OtpPurpose> {
    const customer = await this.prisma.customer.findUnique({
      where: { phoneE164 },
      select: { loginPinHash: true },
    });

    if (purposeInput === 'register') {
      if (customer) {
        throw new BadRequestException({
          code: 'PHONE_ALREADY_REGISTERED',
          message:
            'This number is already registered. Sign in with your PIN or use Forgot PIN.',
        });
      }
      return OtpPurpose.REGISTER;
    }

    if (purposeInput === 'recovery') {
      if (!customer) {
        throw new BadRequestException({
          code: 'PHONE_NOT_REGISTERED',
          message: 'No account found for this number.',
        });
      }
      return OtpPurpose.RECOVERY;
    }

    if (customer?.loginPinHash) {
      throw new HttpException(
        {
          code: 'USE_PIN_LOGIN',
          message:
            'This number uses a login PIN. Enter your PIN instead of requesting a WhatsApp code.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (customer) {
      return OtpPurpose.RECOVERY;
    }
    return OtpPurpose.REGISTER;
  }

  private async signPinSetupToken(
    customerId: string,
    phoneE164: string,
    expiresInSec: number,
  ): Promise<string> {
    return this.jwt.signAsync(
      { sub: customerId, scope: 'pin_setup' as const, phoneE164 },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: expiresInSec,
      },
    );
  }

  private async verifyPinSetupToken(
    token: string,
  ): Promise<{ customerId: string }> {
    let payload: { sub?: unknown; scope?: unknown };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException({
        code: 'SETUP_TOKEN_INVALID',
        message: 'Setup session expired or invalid. Request a new code.',
      });
    }
    if (
      payload.scope !== 'pin_setup' ||
      typeof payload.sub !== 'string' ||
      !payload.sub
    ) {
      throw new UnauthorizedException({
        code: 'SETUP_TOKEN_INVALID',
        message: 'Setup session expired or invalid. Request a new code.',
      });
    }
    return { customerId: payload.sub };
  }

  private async issueAccessToken(customer: {
    id: string;
    phoneE164: string;
    status: CustomerStatus;
  }) {
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
