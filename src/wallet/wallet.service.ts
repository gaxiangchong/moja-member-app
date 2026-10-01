import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, WalletTxnType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureWallet(customerId: string): Promise<void> {
    await this.prisma.storedWallet.upsert({
      where: { customerId },
      create: { customerId },
      update: {},
    });
  }

  async getSummary(customerId: string) {
    await this.ensureWallet(customerId);
    const wallet = await this.prisma.storedWallet.findUniqueOrThrow({
      where: { customerId },
    });
    return {
      walletId: wallet.id,
      customerId: wallet.customerId,
      currentWalletBalance: wallet.balanceCents,
      lifetimeTopUpAmount: wallet.lifetimeTopUpCents,
      lifetimeSpentAmount: wallet.lifetimeSpentCents,
      manualAdjustmentTotal: wallet.manualAdjustmentCents,
      promotionalCreditTotal: wallet.promotionalCreditCents,
      pendingCredit: wallet.pendingCreditCents,
      isFrozen: wallet.isFrozen,
      updatedAt: wallet.updatedAt,
    };
  }

  async listLedger(customerId: string, limit = 50) {
    const take = Math.min(Math.max(limit, 1), 200);
    await this.ensureWallet(customerId);
    return this.prisma.storedWalletLedgerEntry.findMany({
      where: { customerId },
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  async listLedgerGlobal(limit = 50, customerId?: string) {
    const take = Math.min(Math.max(limit, 1), 200);
    return this.prisma.storedWalletLedgerEntry.findMany({
      where: customerId ? { customerId } : undefined,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: {
          select: {
            phoneE164: true,
          },
        },
      },
    });
  }

  async setFreeze(customerId: string, isFrozen: boolean) {
    await this.ensureWallet(customerId);
    return this.prisma.storedWallet.update({
      where: { customerId },
      data: { isFrozen },
    });
  }

  async appendTransaction(params: {
    customerId: string;
    type: WalletTxnType;
    amountCents: number;
    reason: string;
    createdByType: 'admin' | 'customer' | 'system';
    createdBy?: string | null;
    metadata?: Prisma.InputJsonValue;
    allowWhenFrozen?: boolean;
    countLifetimeSpend?: boolean;
  }) {
    if (!Number.isInteger(params.amountCents) || params.amountCents === 0) {
      throw new BadRequestException({
        code: 'WALLET_INVALID_AMOUNT',
        message: 'amountCents must be a non-zero integer',
      });
    }

    return this.prisma.$transaction((tx) =>
      this.appendTransactionInTx(tx, params),
    );
  }

  /**
   * Same as {@link appendTransaction}, but inside the caller's transaction, so
   * several entries (a top-up and its bonus) commit together or not at all.
   */
  appendTransactionWithin(
    tx: Prisma.TransactionClient,
    params: Parameters<WalletService['appendTransaction']>[0],
  ) {
    return this.appendTransactionInTx(tx, params);
  }

  /**
   * Pays a pending shop order with wallet credits: debits the wallet and marks
   * the order, in one transaction, so credits can never leave the wallet
   * without the order recording it (or the other way round). The order must
   * still be awaiting payment and belong to this member.
   */
  async payOrderWithCredits(params: {
    customerId: string;
    orderId: string;
    amountCents: number;
  }) {
    if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
      throw new BadRequestException({
        code: 'WALLET_INVALID_AMOUNT',
        message: 'amountCents must be a positive integer',
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const marked = await tx.customerOrder.updateMany({
        where: {
          id: params.orderId,
          customerId: params.customerId,
          status: 'pending_payment',
          paidWithCreditsCents: 0,
          totalCents: params.amountCents,
        },
        data: { paidWithCreditsCents: params.amountCents },
      });
      if (marked.count === 0) {
        throw new BadRequestException({
          code: 'ORDER_NOT_PAYABLE',
          message: 'This order can no longer be paid with credits.',
        });
      }
      const order = await tx.customerOrder.findUniqueOrThrow({
        where: { id: params.orderId },
        select: { orderNumber: true },
      });
      return this.appendTransactionInTx(tx, {
        customerId: params.customerId,
        type: WalletTxnType.SPEND,
        amountCents: -params.amountCents,
        reason: `Shop order #${order.orderNumber}`,
        createdByType: 'customer',
        createdBy: params.customerId,
        // Placing the order adds its total to lifetime spend; don't add it twice.
        countLifetimeSpend: false,
        metadata: {
          orderId: params.orderId,
          orderNumber: order.orderNumber,
          kind: 'shop_order_payment',
        },
      });
    });
  }

  /**
   * Gives back the credits an order was paid with (cancelled or refunded).
   * Safe to call any number of times and from any path: the order row is
   * claimed first, so the wallet is credited at most once. Returns the amount
   * returned, or 0 when there was nothing to return.
   */
  async refundOrderCredits(
    orderId: string,
    reason = 'Order cancelled',
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.customerOrder.updateMany({
        where: {
          id: orderId,
          paidWithCreditsCents: { gt: 0 },
          creditsRefundedAt: null,
        },
        data: { creditsRefundedAt: new Date() },
      });
      if (claimed.count === 0) return 0;
      const order = await tx.customerOrder.findUniqueOrThrow({
        where: { id: orderId },
        select: {
          customerId: true,
          orderNumber: true,
          paidWithCreditsCents: true,
        },
      });
      await this.appendTransactionInTx(tx, {
        customerId: order.customerId,
        type: WalletTxnType.REFUND,
        amountCents: order.paidWithCreditsCents,
        reason: `${reason} — order #${order.orderNumber}`,
        createdByType: 'system',
        // A frozen wallet must still get the member's own money back.
        allowWhenFrozen: true,
        metadata: {
          orderId,
          orderNumber: order.orderNumber,
          kind: 'shop_order_credit_refund',
        },
      });
      return order.paidWithCreditsCents;
    });
  }

  async reverseTransaction(params: {
    customerId: string;
    transactionId: string;
    reason: string;
    createdByType: 'admin' | 'system';
    createdBy?: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this.ensureWalletInTx(tx, params.customerId);
      const original = await tx.storedWalletLedgerEntry.findFirst({
        where: { id: params.transactionId, customerId: params.customerId },
      });
      if (!original) {
        throw new BadRequestException({
          code: 'WALLET_TXN_NOT_FOUND',
          message: 'Transaction not found',
        });
      }
      if (original.type === WalletTxnType.REVERSAL) {
        throw new BadRequestException({
          code: 'WALLET_CANNOT_REVERSE_REVERSAL',
          message: 'Cannot reverse a reversal transaction',
        });
      }
      const alreadyReversed = await tx.storedWalletLedgerEntry.findFirst({
        where: {
          customerId: params.customerId,
          type: WalletTxnType.REVERSAL,
          metadata: {
            path: ['reversesTransactionId'],
            equals: params.transactionId,
          },
        },
      });
      if (alreadyReversed) {
        throw new BadRequestException({
          code: 'WALLET_ALREADY_REVERSED',
          message: 'This transaction has already been reversed',
        });
      }

      const reversal = await this.appendTransactionInTx(tx, {
        customerId: params.customerId,
        type: WalletTxnType.REVERSAL,
        amountCents: -original.amountCents,
        reason: params.reason,
        createdByType: params.createdByType,
        createdBy: params.createdBy ?? null,
        metadata: {
          reversesTransactionId: original.id,
          originalType: original.type,
        },
        allowWhenFrozen: true,
      });

      return { original, reversal };
    });
  }

  private async ensureWalletInTx(
    tx: Prisma.TransactionClient,
    customerId: string,
  ): Promise<void> {
    await tx.storedWallet.upsert({
      where: { customerId },
      create: { customerId },
      update: {},
    });
  }

  private async appendTransactionInTx(
    tx: Prisma.TransactionClient,
    params: {
      customerId: string;
      type: WalletTxnType;
      amountCents: number;
      reason: string;
      createdByType: 'admin' | 'customer' | 'system';
      createdBy?: string | null;
      metadata?: Prisma.InputJsonValue;
      allowWhenFrozen?: boolean;
      /**
       * False when the caller already counts this spend in `lifetimeSpentCents`
       * (placing a shop order does), so it is not counted twice.
       */
      countLifetimeSpend?: boolean;
    },
  ) {
    if (!Number.isInteger(params.amountCents) || params.amountCents === 0) {
      throw new BadRequestException({
        code: 'WALLET_INVALID_AMOUNT',
        message: 'amountCents must be a non-zero integer',
      });
    }
    await this.ensureWalletInTx(tx, params.customerId);
    // Serialise concurrent changes to one wallet: without the lock two
    // simultaneous spends both read the same balance and both succeed.
    await tx.$queryRaw`SELECT id FROM stored_wallets WHERE customer_id = ${params.customerId}::uuid FOR UPDATE`;
    const wallet = await tx.storedWallet.findUniqueOrThrow({
      where: { customerId: params.customerId },
    });
    if (wallet.isFrozen && !params.allowWhenFrozen) {
      throw new BadRequestException({
        code: 'WALLET_FROZEN',
        message: 'Wallet is frozen',
      });
    }
    const balanceBefore = wallet.balanceCents;
    const balanceAfter = balanceBefore + params.amountCents;
    if (balanceAfter < 0) {
      throw new BadRequestException({
        code: 'WALLET_INSUFFICIENT_BALANCE',
        message: 'Transaction would result in negative wallet balance',
      });
    }

    const entry = await tx.storedWalletLedgerEntry.create({
      data: {
        walletId: wallet.id,
        customerId: params.customerId,
        type: params.type,
        amountCents: params.amountCents,
        balanceBefore,
        balanceAfter,
        reason: params.reason,
        createdByType: params.createdByType,
        createdBy: params.createdBy ?? null,
        metadata: params.metadata,
      },
    });

    const updates: Prisma.StoredWalletUpdateInput = {
      balanceCents: balanceAfter,
    };
    if (params.type === WalletTxnType.TOPUP && params.amountCents > 0) {
      updates.lifetimeTopUpCents = { increment: params.amountCents };
    }
    if (
      params.type === WalletTxnType.SPEND &&
      params.amountCents < 0 &&
      params.countLifetimeSpend !== false
    ) {
      updates.lifetimeSpentCents = { increment: Math.abs(params.amountCents) };
    }
    if (params.type === WalletTxnType.MANUAL_ADJUSTMENT) {
      updates.manualAdjustmentCents = { increment: params.amountCents };
    }
    if (
      params.type === WalletTxnType.PROMOTIONAL_BONUS &&
      params.amountCents > 0
    ) {
      updates.promotionalCreditCents = { increment: params.amountCents };
    }
    await tx.storedWallet.update({
      where: { customerId: params.customerId },
      data: updates,
    });
    return entry;
  }
}
