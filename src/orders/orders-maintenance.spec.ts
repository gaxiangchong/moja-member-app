import { OrdersMaintenanceService } from './orders-maintenance.service';

function setup(claims: number[]) {
  const orders = claims.map((_, i) => ({
    id: `o${i}`,
    scheduledDate: null,
    placedAt: new Date('2026-10-01T02:00:00Z'),
    lines: [{ productId: 'p', qty: 1 }],
  }));
  let n = 0;
  const prisma = {
    customerOrder: {
      findMany: jest.fn().mockResolvedValue(orders),
      updateMany: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ count: claims[n++] })),
    },
  };
  const productStock = {
    releaseForOrderLines: jest.fn().mockResolvedValue(undefined),
  };
  const loyalty = {
    refundRewardForOrder: jest
      .fn<Promise<number>, [string]>()
      .mockResolvedValue(50),
  };
  const wallet = {
    refundOrderCredits: jest
      .fn<Promise<number>, [string, string?]>()
      .mockResolvedValue(0),
  };
  const service = new OrdersMaintenanceService(
    prisma as never,
    productStock as never,
    { get: jest.fn() } as never,
    loyalty as never,
    wallet as never,
  );
  return { service, productStock, loyalty, wallet };
}

describe('abandoned checkouts', () => {
  it('frees the stock and gives reward points and credits back for each unpaid order it cancels', async () => {
    const { service, productStock, loyalty, wallet } = setup([1, 1]);
    expect(await service.releaseExpiredReservations(30)).toBe(2);
    expect(productStock.releaseForOrderLines).toHaveBeenCalledTimes(2);
    expect(loyalty.refundRewardForOrder.mock.calls.map((c) => c[0])).toEqual([
      'o0',
      'o1',
    ]);
    expect(wallet.refundOrderCredits.mock.calls.map((c) => c[0])).toEqual([
      'o0',
      'o1',
    ]);
  });

  it('leaves alone an order whose payment landed at that moment', async () => {
    const { service, productStock, loyalty, wallet } = setup([0, 1]);
    expect(await service.releaseExpiredReservations(30)).toBe(1);
    expect(productStock.releaseForOrderLines).toHaveBeenCalledTimes(1);
    expect(loyalty.refundRewardForOrder).toHaveBeenCalledTimes(1);
    expect(loyalty.refundRewardForOrder).toHaveBeenCalledWith('o1');
    expect(wallet.refundOrderCredits).toHaveBeenCalledTimes(1);
    expect(wallet.refundOrderCredits).toHaveBeenCalledWith(
      'o1',
      'Payment not completed',
    );
  });
});
