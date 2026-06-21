import { ServiceUnavailableException } from '@nestjs/common';
import { AuthService } from './auth.service';

function createService(
  mode: string,
  whatsappConfigured = false,
  nodeEnv = 'test',
) {
  const config = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      const values: Record<string, unknown> = {
        NODE_ENV: nodeEnv,
        OTP_DELIVERY_MODE: mode,
        OTP_MOCK_FIXED_CODE: '123456',
      };
      return values[key] ?? defaultValue;
    }),
  };
  const prisma = {
    otpRequestLog: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockReturnValue({}),
    },
    otpChallenge: {
      create: jest.fn().mockReturnValue({}),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const whatsappOtp = {
    isConfigured: jest.fn().mockReturnValue(whatsappConfigured),
    sendOtp: jest.fn().mockResolvedValue(undefined),
  };

  const service = new AuthService(
    prisma as never,
    config as never,
    {} as never,
    { normalizeToE164: jest.fn().mockReturnValue('+6591234567') } as never,
    {} as never,
    audit as never,
    whatsappOtp as never,
  );

  return { service, prisma, whatsappOtp };
}

describe('AuthService.requestOtp', () => {
  it('fails closed when non-mock OTP delivery has no WhatsApp config', async () => {
    const { service, prisma, whatsappOtp } = createService('auto', false);

    await expect(service.requestOtp('+6591234567')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    expect(whatsappOtp.sendOtp).not.toHaveBeenCalled();
    expect(prisma.otpChallenge.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns the OTP code only in local mock mode', async () => {
    const { service, whatsappOtp } = createService('mock', false, 'test');

    await expect(service.requestOtp('+6591234567')).resolves.toMatchObject({
      sent: true,
      channel: 'mock',
      _devCode: '123456',
    });
    expect(whatsappOtp.sendOtp).not.toHaveBeenCalled();
  });

  it('rejects mock OTP mode in production before creating a challenge', async () => {
    const { service, prisma } = createService('mock', false, 'production');

    await expect(service.requestOtp('+6591234567')).rejects.toMatchObject({
      response: {
        code: 'OTP_MOCK_DISABLED_IN_PRODUCTION',
      },
    });
    expect(prisma.otpChallenge.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
