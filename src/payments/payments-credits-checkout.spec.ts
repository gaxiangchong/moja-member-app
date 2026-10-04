import { BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

/**
 * Paying a shop order with wallet credits: the whole order or nothing, the
 * debit and the order marking happen together, and every failure path leaves
 * the member with their money and the cake's stock released.
 */
function setup(opts: {
  balanceCents?: number;
  frozen?: boolean;
  debitFails?: boolean;
  finalizeFails?: boolean;
  demo?: boolean;
}) {
  const balance = opts.balanceCents ?? 10_000;
  const calls: string[] = [];
  const xendit = { createPaymentRequest: jest.fn() };
  const wallet = {
    getSummary: jest.fn().mockResolvedValue({
      currentWalletBalance: balance,
      isFrozen: opts.frozen ?? false,
    }),
    payOrderWithCredits: jest.fn().mockImplementation(() => {
      calls.push('debit');
      if (opts.debitFails) {
        return Promise.reject(
          new BadRequestException({ code: 'WALLET_INSUFFICIENT_BALANCE' }),
        );
      }
      return Promise.resolve({ balanceAfter: balance - 4_500 });
    }),
    refundOrderCredits: jest.fn().mockImplementation(() => {
      calls.push('refund');
      return Promise.resolve(4_500);
    }),
  };
  const customers = {
    shippingFeeCentsFor: jest.fn().mockResolvedValue(0),
    createPendingMemberOrder: jest.fn().mockImplementation(() => {
      calls.push('createOrder');
      return Promise.resolve({
        id: 'order-1',
        orderNumber: 77,
        totalCents: 4_500,
        placedAt: new Date('2026-10-01T02:00:00Z'),
        status: 'pending_payment',
      });
    }),
    finalizeShopOrderAfterPayment: jest.fn().mockImplementation(() => {
      calls.push('finalize');
      return opts.finalizeFails
        ? Promise.reject(new Error('db down'))
        : Promise.resolve();
    }),
    abandonPendingOrder: jest.fn().mockImplementation(() => {
      calls.push('abandon');
      return Promise.resolve();
    }),
    addInterestTag: jest.fn().mockResolvedValue(undefined),
  };
  const rewardsWorkflow = {
    validateAndLockVoucher: jest
      .fn()
      .mockResolvedValue({ lockToken: 'lock-1' }),
    computeLockedVoucherDiscount: jest.fn().mockResolvedValue(500),
    releaseVoucherLock: jest.fn().mockImplementation(() => {
      calls.push('releaseLock');
      return Promise.resolve();
    }),
  };
  const prisma = {
    customerOrder: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'order-1',
        orderNumber: 77,
        totalCents: 4_500,
        placedAt: new Date('2026-10-01T02:00:00Z'),
        status: 'placed',
      }),
    },
  };
  const service = new PaymentsService(
    prisma as never,
    { get: jest.fn().mockReturnValue(undefined) } as never, // config
    xendit as never,
    wallet as never,
    customers as never,
    {} as never, // loyalty
    rewardsWorkflow as never,
    {} as never, // receiptEmail
    {} as never, // bentoVoucher
    {
      getDemoModeOverride: jest.fn().mockReturnValue(opts.demo ?? false),
    } as never,
    {} as never, // walletTopUpSettings
  );
  return { service, wallet, customers, rewardsWorkflow, xendit, calls };
}

const order = (totalCents = 4_500) =>
  ({
    totalCents,
    lines: [
      {
        productId: 'p1',
        name: 'Cake',
        unitPriceCents: totalCents,
        qty: 1,
      },
    ],
    fulfilmentType: 'PICKUP',
  }) as never;

async function code(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return (e as BadRequestException).getResponse() as { code: string };
  }
  throw new Error('expected a rejection');
}

describe('Shop checkout — pay with credits', () => {
  it('places the order from credits, with no card/e-wallet step', async () => {
    const { service, wallet, customers, xendit, calls } = setup({});
    const result = (await service.createShopOrderCheckout(
      'member',
      order(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      true,
    )) as {
      paidWithCredits: boolean;
      creditsSpentCents: number;
      balanceCents: number;
    };

    expect(result.paidWithCredits).toBe(true);
    expect(result.creditsSpentCents).toBe(4_500);
    expect(result.balanceCents).toBe(5_500);
    expect(wallet.payOrderWithCredits).toHaveBeenCalledWith({
      customerId: 'member',
      orderId: 'order-1',
      amountCents: 4_500,
    });
    expect(xendit.createPaymentRequest).not.toHaveBeenCalled();
    // Reserve → debit → place, in that order.
    expect(calls).toEqual(['createOrder', 'debit', 'finalize']);
    expect(customers.addInterestTag).toHaveBeenCalledWith('member', 'cake');
  });

  it('works in demo mode too (no pending-payment step)', async () => {
    const { service, calls } = setup({ demo: true });
    const result = (await service.createShopOrderCheckout(
      'member',
      order(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      true,
    )) as { paidWithCredits?: boolean; demoMode?: boolean };
    expect(result.paidWithCredits).toBe(true);
    expect(result.demoMode).toBeUndefined();
    expect(calls).toContain('finalize');
  });

  it('refuses when the balance does not cover the order — and holds nothing', async () => {
    const { service, customers, wallet } = setup({ balanceCents: 4_499 });
    const err = await code(
      service.createShopOrderCheckout(
        'member',
        order(),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        true,
      ),
    );
    expect(err.code).toBe('WALLET_INSUFFICIENT_BALANCE');
    expect(customers.createPendingMemberOrder).not.toHaveBeenCalled();
    expect(wallet.payOrderWithCredits).not.toHaveBeenCalled();
  });

  it('refuses a frozen wallet', async () => {
    const { service, customers } = setup({ frozen: true });
    const err = await code(
      service.createShopOrderCheckout(
        'member',
        order(),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        true,
      ),
    );
    expect(err.code).toBe('WALLET_FROZEN');
    expect(customers.createPendingMemberOrder).not.toHaveBeenCalled();
  });

  it('releases a voucher lock when the credits are not enough', async () => {
    const { service, rewardsWorkflow } = setup({ balanceCents: 100 });
    await code(
      service.createShopOrderCheckout(
        'member',
        order(5_000),
        undefined,
        undefined,
        'voucher-1',
        undefined,
        undefined,
        true,
      ),
    );
    expect(rewardsWorkflow.releaseVoucherLock).toHaveBeenCalledWith('lock-1');
  });

  it('cancels the held order when the debit loses a race', async () => {
    const { service, customers, calls } = setup({ debitFails: true });
    await code(
      service.createShopOrderCheckout(
        'member',
        order(),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        true,
      ),
    );
    expect(calls).toEqual(['createOrder', 'debit', 'abandon']);
    expect(customers.finalizeShopOrderAfterPayment).not.toHaveBeenCalled();
  });

  it('returns the credits and the stock when the order cannot be placed', async () => {
    const { service, calls } = setup({ finalizeFails: true });
    await expect(
      service.createShopOrderCheckout(
        'member',
        order(),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        true,
      ),
    ).rejects.toThrow('db down');
    expect(calls).toEqual([
      'createOrder',
      'debit',
      'finalize',
      'refund',
      'abandon',
    ]);
  });

  it('does not touch credits when the discount makes the order free', async () => {
    const { service, wallet } = setup({});
    await service
      .createShopOrderCheckout(
        'member',
        order(0),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        true,
      )
      .catch(() => undefined);
    expect(wallet.payOrderWithCredits).not.toHaveBeenCalled();
  });
});
