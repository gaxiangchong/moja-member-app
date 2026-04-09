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
  }) {
    if (!Number.isInteger(params.amountCents) || params.amountCents === 0) {
      throw new BadRequestException({
        code: 'WALLET_INVALID_AMOUNT',
        message: 'amountCents must be a non-zero integer',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await this.ensureWalletInTx(tx, params.customerId);
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

      const txEntry = await tx.storedWalletLedgerEntry.create({
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
      if (params.type === WalletTxnType.SPEND && params.amountCents < 0) {
        updates.lifetimeSpentCents = { increment: Math.abs(params.amountCents) };
      }
      if (params.type === WalletTxnType.MANUAL_ADJUSTMENT) {
        updates.manualAdjustmentCents = { increment: params.amountCents };
      }
      if (params.type === WalletTxnType.PROMOTIONAL_BONUS && params.amountCents > 0) {
        updates.promotionalCreditCents = { increment: params.amountCents };
      }

      await tx.storedWallet.update({
        where: { customerId: params.customerId },
        data: updates,
      });

      return txEntry;
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
    },
  ) {
    if (!Number.isInteger(params.amountCents) || params.amountCents === 0) {
      throw new BadRequestException({
        code: 'WALLET_INVALID_AMOUNT',
        message: 'amountCents must be a non-zero integer',
      });
    }
    await this.ensureWalletInTx(tx, params.customerId);
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

    const updates: Prisma.StoredWalletUpdateInput = { balanceCents: balanceAfter };
    if (params.type === WalletTxnType.TOPUP && params.amountCents > 0) {
      updates.lifetimeTopUpCents = { increment: params.amountCents };
    }
    if (params.type === WalletTxnType.SPEND && params.amountCents < 0) {
      updates.lifetimeSpentCents = { increment: Math.abs(params.amountCents) };
    }
    if (params.type === WalletTxnType.MANUAL_ADJUSTMENT) {
      updates.manualAdjustmentCents = { increment: params.amountCents };
    }
    if (params.type === WalletTxnType.PROMOTIONAL_BONUS && params.amountCents > 0) {
      updates.promotionalCreditCents = { increment: params.amountCents };
    }
    await tx.storedWallet.update({
      where: { customerId: params.customerId },
      data: updates,
    });
    return entry;
  }
}
