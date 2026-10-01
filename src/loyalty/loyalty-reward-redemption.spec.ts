import { BadRequestException } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';

type Order = {
  id: string;
  customerId: string;
  rewardId: string | null;
  rewardTitle: string | null;
  rewardPointsSpent: number;
  rewardPointsRefundedAt: Date | null;
};

/** In-memory stand-in for the order and the points wallet. */
function setup(points: number) {
  const wallet = { customerId: 'm1', pointsCached: points };
  const order: Order = {
    id: 'o1',
    customerId: 'm1',
    rewardId: null,
    rewardTitle: null,
    rewardPointsSpent: 0,
    rewardPointsRefundedAt: null,
  };
  const ledger: { delta: number; reason: string; ref: string | null }[] = [];
  const locks: string[] = [];
  const tx = {
    $queryRaw: jest.fn().mockImplementation(() => {
      locks.push('lock');
      return Promise.resolve([]);
    }),
    loyaltyWallet: {
      upsert: jest.fn().mockResolvedValue({}),
      findUniqueOrThrow: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ ...wallet })),
      update: jest
        .fn()
        .mockImplementation((a: { data: { pointsCached: number } }) => {
          wallet.pointsCached = a.data.pointsCached;
          return Promise.resolve({});
        }),
    },
    loyaltyLedgerEntry: {
      create: jest.fn().mockImplementation(
        (a: {
          data: {
            deltaPoints: number;
            reason: string;
            referenceId: string | null;
          };
        }) => {
          ledger.push({
            delta: a.data.deltaPoints,
            reason: a.data.reason,
            ref: a.data.referenceId,
          });
          return Promise.resolve({});
        },
      ),
    },
    customer: { update: jest.fn().mockResolvedValue({}) },
    customerOrder: {
      updateMany: jest
        .fn()
        .mockImplementation(
          (a: { where: Record<string, unknown>; data: Partial<Order> }) => {
            const w = a.where;
            if (w.id !== order.id) return Promise.resolve({ count: 0 });
            if (w.customerId && w.customerId !== order.customerId)
              return Promise.resolve({ count: 0 });
            if (w.rewardPointsSpent === 0 && order.rewardPointsSpent !== 0)
              return Promise.resolve({ count: 0 });
            if (
              typeof w.rewardPointsSpent === 'object' &&
              !(order.rewardPointsSpent > 0)
            )
              return Promise.resolve({ count: 0 });
            if (
              w.rewardPointsRefundedAt === null &&
              order.rewardPointsRefundedAt !== null
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
    service: new LoyaltyService(prisma as never),
    wallet,
    order,
    ledger,
    locks,
  };
}

const redeem = (service: LoyaltyService, points = 50) =>
  service.redeemRewardForOrder({
    customerId: 'm1',
    orderId: 'o1',
    rewardId: 'rw-1',
    title: 'RM5 Redemption',
    points,
  });

describe('redeeming a reward on an order', () => {
  it('takes the points and records what bought them, under a wallet lock', async () => {
    const { service, wallet, order, ledger, locks } = setup(120);
    await redeem(service);
    expect(wallet.pointsCached).toBe(70);
    expect(order).toMatchObject({
      rewardId: 'rw-1',
      rewardTitle: 'RM5 Redemption',
      rewardPointsSpent: 50,
    });
    expect(ledger).toEqual([
      { delta: -50, reason: 'checkout_redeem_rw-1', ref: 'o1' },
    ]);
    expect(locks).toHaveLength(1);
  });

  it('refuses when the balance is short, and takes nothing', async () => {
    const { service, wallet, ledger } = setup(40);
    await expect(redeem(service)).rejects.toMatchObject({
      response: { code: 'LOYALTY_INSUFFICIENT_POINTS' },
    });
    expect(wallet.pointsCached).toBe(40);
    expect(ledger).toHaveLength(0);
  });

  it('cannot put a second reward on the same order', async () => {
    const { service, wallet } = setup(200);
    await redeem(service);
    await expect(redeem(service)).rejects.toBeInstanceOf(BadRequestException);
    expect(wallet.pointsCached).toBe(150);
  });
});

describe('giving the points back', () => {
  it('returns them once, however many paths ask', async () => {
    const { service, wallet, ledger } = setup(120);
    await redeem(service);
    expect(await service.refundRewardForOrder('o1')).toBe(50);
    expect(await service.refundRewardForOrder('o1')).toBe(0);
    expect(wallet.pointsCached).toBe(120);
    expect(ledger.map((l) => [l.delta, l.reason])).toEqual([
      [-50, 'checkout_redeem_rw-1'],
      [50, 'refund_checkout_redeem_rw-1'],
    ]);
  });

  it('does nothing for an order that used no reward', async () => {
    const { service, wallet, ledger } = setup(120);
    expect(await service.refundRewardForOrder('o1')).toBe(0);
    expect(wallet.pointsCached).toBe(120);
    expect(ledger).toHaveLength(0);
  });
});
