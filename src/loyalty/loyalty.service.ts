import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tierForPoints } from './member-tier';

@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureWallet(customerId: string): Promise<void> {
    await this.prisma.loyaltyWallet.upsert({
      where: { customerId },
      create: { customerId, pointsCached: 0 },
      update: {},
    });
  }

  async getWalletSummary(customerId: string): Promise<{
    /** Spendable points. */
    pointsBalance: number;
    /** Everything ever earned; the membership tier is judged on this. */
    lifetimeEarnedPoints: number;
    walletId: string;
  }> {
    const wallet = await this.prisma.loyaltyWallet.findUnique({
      where: { customerId },
    });
    if (!wallet) {
      return { pointsBalance: 0, lifetimeEarnedPoints: 0, walletId: '' };
    }
    return {
      pointsBalance: wallet.pointsCached,
      lifetimeEarnedPoints: wallet.lifetimeEarnedPoints,
      walletId: wallet.id,
    };
  }

  /**
   * All point changes must go through the ledger; wallet cache is updated in
   * the same transaction. Optionally accepts an existing Prisma transaction
   * client so callers (e.g. order finalization) can perform the credit
   * atomically with their own work — see `CustomersService.finalizeShopOrderAfterPayment`.
   */
  async appendLedgerEntry(
    params: {
      customerId: string;
      deltaPoints: number;
      reason: string;
      referenceType?: string | null;
      referenceId?: string | null;
    },
    txClient?: Prisma.TransactionClient,
  ): Promise<{ balanceAfter: number }> {
    if (params.deltaPoints === 0) {
      throw new BadRequestException({
        code: 'LOYALTY_NOOP',
        message: 'deltaPoints must be non-zero',
      });
    }

    if (txClient) {
      return this.appendInTx(txClient, params);
    }

    return this.prisma.$transaction((tx) => this.appendInTx(tx, params));
  }

  private async appendInTx(
    tx: Prisma.TransactionClient,
    params: {
      customerId: string;
      deltaPoints: number;
      reason: string;
      referenceType?: string | null;
      referenceId?: string | null;
      /**
       * Overrides how this entry changes lifetime earnings. A cancelled
       * purchase passes a negative number so the tier falls with the points.
       * Omit it for the normal rule (positive, non-refund entries count).
       */
      lifetimeEarnedDelta?: number;
    },
  ): Promise<{ balanceAfter: number; lifetimeEarnedAfter: number }> {
    await this.ensureWalletInTx(tx, params.customerId);
    // One change to a balance at a time: without the lock two simultaneous
    // redemptions both read the same balance and both succeed.
    await tx.$queryRaw`SELECT id FROM loyalty_wallets WHERE customer_id = ${params.customerId}::uuid FOR UPDATE`;
    const wallet = await tx.loyaltyWallet.findUniqueOrThrow({
      where: { customerId: params.customerId },
    });
    const balanceAfter = wallet.pointsCached + params.deltaPoints;
    if (balanceAfter < 0) {
      throw new BadRequestException({
        code: 'LOYALTY_INSUFFICIENT_POINTS',
        message: 'Adjustment would result in negative balance',
      });
    }

    await tx.loyaltyLedgerEntry.create({
      data: {
        customerId: params.customerId,
        deltaPoints: params.deltaPoints,
        balanceAfter,
        reason: params.reason,
        referenceType: params.referenceType ?? null,
        referenceId: params.referenceId ?? null,
      },
    });

    // Only genuinely earned points count towards the tier: a returned reward
    // (refund_...) is the member's own points coming back, not new earnings.
    // A cancelled purchase passes lifetimeEarnedDelta < 0 so the tier falls too.
    const earned =
      params.lifetimeEarnedDelta !== undefined
        ? params.lifetimeEarnedDelta
        : params.deltaPoints > 0 && !params.reason.startsWith('refund_')
          ? params.deltaPoints
          : 0;
    const lifetimeEarnedAfter = Math.max(
      0,
      (wallet.lifetimeEarnedPoints ?? 0) + earned,
    );
    await tx.loyaltyWallet.update({
      where: { customerId: params.customerId },
      data: {
        pointsCached: balanceAfter,
        ...(earned !== 0 ? { lifetimeEarnedPoints: lifetimeEarnedAfter } : {}),
      },
    });

    // Tier follows lifetime earnings, so every earn keeps `member_tier` current for admin filters, mailers, and segments.
    await tx.customer.update({
      where: { id: params.customerId },
      data: { memberTier: tierForPoints(lifetimeEarnedAfter) },
    });

    return { balanceAfter, lifetimeEarnedAfter };
  }

  /**
   * Takes the points for a reward redeemed on an order, in one transaction with
   * marking the order — so points never leave without the order recording what
   * they bought, and two simultaneous redemptions cannot both spend the same
   * points. Throws `LOYALTY_INSUFFICIENT_POINTS` when the balance is short.
   */
  async redeemRewardForOrder(params: {
    customerId: string;
    orderId: string;
    rewardId: string;
    title: string;
    points: number;
  }): Promise<{ balanceAfter: number }> {
    if (!Number.isInteger(params.points) || params.points <= 0) {
      throw new BadRequestException({
        code: 'LOYALTY_NOOP',
        message: 'points must be a positive integer',
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.customerOrder.updateMany({
        where: {
          id: params.orderId,
          customerId: params.customerId,
          rewardPointsSpent: 0,
        },
        data: {
          rewardId: params.rewardId.slice(0, 64),
          rewardTitle: params.title.slice(0, 200),
          rewardPointsSpent: params.points,
        },
      });
      if (claimed.count === 0) {
        throw new BadRequestException({
          code: 'REWARD_ALREADY_APPLIED',
          message: 'A reward is already applied to this order.',
        });
      }
      return this.appendInTx(tx, {
        customerId: params.customerId,
        deltaPoints: -params.points,
        reason: `checkout_redeem_${params.rewardId}`,
        referenceType: 'customer_order',
        referenceId: params.orderId,
      });
    });
  }

  /**
   * Gives back the points a reward cost when its order is cancelled, refunded
   * or never paid. Safe to call from any path, any number of times: the order
   * is claimed first, so the points come back at most once. Returns how many
   * points were returned (0 when there was nothing to return).
   */
  async refundRewardForOrder(orderId: string): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.customerOrder.updateMany({
        where: {
          id: orderId,
          rewardPointsSpent: { gt: 0 },
          rewardPointsRefundedAt: null,
        },
        data: { rewardPointsRefundedAt: new Date() },
      });
      if (claimed.count === 0) return 0;
      const order = await tx.customerOrder.findUniqueOrThrow({
        where: { id: orderId },
        select: {
          customerId: true,
          rewardId: true,
          rewardPointsSpent: true,
        },
      });
      await this.appendInTx(tx, {
        customerId: order.customerId,
        deltaPoints: order.rewardPointsSpent,
        reason: `refund_checkout_redeem_${order.rewardId ?? ''}`,
        referenceType: 'customer_order',
        referenceId: orderId,
      });
      return order.rewardPointsSpent;
    });
  }

  /**
   * Takes back the purchase points an order earned, and the lifetime total
   * those points added, when the order is cancelled or refunded.
   *
   * Paying with wallet credits returns the money on cancel. Without this, a
   * member can place that order, earn points (and a higher tier), spend the
   * points, and cancel to get the credits back — then repeat.
   *
   * Refuses when those points are no longer in the wallet, so the cancel does
   * not go through until the redemption that spent them is undone. Safe to
   * call more than once: a second call finds the clawback and does nothing.
   * Returns how many points were taken back (0 when the order earned none).
   */
  async clawbackOrderPurchasePoints(
    orderId: string,
    txClient?: Prisma.TransactionClient,
  ): Promise<number> {
    const run = (tx: Prisma.TransactionClient) =>
      this.clawbackOrderPurchasePointsInTx(tx, orderId);
    if (txClient) return run(txClient);
    return this.prisma.$transaction(run);
  }

  private async clawbackOrderPurchasePointsInTx(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<number> {
    const earned = await tx.loyaltyLedgerEntry.findFirst({
      where: {
        referenceType: 'customer_order',
        referenceId: orderId,
        reason: 'shop_order_purchase',
        deltaPoints: { gt: 0 },
      },
    });
    if (!earned || earned.deltaPoints <= 0) return 0;

    // Hold the wallet before the idempotency check so two cancels cannot both
    // pass it and take the points twice.
    await tx.$queryRaw`SELECT id FROM loyalty_wallets WHERE customer_id = ${earned.customerId}::uuid FOR UPDATE`;
    const already = await tx.loyaltyLedgerEntry.findFirst({
      where: {
        referenceType: 'customer_order',
        referenceId: orderId,
        reason: 'clawback_shop_order_purchase',
      },
    });
    if (already) return 0;

    const wallet = await tx.loyaltyWallet.findUniqueOrThrow({
      where: { customerId: earned.customerId },
    });
    if (wallet.pointsCached < earned.deltaPoints) {
      throw new BadRequestException({
        code: 'ORDER_POINTS_ALREADY_SPENT',
        message:
          'The points from this order have already been used. Undo that redemption before cancelling, or contact us.',
      });
    }

    await this.appendInTx(tx, {
      customerId: earned.customerId,
      deltaPoints: -earned.deltaPoints,
      reason: 'clawback_shop_order_purchase',
      referenceType: 'customer_order',
      referenceId: orderId,
      lifetimeEarnedDelta: -earned.deltaPoints,
    });
    return earned.deltaPoints;
  }

  private async ensureWalletInTx(
    tx: Prisma.TransactionClient,
    customerId: string,
  ): Promise<void> {
    await tx.loyaltyWallet.upsert({
      where: { customerId },
      create: { customerId, pointsCached: 0 },
      update: {},
    });
  }
}
