import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyService } from './loyalty.service';

describe('LoyaltyService.appendLedgerEntry locking', () => {
  it('takes a row lock before reading pointsCached', async () => {
    const tx = {
      loyaltyWallet: {
        upsert: jest.fn().mockResolvedValue({}),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'w1',
          customerId: 'c1',
          pointsCached: 40,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      loyaltyLedgerEntry: {
        create: jest.fn().mockResolvedValue({}),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    const service = new LoyaltyService(prisma as unknown as PrismaService);

    const result = await service.appendLedgerEntry({
      customerId: 'c1',
      deltaPoints: -10,
      reason: 'checkout_reserve_r1',
      referenceType: 'customer_order',
      referenceId: 'o1',
    });

    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.loyaltyWallet.findUniqueOrThrow).toHaveBeenCalled();
    expect(tx.loyaltyLedgerEntry.create).toHaveBeenCalled();
    expect(result).toEqual({ balanceAfter: 30 });
  });

  it('rejects adjustments that would go negative under the lock', async () => {
    const tx = {
      loyaltyWallet: {
        upsert: jest.fn().mockResolvedValue({}),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'w1',
          customerId: 'c1',
          pointsCached: 5,
        }),
        update: jest.fn(),
      },
      loyaltyLedgerEntry: { create: jest.fn() },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    const service = new LoyaltyService(prisma as unknown as PrismaService);

    await expect(
      service.appendLedgerEntry({
        customerId: 'c1',
        deltaPoints: -10,
        reason: 'checkout_reserve_r1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.loyaltyLedgerEntry.create).not.toHaveBeenCalled();
  });
});
