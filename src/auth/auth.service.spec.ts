import { ServiceUnavailableException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService OTP delivery', () => {
  function createService(options?: {
    config?: Record<string, number | string | undefined>;
    whatsappConfigured?: boolean;
  }) {
    const configValues = options?.config ?? {};
    const config = {
      get: jest.fn((key: string, defaultValue?: unknown) =>
        Object.prototype.hasOwnProperty.call(configValues, key)
          ? configValues[key]
          : defaultValue,
      ),
    };
    const prisma = {
      otpRequestLog: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn((args) => ({ model: 'otpRequestLog', args })),
      },
      otpChallenge: {
        create: jest.fn((args) => ({ model: 'otpChallenge', args })),
      },
      $transaction: jest.fn().mockResolvedValue(undefined),
    };
    const phoneNormalizer = {
      normalizeToE164: jest.fn().mockReturnValue('+15551234567'),
    };
    const audit = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    const whatsappOtp = {
      isConfigured: jest
        .fn()
        .mockReturnValue(options?.whatsappConfigured ?? false),
      sendOtp: jest.fn().mockResolvedValue(undefined),
    };

    const service = new AuthService(
      prisma as any,
      config as any,
      {} as any,
      phoneNormalizer as any,
      {} as any,
      audit as any,
      whatsappOtp as any,
    );

    return { audit, prisma, service, whatsappOtp };
  }

  it('fails closed in production auto mode when WhatsApp is not configured', async () => {
    const { prisma, service } = createService({
      config: { NODE_ENV: 'production', OTP_DELIVERY_MODE: 'auto' },
      whatsappConfigured: false,
    });

    await expect(service.requestOtp('+1 555 123 4567')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    expect(prisma.otpChallenge.create).not.toHaveBeenCalled();
    expect(prisma.otpRequestLog.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('fails closed in whatsapp mode when WhatsApp is not configured', async () => {
    const { prisma, service } = createService({
      config: { NODE_ENV: 'development', OTP_DELIVERY_MODE: 'whatsapp' },
      whatsappConfigured: false,
    });

    await expect(service.requestOtp('+1 555 123 4567')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    expect(prisma.otpChallenge.create).not.toHaveBeenCalled();
    expect(prisma.otpRequestLog.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not allow mock OTP delivery in production', async () => {
    const { prisma, service } = createService({
      config: { NODE_ENV: 'production', OTP_DELIVERY_MODE: 'mock' },
      whatsappConfigured: true,
    });

    await expect(service.requestOtp('+1 555 123 4567')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    expect(prisma.otpChallenge.create).not.toHaveBeenCalled();
    expect(prisma.otpRequestLog.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps the dev code response for non-production auto fallback', async () => {
    const { service, whatsappOtp } = createService({
      config: { NODE_ENV: 'development', OTP_DELIVERY_MODE: 'auto' },
      whatsappConfigured: false,
    });

    const response = await service.requestOtp('+1 555 123 4567');

    expect(response).toMatchObject({
      sent: true,
      channel: 'dev',
      _devCode: expect.stringMatching(/^\d{6}$/),
    });
    expect(whatsappOtp.sendOtp).not.toHaveBeenCalled();
  });
});
