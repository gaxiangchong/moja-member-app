import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  VoucherLifecycleStatus,
  VoucherOrderType,
  VoucherRedemptionStatus,
  WalletTxnFlowType,
} from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

type VoucherValidationInput = {
  customerId: string;
  voucherId: string;
  orderTotalCents: number;
  orderType?: string | null;
  productIds?: string[];
  categories?: string[];
  idempotencyKey: string;
};

type VoucherDiscountInput = {
  lockToken: string;
  subtotalCents: number;
};

@Injectable()
export class RewardsWorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  async getMemberWalletAndRewards(customerId: string) {
    const wallet = await this.ensureUserWalletBalance(customerId);
    const [vouchers, rewards] = await this.prisma.$transaction([
      this.prisma.voucher.findMany({
        where: { customerId },
        orderBy: [{ updatedAt: 'desc' }],
      }),
      this.prisma.userReward.findMany({
        where: { customerId },
        include: { rewardCatalog: true, voucher: true },
        orderBy: [{ createdAt: 'desc' }],
      }),
    ]);
    return { wallet, vouchers, rewards };
  }

  async redeemGiftVoucherCode(
    customerId: string,
    codeRaw: string,
    idempotencyKey: string,
  ) {
    const code = codeRaw.trim().toUpperCase();
    if (!code) throw new BadRequestException('Gift code is required.');

    const existing = await this.prisma.walletTransaction.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      return { idempotent: true as const, transaction: existing };
    }

    return this.prisma.$transaction(async (tx) => {
      const gift = await tx.giftVoucherCode.findUnique({ where: { code } });
      if (!gift) throw new NotFoundException('Gift voucher code not found.');
      if (gift.status !== 'ACTIVE') {
        throw new BadRequestException('Gift voucher is no longer active.');
      }
      if (gift.expiresAt && gift.expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException('Gift voucher code is expired.');
      }
      if (gift.redeemedCount >= gift.maxRedemptions) {
        throw new BadRequestException('Gift voucher redemption limit reached.');
      }

      const wallet = await this.ensureUserWalletBalance(customerId, tx);
      const before = wallet.walletBalance;
      const after = before + gift.amount;
      const transaction = await tx.walletTransaction.create({
        data: {
          customerId,
          userWalletBalanceId: wallet.id,
          type: WalletTxnFlowType.GIFT_CODE_CREDIT,
          amount: gift.amount,
          balanceBefore: before,
          balanceAfter: after,
          referenceType: 'gift_voucher_code',
          referenceId: gift.id,
          idempotencyKey,
          metadata: { code: gift.code },
        },
      });

      await tx.userWalletBalance.update({
        where: { id: wallet.id },
        data: { walletBalance: after },
      });

      await tx.giftVoucherCode.update({
        where: { id: gift.id },
        data: {
          redeemedCount: { increment: 1 },
          redeemedByCustomerId: customerId,
          redeemedAt: new Date(),
          ...(gift.redeemedCount + 1 >= gift.maxRedemptions
            ? { status: 'REDEEMED' }
            : {}),
        },
      });
      return { idempotent: false as const, transaction };
    });
  }

  async redeemRewardByPoints(
    customerId: string,
    rewardCatalogId: string,
    idempotencyKey: string,
  ) {
    const existing = await this.prisma.userReward.findFirst({
      where: {
        customerId,
        rewardCatalogId,
        status: 'REDEEMED',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return { idempotent: true as const, userReward: existing };

    return this.prisma.$transaction(async (tx) => {
      const reward = await tx.rewardCatalog.findUnique({
        where: { id: rewardCatalogId },
      });
      if (!reward || !reward.isActive) {
        throw new NotFoundException('Reward not found.');
      }
      const now = Date.now();
      if (reward.startsAt && reward.startsAt.getTime() > now) {
        throw new BadRequestException('Reward is not active yet.');
      }
      if (reward.endsAt && reward.endsAt.getTime() <= now) {
        throw new BadRequestException('Reward has ended.');
      }

      const wallet = await this.ensureUserWalletBalance(customerId, tx);
      if (wallet.pointsBalance < reward.pointsCost) {
        throw new BadRequestException('Insufficient points.');
      }

      const pointsBefore = wallet.pointsBalance;
      const pointsAfter = pointsBefore - reward.pointsCost;
      await tx.rewardsPointsLedger.create({
        data: {
          customerId,
          userWalletBalanceId: wallet.id,
          pointsDelta: -reward.pointsCost,
          pointsBefore,
          pointsAfter,
          referenceType: 'reward_redeem',
          referenceId: reward.id,
          reason: `redeem_${reward.code}`,
        },
      });
      await tx.userWalletBalance.update({
        where: { id: wallet.id },
        data: { pointsBalance: pointsAfter },
      });

      let voucherId: string | null = null;
      if (reward.voucherCampaignId) {
        const campaign = await tx.voucherCampaign.findUnique({
          where: { id: reward.voucherCampaignId },
        });
        const prefix = campaign?.codePrefix ?? 'RV';
        const shortId = randomBytes(3).toString('hex').toUpperCase().slice(0, 5);
        const generatedCode = `${prefix}-${shortId}`;
        const expiresAt = campaign?.voucherValidDays
          ? new Date(Date.now() + campaign.voucherValidDays * 86_400_000)
          : null;
        const voucher = await tx.voucher.create({
          data: {
            customerId,
            voucherCampaignId: reward.voucherCampaignId,
            code: generatedCode,
            name: reward.name,
            status: VoucherLifecycleStatus.ACTIVE,
            expiresAt,
            usageLimitPerUser: campaign?.usageLimitPerUser ?? null,
            visibleInWallet: true,
          },
        });
        voucherId = voucher.id;
      }

      const userReward = await tx.userReward.create({
        data: {
          customerId,
          rewardCatalogId: reward.id,
          status: 'REDEEMED',
          redeemedAt: new Date(),
          voucherId,
        },
      });

      await tx.walletTransaction.create({
        data: {
          customerId,
          userWalletBalanceId: wallet.id,
          type: WalletTxnFlowType.MANUAL_ADJUSTMENT,
          amount: 0,
          balanceBefore: wallet.walletBalance,
          balanceAfter: wallet.walletBalance,
          referenceType: 'reward_redeem',
          referenceId: userReward.id,
          idempotencyKey,
          metadata: { pointsSpent: reward.pointsCost, rewardCode: reward.code },
        },
      });
      return { idempotent: false as const, userReward };
    });
  }

  async validateAndLockVoucher(input: VoucherValidationInput) {
    const now = Date.now();
    return this.prisma.$transaction(async (tx) => {
      const voucher = await tx.voucher.findFirst({
        where: {
          id: input.voucherId,
          customerId: input.customerId,
        },
        include: { voucherCampaign: true },
      });
      if (!voucher) throw new NotFoundException('Voucher not found.');
      if (voucher.status === VoucherLifecycleStatus.USED) {
        throw new BadRequestException('Voucher is already used.');
      }
      if (voucher.status === VoucherLifecycleStatus.EXPIRED) {
        throw new BadRequestException('Voucher is expired.');
      }
      if (voucher.expiresAt && voucher.expiresAt.getTime() <= now) {
        throw new BadRequestException('Voucher is expired.');
      }
      const validFromRaw = (voucher.metadata as { validFrom?: string } | null)
        ?.validFrom;
      if (validFromRaw) {
        const validFrom = new Date(validFromRaw);
        if (!Number.isNaN(validFrom.getTime()) && validFrom.getTime() > now) {
          throw new BadRequestException(
            `This voucher can be used from ${validFrom.toISOString().slice(0, 10)}.`,
          );
        }
      }
      if (
        voucher.status === VoucherLifecycleStatus.LOCKED &&
        voucher.lockExpiresAt &&
        voucher.lockExpiresAt.getTime() > now
      ) {
        throw new BadRequestException(
          'Voucher is currently locked by another checkout.',
        );
      }

      const c = voucher.voucherCampaign;
      if (c?.minSpend && input.orderTotalCents < c.minSpend) {
        throw new BadRequestException(
          'Order does not meet voucher minimum spend.',
        );
      }
      if (c?.applicableOrderTypes?.length && input.orderType) {
        const normalized = input.orderType
          .trim()
          .toUpperCase() as VoucherOrderType;
        if (!c.applicableOrderTypes.includes(normalized)) {
          throw new BadRequestException(
            'Voucher is not valid for this fulfillment type.',
          );
        }
      }
      if (c?.applicableProductIds?.length && input.productIds?.length) {
        const intersects = input.productIds.some((p) =>
          c.applicableProductIds.includes(p),
        );
        if (!intersects) {
          throw new BadRequestException(
            'Voucher is not valid for current products.',
          );
        }
      }
      if (c?.applicableCategories?.length && input.categories?.length) {
        const intersects = input.categories.some((category) =>
          c.applicableCategories.includes(category),
        );
        if (!intersects) {
          throw new BadRequestException(
            'Voucher is not valid for current categories.',
          );
        }
      }

      if (c?.usageLimitPerUser && voucher.usageCount >= c.usageLimitPerUser) {
        throw new BadRequestException('Voucher usage limit reached.');
      }
      if (c?.totalRedemptionCap) {
        const redeemedCount = await tx.voucherRedemption.count({
          where: {
            voucher: { voucherCampaignId: c.id },
            status: VoucherRedemptionStatus.CONFIRMED,
          },
        });
        if (redeemedCount >= c.totalRedemptionCap) {
          throw new BadRequestException('Campaign redemption cap reached.');
        }
      }

      const lockToken = randomUUID();
      const lockExpiresAt = new Date(Date.now() + 15 * 60_000);
      const lockRes = await tx.voucher.updateMany({
        where: {
          id: voucher.id,
          customerId: input.customerId,
          OR: [
            { status: VoucherLifecycleStatus.ACTIVE },
            {
              status: VoucherLifecycleStatus.LOCKED,
              lockExpiresAt: { lt: new Date() },
            },
          ],
        },
        data: {
          status: VoucherLifecycleStatus.LOCKED,
          lockToken,
          lockedAt: new Date(),
          lockExpiresAt,
        },
      });
      if (lockRes.count === 0) {
        throw new BadRequestException('Unable to lock voucher for checkout.');
      }

      const redemption = await tx.voucherRedemption.create({
        data: {
          voucherId: voucher.id,
          customerId: input.customerId,
          status: VoucherRedemptionStatus.LOCKED,
          lockToken,
          idempotencyKey: input.idempotencyKey,
          metadata: {
            orderTotalCents: input.orderTotalCents,
            orderType: input.orderType ?? null,
          },
        },
      });
      return {
        lockToken,
        voucherId: voucher.id,
        redemptionId: redemption.id,
        lockExpiresAt,
      };
    });
  }

  async computeLockedVoucherDiscount(
    input: VoucherDiscountInput,
  ): Promise<number> {
    if (!input.lockToken) return 0;
    if (!Number.isInteger(input.subtotalCents) || input.subtotalCents < 0)
      return 0;
    const row = await this.prisma.voucher.findFirst({
      where: {
        lockToken: input.lockToken,
        status: VoucherLifecycleStatus.LOCKED,
      },
      include: { voucherCampaign: true },
    });
    if (!row?.voucherCampaign) return 0;
    const c = row.voucherCampaign;
    let discount = 0;
    if (c.voucherType === 'PERCENTAGE') {
      const pct = Math.max(0, Math.min(c.percentageOff ?? 0, 100));
      discount = Math.floor((input.subtotalCents * pct) / 100);
    } else if (c.voucherType === 'FIXED_AMOUNT') {
      discount = Math.max(0, c.fixedAmountOff ?? 0);
    } else if (c.voucherType === 'DELIVERY_DISCOUNT') {
      discount = Math.max(0, c.deliveryDiscountAmount ?? 0);
    } else if (c.voucherType === 'WALLET_TOPUP_CODE') {
      discount = 0;
    } else if (c.voucherType === 'FREE_ITEM') {
      discount = 0;
    }
    return Math.max(0, Math.min(discount, input.subtotalCents));
  }

  async finalizeVoucherRedemption(
    lockToken: string,
    orderId: string,
    paymentIntentId?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const voucher = await tx.voucher.findFirst({ where: { lockToken } });
      if (!voucher) return null;
      if (voucher.status === VoucherLifecycleStatus.USED) return voucher;

      await tx.voucher.update({
        where: { id: voucher.id },
        data: {
          status: VoucherLifecycleStatus.USED,
          usageCount: { increment: 1 },
          usedAt: new Date(),
          lockToken: null,
          lockedAt: null,
          lockExpiresAt: null,
          lockOrderId: orderId,
        },
      });

      await tx.voucherRedemption.updateMany({
        where: { lockToken, status: VoucherRedemptionStatus.LOCKED },
        data: {
          status: VoucherRedemptionStatus.CONFIRMED,
          confirmedAt: new Date(),
          orderId,
          paymentIntentId: paymentIntentId ?? null,
        },
      });
      return voucher;
    });
  }

  async releaseVoucherLock(lockToken: string) {
    if (!lockToken) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.voucher.updateMany({
        where: { lockToken, status: VoucherLifecycleStatus.LOCKED },
        data: {
          status: VoucherLifecycleStatus.ACTIVE,
          lockToken: null,
          lockedAt: null,
          lockExpiresAt: null,
        },
      });
      await tx.voucherRedemption.updateMany({
        where: { lockToken, status: VoucherRedemptionStatus.LOCKED },
        data: {
          status: VoucherRedemptionStatus.RELEASED,
          releasedAt: new Date(),
        },
      });
    });
  }

  private async ensureUserWalletBalance(
    customerId: string,
    prisma: Pick<PrismaService, 'userWalletBalance'> = this.prisma,
  ) {
    return prisma.userWalletBalance.upsert({
      where: { customerId },
      create: { customerId },
      update: {},
    });
  }
}
