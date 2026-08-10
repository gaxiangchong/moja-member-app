import { BadRequestException } from '@nestjs/common';
import { WalletTxnFlowType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RewardsWorkflowService } from './rewards-workflow.service';

describe('RewardsWorkflowService balance locking', () => {
  const customerId = '11111111-1111-4111-8111-111111111111';
  const rewardCatalogId = '22222222-2222-4222-8222-222222222222';
  const walletId = '33333333-3333-4333-8333-333333333333';
  const giftId = '44444444-4444-4444-8444-444444444444';

  let callOrder: string[];
  let tx: {
    giftVoucherCode: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    rewardCatalog: { findUnique: jest.Mock };
    userReward: { findFirst: jest.Mock; create: jest.Mock };
    userWalletBalance: {
      upsert: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
    };
    rewardsPointsLedger: { create: jest.Mock };
    walletTransaction: { create: jest.Mock };
    voucherCampaign: { findUnique: jest.Mock };
    voucher: { create: jest.Mock };
    $queryRaw: jest.Mock;
  };
  let prisma: {
    walletTransaction: { findUnique: jest.Mock };
    userReward: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: RewardsWorkflowService;

  beforeEach(() => {
    callOrder = [];
    tx = {
      giftVoucherCode: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
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
        upsert: jest.fn().mockImplementation(async () => {
          callOrder.push('walletUpsert');
          return {
            id: walletId,
            customerId,
            walletBalance: 0,
            pointsBalance: 100,
          };
        }),
        findUniqueOrThrow: jest.fn().mockImplementation(async () => {
          callOrder.push('walletRead');
          return {
            id: walletId,
            customerId,
            walletBalance: 500,
            pointsBalance: 100,
          };
        }),
        update: jest.fn().mockImplementation(async () => {
          callOrder.push('walletUpdate');
          return {};
        }),
      },
      rewardsPointsLedger: {
        create: jest.fn().mockImplementation(async () => {
          callOrder.push('pointsLedger');
          return {};
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
      $queryRaw: jest.fn().mockImplementation(async (strings: TemplateStringsArray) => {
        const sql = strings.join(' ');
        if (sql.includes('gift_voucher_codes')) {
          callOrder.push('lockGift');
        } else if (sql.includes('user_wallet_balance')) {
          callOrder.push('lockWallet');
        } else {
          callOrder.push('lockOther');
        }
        return [{ id: walletId }];
      }),
    };
    prisma = {
      walletTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      userReward: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    service = new RewardsWorkflowService(prisma as unknown as PrismaService);
  });

  describe('redeemRewardByPoints', () => {
    it('locks the wallet before reading points or creating the redemption', async () => {
      const result = await service.redeemRewardByPoints(
        customerId,
        rewardCatalogId,
        'idem-reward-1',
      );

      expect(result.idempotent).toBe(false);
      expect(callOrder.indexOf('lockWallet')).toBeGreaterThanOrEqual(0);
      expect(callOrder.indexOf('lockWallet')).toBeLessThan(
        callOrder.indexOf('userRewardLookup'),
      );
      expect(callOrder.indexOf('lockWallet')).toBeLessThan(
        callOrder.indexOf('walletRead'),
      );
      expect(callOrder.indexOf('walletRead')).toBeLessThan(
        callOrder.indexOf('pointsLedger'),
      );
      expect(tx.userWalletBalance.update).toHaveBeenCalledWith({
        where: { id: walletId },
        data: { pointsBalance: 0 },
      });
    });

    it('rejects insufficient points using the locked wallet balance', async () => {
      tx.userWalletBalance.findUniqueOrThrow.mockResolvedValue({
        id: walletId,
        customerId,
        walletBalance: 0,
        pointsBalance: 50,
      });

      await expect(
        service.redeemRewardByPoints(
          customerId,
          rewardCatalogId,
          'idem-reward-2',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.rewardsPointsLedger.create).not.toHaveBeenCalled();
      expect(tx.userReward.create).not.toHaveBeenCalled();
    });

    it('returns idempotent after the lock when the reward was already redeemed', async () => {
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
      expect(callOrder).toEqual([
        'walletUpsert',
        'lockWallet',
        'userRewardLookup',
      ]);
      expect(tx.rewardsPointsLedger.create).not.toHaveBeenCalled();
    });
  });

  describe('redeemGiftVoucherCode', () => {
    beforeEach(() => {
      tx.giftVoucherCode.findUnique.mockImplementation(async () => {
        callOrder.push('giftRead');
        return {
          id: giftId,
          code: 'GIFT100',
          amount: 1000,
          status: 'ACTIVE',
          expiresAt: null,
          redeemedCount: 0,
          maxRedemptions: 1,
        };
      });
    });

    it('locks the gift code and wallet before crediting walletBalance', async () => {
      const result = await service.redeemGiftVoucherCode(
        customerId,
        'gift100',
        'idem-gift-1',
      );

      expect(result.idempotent).toBe(false);
      expect(callOrder.indexOf('lockGift')).toBeLessThan(
        callOrder.indexOf('giftRead'),
      );
      expect(callOrder.indexOf('lockWallet')).toBeGreaterThan(
        callOrder.indexOf('giftRead'),
      );
      expect(callOrder.indexOf('lockWallet')).toBeLessThan(
        callOrder.indexOf('walletRead'),
      );
      expect(callOrder.indexOf('walletRead')).toBeLessThan(
        callOrder.indexOf('walletTxn'),
      );
      expect(tx.walletTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: WalletTxnFlowType.GIFT_CODE_CREDIT,
          amount: 1000,
          balanceBefore: 500,
          balanceAfter: 1500,
        }),
      });
      expect(tx.userWalletBalance.update).toHaveBeenCalledWith({
        where: { id: walletId },
        data: { walletBalance: 1500 },
      });
    });

    it('rejects a fully redeemed gift code after the gift-code lock', async () => {
      tx.giftVoucherCode.findUnique.mockResolvedValue({
        id: giftId,
        code: 'GIFT100',
        amount: 1000,
        status: 'ACTIVE',
        expiresAt: null,
        redeemedCount: 1,
        maxRedemptions: 1,
      });

      await expect(
        service.redeemGiftVoucherCode(customerId, 'GIFT100', 'idem-gift-2'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(tx.walletTransaction.create).not.toHaveBeenCalled();
      expect(tx.userWalletBalance.update).not.toHaveBeenCalled();
    });
  });
});
