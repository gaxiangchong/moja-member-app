import { WalletTxnType } from '@prisma/client';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  function buildService() {
    const wallet = {
      id: 'wallet-1',
      customerId: '3fbbef73-8c2f-41ac-910d-9d76a2dc7d8b',
      balanceCents: 1000,
      lifetimeTopUpCents: 1000,
      lifetimeSpentCents: 0,
      manualAdjustmentCents: 0,
      promotionalCreditCents: 0,
      pendingCreditCents: 0,
      isFrozen: false,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const entry = {
      id: 'entry-1',
      walletId: wallet.id,
      customerId: wallet.customerId,
      type: WalletTxnType.PROMOTIONAL_BONUS,
      amountCents: 250,
      balanceBefore: 1000,
      balanceAfter: 1250,
      reason: 'test_bonus',
      createdByType: 'system',
      createdBy: 'test',
      reversedByTxnId: null,
      metadata: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: wallet.id }]),
      storedWallet: {
        upsert: jest.fn().mockResolvedValue(wallet),
        findUniqueOrThrow: jest.fn().mockResolvedValue(wallet),
        update: jest.fn().mockResolvedValue({ ...wallet, balanceCents: 1250 }),
      },
      storedWalletLedgerEntry: {
        create: jest.fn().mockResolvedValue(entry),
        findFirst: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((cb: (client: typeof tx) => unknown) => cb(tx)),
    };

    return {
      service: new WalletService(prisma as never),
      tx,
      prisma,
      wallet,
    };
  }

  it('locks the stored wallet row before computing a new balance', async () => {
    const { service, tx, wallet } = buildService();

    await service.appendTransaction({
      customerId: wallet.customerId,
      type: WalletTxnType.PROMOTIONAL_BONUS,
      amountCents: 250,
      reason: 'test_bonus',
      createdByType: 'system',
      createdBy: 'test',
    });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = (tx.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join(
      ' ',
    );
    expect(sql).toContain('FOR UPDATE');
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.storedWallet.findUniqueOrThrow.mock.invocationCallOrder[0],
    );
    expect(tx.storedWalletLedgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        balanceBefore: 1000,
        balanceAfter: 1250,
      }),
    });
  });
});
