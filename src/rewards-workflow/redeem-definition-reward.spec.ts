import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RewardsWorkflowService } from './rewards-workflow.service';

const RM5 = {
  id: 'def-rm5',
  code: 'VOUCHER5',
  title: 'RM5 Cash Voucher',
  pointsCost: 50,
  maxTotalIssued: null as number | null,
};

function setup(
  opts: {
    def?: typeof RM5 | null;
    balance?: number;
    recent?: { id: string; expiresAt: Date | null } | null;
  } = {},
) {
  const tx = {
    customerVoucher: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: 'cv1', expiresAt: null }),
    },
  };
  const prisma = {
    rewardCatalog: { findUnique: jest.fn().mockResolvedValue(null) },
    voucherDefinition: {
      findFirst: jest
        .fn()
        .mockResolvedValue(opts.def === undefined ? RM5 : opts.def),
    },
    customerVoucher: {
      findFirst: jest.fn().mockResolvedValue(opts.recent ?? null),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const balance = opts.balance ?? 120;
  const loyalty = {
    getWalletSummary: jest.fn().mockResolvedValue({ pointsBalance: balance }),
    appendLedgerEntry: jest.fn(({ deltaPoints }: { deltaPoints: number }) =>
      Promise.resolve({ balanceAfter: balance + deltaPoints }),
    ),
  };
  const service = new RewardsWorkflowService(
    prisma as never,
    loyalty as never,
    {} as never,
  );
  return { service, prisma, tx, loyalty };
}

describe('redeeming a voucher-definition reward with points', () => {
  it('spends the points and puts the voucher in the wallet', async () => {
    const { service, tx, loyalty } = setup();
    const res = await service.redeemRewardByPoints('m1', 'def-rm5', 'k');
    expect(loyalty.appendLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'm1', deltaPoints: -50 }),
      tx,
    );
    expect(tx.customerVoucher.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: 'm1',
        definitionId: 'def-rm5',
        status: 'ISSUED',
      }),
    });
    expect(res).toMatchObject({
      idempotent: false,
      voucher: { id: 'cv1', code: 'VOUCHER5', name: 'RM5 Cash Voucher' },
      pointsSpent: 50,
      pointsBalance: 70,
    });
  });

  it('refuses when the member is short of points', async () => {
    const { service, tx, loyalty } = setup({ balance: 20 });
    await expect(
      service.redeemRewardByPoints('m1', 'def-rm5', 'k'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(loyalty.appendLedgerEntry).not.toHaveBeenCalled();
    expect(tx.customerVoucher.create).not.toHaveBeenCalled();
  });

  it('returns the earlier voucher on a double tap without charging again', async () => {
    const { service, loyalty } = setup({
      recent: { id: 'cv0', expiresAt: null },
    });
    const res = await service.redeemRewardByPoints('m1', 'def-rm5', 'k');
    expect(res).toMatchObject({ idempotent: true, voucher: { id: 'cv0' } });
    expect(loyalty.appendLedgerEntry).not.toHaveBeenCalled();
  });

  it('refuses a reward that is not in the points catalog', async () => {
    const { service } = setup({ def: null });
    await expect(
      service.redeemRewardByPoints('m1', 'nope', 'k'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
