import { BadRequestException } from '@nestjs/common';
import { WalletService } from './wallet.service';

type Order = {
  id: string;
  customerId: string;
  orderNumber: number;
  status: string;
  totalCents: number;
  paidWithCreditsCents: number;
  creditsRefundedAt: Date | null;
};

/** In-memory stand-in for the two tables these helpers touch. */
function setup(initial: {
  balance: number;
  frozen?: boolean;
  order?: Partial<Order>;
}) {
  const wallet = {
    id: 'w1',
    customerId: 'm1',
    balanceCents: initial.balance,
    isFrozen: initial.frozen ?? false,
  };
  const order: Order = {
    id: 'o1',
    customerId: 'm1',
    orderNumber: 12,
    status: 'pending_payment',
    totalCents: 4_500,
    paidWithCreditsCents: 0,
    creditsRefundedAt: null,
    ...initial.order,
  };
  const ledger: { type: string; amountCents: number; reason: string }[] = [];
  const locked: string[] = [];

  const tx = {
    $queryRaw: jest.fn().mockImplementation(() => {
      locked.push('lock');
      return Promise.resolve([]);
    }),
    storedWallet: {
      upsert: jest.fn().mockResolvedValue({}),
      findUniqueOrThrow: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ ...wallet })),
      update: jest
        .fn()
        .mockImplementation((a: { data: { balanceCents: number } }) => {
          wallet.balanceCents = a.data.balanceCents;
          return Promise.resolve({});
        }),
    },
    storedWalletLedgerEntry: {
      create: jest
        .fn()
        .mockImplementation(
          (a: {
            data: { type: string; amountCents: number; reason: string };
          }) => {
            ledger.push({
              type: a.data.type,
              amountCents: a.data.amountCents,
              reason: a.data.reason,
            });
            return Promise.resolve({});
          },
        ),
    },
    customerOrder: {
      updateMany: jest
        .fn()
        .mockImplementation(
          (a: { where: Record<string, unknown>; data: Partial<Order> }) => {
            const w = a.where;
            if (w.id !== order.id) return Promise.resolve({ count: 0 });
            if (w.customerId && w.customerId !== order.customerId)
              return Promise.resolve({ count: 0 });
            if (w.status && w.status !== order.status)
              return Promise.resolve({ count: 0 });
            if (w.totalCents != null && w.totalCents !== order.totalCents)
              return Promise.resolve({ count: 0 });
            if (
              w.paidWithCreditsCents === 0 &&
              order.paidWithCreditsCents !== 0
            )
              return Promise.resolve({ count: 0 });
            if (
              typeof w.paidWithCreditsCents === 'object' &&
              !(order.paidWithCreditsCents > 0)
            )
              return Promise.resolve({ count: 0 });
            if (
              w.creditsRefundedAt === null &&
              order.creditsRefundedAt !== null
            )
              return Promise.resolve({ count: 0 });
            Object.assign(order, a.data);
            return Promise.resolve({ count: 1 });
          },
        ),
      findUniqueOrThrow: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ ...order })),
    },
  };
  const prisma = {
    $transaction: jest
      .fn()
      .mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return {
    service: new WalletService(prisma as never),
    wallet,
    order,
    ledger,
    locked,
  };
}

describe('WalletService — paying an order with credits', () => {
  it('debits the wallet and marks the order together, under a row lock', async () => {
    const { service, wallet, order, ledger, locked } = setup({
      balance: 10_000,
    });
    await service.payOrderWithCredits({
      customerId: 'm1',
      orderId: 'o1',
      amountCents: 4_500,
    });
    expect(wallet.balanceCents).toBe(5_500);
    expect(order.paidWithCreditsCents).toBe(4_500);
    expect(ledger).toEqual([
      { type: 'SPEND', amountCents: -4_500, reason: 'Shop order #12' },
    ]);
    expect(locked).toHaveLength(1);
  });

  it('never goes below zero', async () => {
    const { service, wallet, ledger } = setup({ balance: 4_000 });
    await expect(
      service.payOrderWithCredits({
        customerId: 'm1',
        orderId: 'o1',
        amountCents: 4_500,
      }),
    ).rejects.toMatchObject({
      response: { code: 'WALLET_INSUFFICIENT_BALANCE' },
    });
    expect(wallet.balanceCents).toBe(4_000);
    expect(ledger).toHaveLength(0);
  });

  it('refuses a frozen wallet', async () => {
    const { service, ledger } = setup({ balance: 10_000, frozen: true });
    await expect(
      service.payOrderWithCredits({
        customerId: 'm1',
        orderId: 'o1',
        amountCents: 4_500,
      }),
    ).rejects.toMatchObject({ response: { code: 'WALLET_FROZEN' } });
    expect(ledger).toHaveLength(0);
  });

  it("will not pay an order that is not awaiting payment, another member's order, or a different amount", async () => {
    for (const [order, customerId, amount] of [
      [{ status: 'placed' }, 'm1', 4_500],
      [{}, 'someone-else', 4_500],
      [{}, 'm1', 100],
    ] as const) {
      const { service, wallet, ledger } = setup({ balance: 10_000, order });
      await expect(
        service.payOrderWithCredits({
          customerId,
          orderId: 'o1',
          amountCents: amount,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(wallet.balanceCents).toBe(10_000);
      expect(ledger).toHaveLength(0);
    }
  });

  it('cannot pay the same order twice', async () => {
    const { service, wallet } = setup({ balance: 10_000 });
    const pay = () =>
      service.payOrderWithCredits({
        customerId: 'm1',
        orderId: 'o1',
        amountCents: 4_500,
      });
    await pay();
    await expect(pay()).rejects.toMatchObject({
      response: { code: 'ORDER_NOT_PAYABLE' },
    });
    expect(wallet.balanceCents).toBe(5_500);
  });
});

describe('WalletService — returning credits for a cancelled order', () => {
  const paid = { paidWithCreditsCents: 4_500, status: 'cancelled' };

  it('puts the credits back once, however many times it is asked', async () => {
    const { service, wallet, ledger } = setup({ balance: 5_500, order: paid });
    expect(await service.refundOrderCredits('o1', 'Order cancelled')).toBe(
      4_500,
    );
    expect(await service.refundOrderCredits('o1', 'Order refunded')).toBe(0);
    expect(wallet.balanceCents).toBe(10_000);
    expect(ledger).toEqual([
      {
        type: 'REFUND',
        amountCents: 4_500,
        reason: 'Order cancelled — order #12',
      },
    ]);
  });

  it('does nothing for an order that was paid another way', async () => {
    const { service, wallet, ledger } = setup({
      balance: 5_500,
      order: { status: 'cancelled' },
    });
    expect(await service.refundOrderCredits('o1')).toBe(0);
    expect(wallet.balanceCents).toBe(5_500);
    expect(ledger).toHaveLength(0);
  });

  it('returns the money even if the wallet is frozen', async () => {
    const { service, wallet } = setup({
      balance: 0,
      frozen: true,
      order: paid,
    });
    expect(await service.refundOrderCredits('o1')).toBe(4_500);
    expect(wallet.balanceCents).toBe(4_500);
  });
});
