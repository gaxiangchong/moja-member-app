import { WalletTxnType } from '@prisma/client';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  it('locks the stored wallet row before computing a new balance', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'wallet-1' }]),
      storedWallet: {
        upsert: jest.fn().mockResolvedValue(undefined),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'wallet-1',
          customerId: '00000000-0000-0000-0000-000000000001',
          balanceCents: 1000,
          isFrozen: false,
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      storedWalletLedgerEntry: {
        create: jest.fn().mockResolvedValue({ id: 'entry-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn) => fn(tx)),
    };
    const service = new WalletService(prisma as never);

    await service.appendTransaction({
      customerId: '00000000-0000-0000-0000-000000000001',
      type: WalletTxnType.MANUAL_ADJUSTMENT,
      amountCents: 500,
      reason: 'test_adjustment',
      createdByType: 'admin',
      createdBy: 'admin@example.com',
    });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]!).toBeLessThan(
      tx.storedWallet.findUniqueOrThrow.mock.invocationCallOrder[0]!,
    );
    expect(tx.storedWallet.update).toHaveBeenCalledWith({
      where: { customerId: '00000000-0000-0000-0000-000000000001' },
      data: {
        balanceCents: 1500,
        manualAdjustmentCents: { increment: 500 },
      },
    });
  });
});
