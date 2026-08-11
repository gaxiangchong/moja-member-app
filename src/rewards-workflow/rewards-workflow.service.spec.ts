import { BadRequestException } from '@nestjs/common';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { RewardsWorkflowService } from './rewards-workflow.service';

describe('RewardsWorkflowService.redeemRewardByPoints', () => {
  const customerId = '11111111-1111-4111-8111-111111111111';
  const rewardCatalogId = '22222222-2222-4222-8222-222222222222';
  const walletId = '33333333-3333-4333-8333-333333333333';

  let callOrder: string[];
  let tx: {
    rewardCatalog: { findUnique: jest.Mock };
    userReward: { findFirst: jest.Mock; create: jest.Mock };
    userWalletBalance: { upsert: jest.Mock };
    walletTransaction: { create: jest.Mock };
    voucherCampaign: { findUnique: jest.Mock };
    voucher: { create: jest.Mock };
    rewardsPointsLedger: { create: jest.Mock };
  };
  let prisma: {
    userReward: { findFirst: jest.Mock };
    voucher: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let loyalty: {
    lockWalletInTx: jest.Mock;
    appendLedgerEntry: jest.Mock;
    getWalletSummary: jest.Mock;
  };
  let service: RewardsWorkflowService;

  beforeEach(() => {
    callOrder = [];
    tx = {
      rewardCatalog: {
        findUnique: jest.fn().mockResolvedValue({
          id: rewardCatalogId,
          code: 'FREE_DRINK',
          name: 'Free drink',
          isActive: true,
          pointsCost: 100,
          startsAt: null,
          endsAt: null,
          voucherCampaignId: null,
        }),
      },
      userReward: {
        findFirst: jest.fn().mockImplementation(async () => {
          callOrder.push('userRewardLookup');
          return null;
        }),
        create: jest.fn().mockImplementation(async ({ data }) => {
          callOrder.push('userRewardCreate');
          return { id: 'user-reward-1', ...data };
        }),
      },
      userWalletBalance: {
        upsert: jest.fn().mockResolvedValue({
          id: walletId,
          customerId,
          walletBalance: 0,
          pointsBalance: 0,
        }),
      },
      walletTransaction: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          callOrder.push('walletTxn');
          return { id: 'txn-1', ...data };
        }),
      },
      voucherCampaign: { findUnique: jest.fn() },
      voucher: { create: jest.fn() },
      rewardsPointsLedger: { create: jest.fn() },
    };
    prisma = {
      userReward: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      } as {
        findFirst: jest.Mock;
        findMany: jest.Mock;
      },
      voucher: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) =>
        fn(tx),
      ),
    };
    // Widen userReward typing for findMany used by getMemberWalletAndRewards.
    (prisma.userReward as { findMany: jest.Mock }).findMany = jest
      .fn()
      .mockResolvedValue([]);
    loyalty = {
      lockWalletInTx: jest.fn().mockImplementation(async () => {
        callOrder.push('lockLoyalty');
      }),
      appendLedgerEntry: jest.fn().mockImplementation(async () => {
        callOrder.push('loyaltyDebit');
        return { balanceAfter: 0 };
      }),
      getWalletSummary: jest.fn().mockResolvedValue({
        pointsBalance: 250,
        walletId: 'loyalty-1',
      }),
    };
    service = new RewardsWorkflowService(
      prisma as unknown as PrismaService,
      loyalty as unknown as LoyaltyService,
    );
  });

  it('debits LoyaltyWallet points (not user_wallet_balance.points_balance)', async () => {
    const result = await service.redeemRewardByPoints(
      customerId,
      rewardCatalogId,
      'idem-reward-1',
    );

    expect(result.idempotent).toBe(false);
    expect(loyalty.lockWalletInTx).toHaveBeenCalledWith(tx, customerId);
    expect(loyalty.appendLedgerEntry).toHaveBeenCalledWith(
      {
        customerId,
        deltaPoints: -100,
        reason: 'redeem_FREE_DRINK',
        referenceType: 'reward_catalog',
        referenceId: rewardCatalogId,
      },
      tx,
    );
    expect(tx.rewardsPointsLedger.create).not.toHaveBeenCalled();
    expect(callOrder.indexOf('lockLoyalty')).toBeLessThan(
      callOrder.indexOf('userRewardLookup'),
    );
    expect(callOrder.indexOf('userRewardLookup')).toBeLessThan(
      callOrder.indexOf('loyaltyDebit'),
    );
    expect(callOrder.indexOf('loyaltyDebit')).toBeLessThan(
      callOrder.indexOf('userRewardCreate'),
    );
  });

  it('rejects when LoyaltyWallet has insufficient points', async () => {
    loyalty.appendLedgerEntry.mockRejectedValue(
      new BadRequestException({
        code: 'LOYALTY_INSUFFICIENT_POINTS',
        message: 'Adjustment would result in negative balance',
      }),
    );

    await expect(
      service.redeemRewardByPoints(
        customerId,
        rewardCatalogId,
        'idem-reward-2',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.userReward.create).not.toHaveBeenCalled();
  });

  it('returns idempotent after the loyalty lock when already redeemed', async () => {
    const existing = {
      id: 'existing-reward',
      customerId,
      rewardCatalogId,
      status: 'REDEEMED',
    };
    tx.userReward.findFirst.mockImplementation(async () => {
      callOrder.push('userRewardLookup');
      return existing;
    });

    const result = await service.redeemRewardByPoints(
      customerId,
      rewardCatalogId,
      'idem-reward-3',
    );

    expect(result).toEqual({ idempotent: true, userReward: existing });
    expect(callOrder).toEqual(['lockLoyalty', 'userRewardLookup']);
    expect(loyalty.appendLedgerEntry).not.toHaveBeenCalled();
    expect(tx.userReward.create).not.toHaveBeenCalled();
  });

  it('exposes LoyaltyWallet balance as pointsBalance on getMemberWalletAndRewards', async () => {
    jest
      .spyOn(
        service as unknown as {
          ensureUserWalletBalance: (id: string) => Promise<{
            id: string;
            customerId: string;
            walletBalance: number;
            pointsBalance: number;
          }>;
        },
        'ensureUserWalletBalance',
      )
      .mockResolvedValue({
        id: walletId,
        customerId,
        walletBalance: 25,
        pointsBalance: 0,
      });

    const result = await service.getMemberWalletAndRewards(customerId);
    expect(result.wallet.pointsBalance).toBe(250);
    expect(result.wallet.walletBalance).toBe(25);
    expect(loyalty.getWalletSummary).toHaveBeenCalledWith(customerId);
  });
});
