import { LoyaltyService } from './loyalty.service';

describe('LoyaltyService', () => {
  it('locks the loyalty wallet row before computing a new balance', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'wallet-1' }]),
      loyaltyWallet: {
        upsert: jest.fn().mockResolvedValue(undefined),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'wallet-1',
          customerId: '00000000-0000-0000-0000-000000000001',
          pointsCached: 100,
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      loyaltyLedgerEntry: {
        create: jest.fn().mockResolvedValue({ id: 'entry-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn) => fn(tx)),
    };
    const service = new LoyaltyService(prisma as never);

    await service.appendLedgerEntry({
      customerId: '00000000-0000-0000-0000-000000000001',
      deltaPoints: 25,
      reason: 'test_adjustment',
    });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]!).toBeLessThan(
      tx.loyaltyWallet.findUniqueOrThrow.mock.invocationCallOrder[0]!,
    );
    expect(tx.loyaltyWallet.update).toHaveBeenCalledWith({
      where: { customerId: '00000000-0000-0000-0000-000000000001' },
      data: { pointsCached: 125 },
    });
  });
});
