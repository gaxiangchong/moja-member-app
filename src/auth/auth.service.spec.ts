import { ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { PhoneNormalizerService } from '../customers/phone-normalizer.service';
import { CustomersService } from '../customers/customers.service';
import { AuditService } from '../audit/audit.service';
import { WhatsappOtpService } from './whatsapp-otp.service';

describe('AuthService', () => {
  function buildService(configValues: Record<string, unknown>, waConfigured = false) {
    const config = {
      get: jest.fn((key: string, defaultValue?: unknown) =>
        key in configValues ? configValues[key] : defaultValue,
      ),
    } as unknown as ConfigService;
    const prisma = {
      otpRequestLog: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
      },
      otpChallenge: {
        create: jest.fn(),
      },
      $transaction: jest.fn().mockResolvedValue(undefined),
    } as unknown as PrismaService;
    const phoneNormalizer = {
      normalizeToE164: jest.fn().mockReturnValue('+6591234567'),
    } as unknown as PhoneNormalizerService;
    const audit = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;
    const whatsappOtp = {
      isConfigured: jest.fn().mockReturnValue(waConfigured),
      sendOtp: jest.fn().mockResolvedValue(undefined),
    } as unknown as WhatsappOtpService;

    const service = new AuthService(
      prisma,
      config,
      {} as JwtService,
      phoneNormalizer,
      {} as CustomersService,
      audit,
      whatsappOtp,
    );

    return { service, prisma, whatsappOtp };
  }

  it('fails closed in production auto mode when WhatsApp is not configured', async () => {
    const { service, prisma } = buildService({
      NODE_ENV: 'production',
      OTP_DELIVERY_MODE: 'auto',
    });

    await expect(service.requestOtp('+65 9123 4567')).rejects.toMatchObject({
      response: {
        code: 'OTP_DELIVERY_NOT_CONFIGURED',
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects mock OTP delivery in production', async () => {
    const { service, prisma } = buildService({
      NODE_ENV: 'production',
      OTP_DELIVERY_MODE: 'mock',
      OTP_MOCK_FIXED_CODE: '123456',
    });

    await expect(service.requestOtp('+65 9123 4567')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('only returns dev OTP codes outside production', async () => {
    const { service } = buildService({
      NODE_ENV: 'development',
      OTP_DELIVERY_MODE: 'mock',
      OTP_MOCK_FIXED_CODE: '123456',
    });

    await expect(service.requestOtp('+65 9123 4567')).resolves.toMatchObject({
      sent: true,
      channel: 'mock',
      _devCode: '123456',
    });
  });
});
