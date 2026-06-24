import { WalletTxnType } from '@prisma/client';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  function buildService() {
    const wallet = {
      id: 'wallet-1',
      customerId: '11111111-1111-1111-1111-111111111111',
      balanceCents: 1000,
      isFrozen: false,
    };
    const ledgerEntry = {
      id: 'ledger-1',
      walletId: wallet.id,
      customerId: wallet.customerId,
      type: WalletTxnType.TOPUP,
      amountCents: 500,
      balanceBefore: 1000,
      balanceAfter: 1500,
    };
    const tx = {
      storedWallet: {
        upsert: jest.fn().mockResolvedValue(wallet),
        findUniqueOrThrow: jest.fn().mockResolvedValue(wallet),
        update: jest.fn().mockResolvedValue({ ...wallet, balanceCents: 1500 }),
      },
      storedWalletLedgerEntry: {
        create: jest.fn().mockResolvedValue(ledgerEntry),
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(ledgerEntry)
          .mockResolvedValueOnce(null),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: wallet.id }]),
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    return {
      service: new WalletService(prisma as never),
      prisma,
      tx,
      wallet,
      ledgerEntry,
    };
  }

  it('locks the wallet row before reading balance for a transaction append', async () => {
    const { service, tx, wallet } = buildService();

    await service.appendTransaction({
      customerId: wallet.customerId,
      type: WalletTxnType.TOPUP,
      amountCents: 500,
      reason: 'topup',
      createdByType: 'customer',
    });

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.storedWallet.findUniqueOrThrow.mock.invocationCallOrder[0],
    );
    expect(tx.storedWallet.update).toHaveBeenCalledWith({
      where: { customerId: wallet.customerId },
      data: {
        balanceCents: 1500,
        lifetimeTopUpCents: { increment: 500 },
      },
    });
  });

  it('locks the wallet row before checking whether a transaction was reversed', async () => {
    const { service, tx, wallet, ledgerEntry } = buildService();

    await service.reverseTransaction({
      customerId: wallet.customerId,
      transactionId: ledgerEntry.id,
      reason: 'duplicate topup',
      createdByType: 'admin',
    });

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.storedWalletLedgerEntry.findFirst.mock.invocationCallOrder[0],
    );
  });
});
