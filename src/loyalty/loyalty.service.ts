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
    },
  ): Promise<{ balanceAfter: number }> {
    await this.lockWalletInTx(tx, params.customerId);
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
  }

  /**
   * Ensure the loyalty wallet row exists and take a row lock so concurrent
   * earn/spend paths cannot both read the same pointsCached and overwrite.
   */
  async lockWalletInTx(
    tx: Prisma.TransactionClient,
    customerId: string,
  ): Promise<void> {
    await this.ensureWalletInTx(tx, customerId);
    await tx.$queryRaw(
      Prisma.sql`SELECT 1 FROM loyalty_wallets WHERE customer_id = ${customerId}::uuid FOR UPDATE`,
    );
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
