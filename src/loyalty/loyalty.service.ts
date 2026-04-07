import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
    pointsBalance: number;
    walletId: string;
  }> {
    const wallet = await this.prisma.loyaltyWallet.findUnique({
      where: { customerId },
    });
    if (!wallet) {
      return { pointsBalance: 0, walletId: '' };
    }
    return { pointsBalance: wallet.pointsCached, walletId: wallet.id };
  }

  /**
   * All point changes must go through the ledger; wallet cache is updated in the same transaction.
   */
  async appendLedgerEntry(params: {
    customerId: string;
    deltaPoints: number;
    reason: string;
    referenceType?: string | null;
    referenceId?: string | null;
  }): Promise<{ balanceAfter: number }> {
    if (params.deltaPoints === 0) {
      throw new BadRequestException({
        code: 'LOYALTY_NOOP',
        message: 'deltaPoints must be non-zero',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await this.ensureWalletInTx(tx, params.customerId);
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

      await tx.loyaltyWallet.update({
        where: { customerId: params.customerId },
        data: { pointsCached: balanceAfter },
      });

      return { balanceAfter };
    });
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
