import { BadRequestException } from '@nestjs/common';
import { OpsRedemptionsService } from './ops-redemptions.service';

const future = new Date(Date.now() + 7 * 86_400_000);
const past = new Date(Date.now() - 86_400_000);

const welcome = (over: Record<string, unknown> = {}) => ({
  id: 'v1',
  name: 'Welcome voucher',
  status: 'ACTIVE',
  expiresAt: future,
  lockExpiresAt: null,
  metadata: null,
  voucherCampaign: {
    template: 'WELCOME',
    autoCreditTrigger: 'NEW_MEMBER',
    voucherType: 'FIXED_AMOUNT',
    fixedAmountOff: 1000,
    percentageOff: null,
    minSpend: null,
  },
  ...over,
});

function setup(
  opts: {
    status?: string;
    voucher?: ReturnType<typeof welcome> | null;
    claimed?: number;
  } = {},
) {
  const prisma = {
    employee: {
      findUnique: jest.fn().mockResolvedValue({
        employeeCode: 'E001',
        displayName: 'Default staff',
        isActive: true,
      }),
    },
    customer: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'm1',
        status: opts.status ?? 'ACTIVE',
        birthday: null,
      }),
    },
    voucher: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          opts.voucher === undefined ? welcome() : opts.voucher,
        ),
      updateMany: jest.fn().mockResolvedValue({ count: opts.claimed ?? 1 }),
    },
  };
  const phone = { normalizeToE164: jest.fn().mockReturnValue('+60109531593') };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new OpsRedemptionsService(
    prisma as never,
    {} as never,
    {} as never,
    phone as never,
    audit as never,
  );
  return { service, prisma, audit };
}

const use = {
  phone: '0109531593',
  voucherId: '00000000-0000-0000-0000-000000000001',
  source: 'CAMPAIGN' as const,
  staffCode: 'E001',
  verification: 'QR' as const,
};

const errorCode = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return ((e as BadRequestException).getResponse() as { code: string }).code;
  }
  throw new Error('expected a refusal');
};

describe('using a member voucher at the counter', () => {
  it('marks the voucher used and gives the cashier the discount to key in', async () => {
    const { service, prisma, audit } = setup();
    await expect(service.useMemberVoucher(use)).resolves.toEqual({
      title: 'Welcome voucher',
      discountLabel: 'RM10.00 off',
      minSpendCents: null,
    });
    const update = (
      prisma.voucher.updateMany.mock.calls as unknown[][]
    )[0][0] as {
      data: { status: string; metadata: Record<string, unknown> };
    };
    expect(update.data.status).toBe('USED');
    expect(update.data.metadata.usedAtCounterBy).toBe('E001');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ops.voucher_used_at_counter' }),
    );
  });

  it('refuses a voucher another counter or checkout just used', async () => {
    const { service } = setup({ claimed: 0 });
    expect(await errorCode(service.useMemberVoucher(use))).toBe(
      'VOUCHER_NOT_REDEEMABLE',
    );
  });

  it('refuses a member who never activated their account', async () => {
    const { service, prisma } = setup({ status: 'DRAFT' });
    expect(await errorCode(service.useMemberVoucher(use))).toBe(
      'MEMBER_NOT_ACTIVATED',
    );
    expect(prisma.voucher.updateMany).not.toHaveBeenCalled();
  });

  it('refuses an expired voucher', async () => {
    const { service, prisma } = setup({
      voucher: welcome({ expiresAt: past }),
    });
    expect(await errorCode(service.useMemberVoucher(use))).toBe(
      'VOUCHER_NOT_REDEEMABLE',
    );
    expect(prisma.voucher.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a voucher held by an online checkout', async () => {
    const { service, prisma } = setup({
      voucher: welcome({ status: 'LOCKED', lockExpiresAt: future }),
    });
    expect(await errorCode(service.useMemberVoucher(use))).toBe(
      'VOUCHER_NOT_REDEEMABLE',
    );
    expect(prisma.voucher.updateMany).not.toHaveBeenCalled();
  });

  it('refuses without a known staff code', async () => {
    const { service, prisma } = setup();
    prisma.employee.findUnique.mockResolvedValue(null);
    expect(await errorCode(service.useMemberVoucher(use))).toBe(
      'STAFF_CODE_INVALID',
    );
  });
});
