import { CustomersService } from '../customers/customers.service';
import { OpsQueueService } from '../ops-queue/ops-queue.service';
import { ABANDONED_CHECKOUT_CANCEL_REASON, ORDER_STATUS } from './order-status';
import { OrdersMaintenanceService } from './orders-maintenance.service';

const PICKUP_DAY = '2026-09-26';
const LINES = [{ productId: 'cake-1', qty: 1 }];

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    customerId: 'cust-1',
    status: ORDER_STATUS.PLACED,
    scheduledDate: new Date(`${PICKUP_DAY}T00:00:00.000Z`),
    placedAt: new Date('2026-09-24T02:00:00.000Z'),
    totalCents: 2500,
    cancelReason: null,
    lines: LINES,
    ...overrides,
  };
}

describe('shop order stock lifecycle', () => {
  it('puts qty back when a member cancels a paid order', async () => {
    const tx = {
      customerOrder: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      customerOrder: {
        findFirst: jest.fn().mockResolvedValue(order()),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) =>
        fn(tx),
      ),
    };
    const productStock = {
      releaseForOrderLines: jest.fn(),
      restoreConsumedForOrderLines: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CustomersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: jest.fn() } as never,
      {} as never,
      productStock as never,
      {} as never,
    );

    await service.cancelMyOrder('cust-1', 'order-1');

    expect(productStock.restoreConsumedForOrderLines).toHaveBeenCalledWith(
      LINES,
      PICKUP_DAY,
      tx,
    );
    expect(productStock.releaseForOrderLines).not.toHaveBeenCalled();
  });

  it('consumes the existing reservation when payment lands on a pending order', async () => {
    const { service, tx, productStock, loyalty } = makeCustomers();
    tx.customerOrder.findFirst.mockResolvedValue(
      order({ status: ORDER_STATUS.PENDING_PAYMENT }),
    );
    tx.customerOrder.updateMany.mockResolvedValueOnce({ count: 1 });

    await service.finalizeShopOrderAfterPayment('order-1');

    expect(productStock.consumeForOrderLines).toHaveBeenCalledWith(
      LINES,
      PICKUP_DAY,
      tx,
    );
    expect(productStock.reserveForOrderLines).not.toHaveBeenCalled();
    expect(loyalty.appendLedgerEntry).toHaveBeenCalledTimes(1);
  });

  it('places an order the sweep already cancelled once payment succeeds', async () => {
    const { service, tx, productStock, loyalty } = makeCustomers();
    tx.customerOrder.findFirst.mockResolvedValue(
      order({
        status: ORDER_STATUS.CANCELLED,
        cancelReason: ABANDONED_CHECKOUT_CANCEL_REASON,
      }),
    );
    tx.customerOrder.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await service.finalizeShopOrderAfterPayment('order-1');

    expect(tx.customerOrder.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'order-1',
        status: ORDER_STATUS.CANCELLED,
        cancelReason: ABANDONED_CHECKOUT_CANCEL_REASON,
      },
      data: {
        status: ORDER_STATUS.PLACED,
        cancelledAt: null,
        cancelReason: null,
      },
    });
    expect(productStock.reserveForOrderLines).toHaveBeenCalledWith(
      LINES,
      PICKUP_DAY,
      tx,
    );
    expect(productStock.consumeForOrderLines).toHaveBeenCalledWith(
      LINES,
      PICKUP_DAY,
      tx,
    );
    expect(loyalty.appendLedgerEntry).toHaveBeenCalledTimes(1);
  });

  it('does not revive an order the member or staff cancelled', async () => {
    const { service, tx, productStock, loyalty } = makeCustomers();
    tx.customerOrder.findFirst.mockResolvedValue(
      order({
        status: ORDER_STATUS.CANCELLED,
        cancelReason: 'Cancelled by member',
      }),
    );
    tx.customerOrder.updateMany.mockResolvedValue({ count: 0 });

    await service.finalizeShopOrderAfterPayment('order-1');

    expect(productStock.reserveForOrderLines).not.toHaveBeenCalled();
    expect(productStock.consumeForOrderLines).not.toHaveBeenCalled();
    expect(loyalty.appendLedgerEntry).not.toHaveBeenCalled();
    expect(tx.storedWallet.upsert).not.toHaveBeenCalled();
  });

  it('restores qty when the kitchen cancels a paid order and releases only unpaid holds', async () => {
    const tx = {
      customerOrder: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'order-1' }),
      },
      customerOrderLine: {
        findMany: jest.fn().mockResolvedValue(LINES),
      },
    };
    const prisma = {
      customerOrder: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(
            order({
              status: ORDER_STATUS.PLACED,
              scheduledDate: new Date(`${PICKUP_DAY}T00:00:00.000Z`),
            }),
          )
          .mockResolvedValueOnce(
            order({ status: ORDER_STATUS.PENDING_PAYMENT }),
          ),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'order-1' }),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) =>
        fn(tx),
      ),
    };
    const productStock = {
      releaseForOrderLines: jest.fn().mockResolvedValue(undefined),
      restoreConsumedForOrderLines: jest.fn().mockResolvedValue(undefined),
    };
    const ops = new OpsQueueService(
      prisma as never,
      {} as never,
      productStock as never,
    );

    await ops.setOrderStatus('order-1', ORDER_STATUS.CANCELLED);
    expect(productStock.restoreConsumedForOrderLines).toHaveBeenCalledWith(
      LINES,
      PICKUP_DAY,
      tx,
    );
    expect(productStock.releaseForOrderLines).not.toHaveBeenCalled();

    await ops.setOrderStatus('order-1', ORDER_STATUS.CANCELLED);
    expect(productStock.releaseForOrderLines).toHaveBeenCalledWith(
      LINES,
      PICKUP_DAY,
      tx,
    );
  });

  it('cancels an expired unpaid order and releases its reservation together', async () => {
    const tx = {
      customerOrder: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      customerOrder: {
        findMany: jest.fn().mockResolvedValue([
          order({
            status: ORDER_STATUS.PENDING_PAYMENT,
            placedAt: new Date(Date.now() - 60 * 60_000),
          }),
        ]),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) =>
        fn(tx),
      ),
    };
    const productStock = {
      releaseForOrderLines: jest.fn().mockResolvedValue(undefined),
      restoreConsumedForOrderLines: jest.fn(),
    };
    const maintenance = new OrdersMaintenanceService(
      prisma as never,
      productStock as never,
      { get: jest.fn() } as never,
    );

    const released = await maintenance.releaseExpiredReservations(30);

    expect(released).toBe(1);
    expect(tx.customerOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ORDER_STATUS.CANCELLED,
          cancelReason: ABANDONED_CHECKOUT_CANCEL_REASON,
        }),
      }),
    );
    expect(productStock.releaseForOrderLines).toHaveBeenCalledWith(
      LINES,
      PICKUP_DAY,
      tx,
    );
    expect(productStock.restoreConsumedForOrderLines).not.toHaveBeenCalled();
  });
});

function makeCustomers() {
  const tx = {
    customerOrder: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    storedWallet: { upsert: jest.fn().mockResolvedValue({}) },
    loyaltyWallet: {
      findUnique: jest.fn().mockResolvedValue({ pointsCached: 0 }),
    },
  };
  const prisma = {
    customerOrder: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const productStock = {
    reserveForOrderLines: jest.fn().mockResolvedValue([]),
    releaseForOrderLines: jest.fn(),
    consumeForOrderLines: jest.fn().mockResolvedValue(undefined),
    restoreConsumedForOrderLines: jest.fn(),
  };
  const loyalty = {
    appendLedgerEntry: jest.fn().mockResolvedValue({ balanceAfter: 25 }),
  };
  const service = new CustomersService(
    prisma as never,
    loyalty as never,
    {} as never,
    { pushOnlineOrder: jest.fn() } as never,
    {} as never,
    { get: jest.fn().mockReturnValue(undefined) } as never,
    {
      runMinPurchaseTrigger: jest.fn().mockResolvedValue(undefined),
      runReferralCountTrigger: jest.fn().mockResolvedValue(undefined),
    } as never,
    productStock as never,
    {} as never,
  );
  return { service, tx, productStock, loyalty };
}
