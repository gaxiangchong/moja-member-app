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
  const loyalty = { refundRewardForOrder: jest.fn().mockResolvedValue(50) };
  const service = new OrdersMaintenanceService(
    prisma as never,
    productStock as never,
    { get: jest.fn() } as never,
    loyalty as never,
  );
  return { service, productStock, loyalty };
}

describe('abandoned checkouts', () => {
  it('frees the stock and gives reward points back for each unpaid order it cancels', async () => {
    const { service, productStock, loyalty } = setup([1, 1]);
    expect(await service.releaseExpiredReservations(30)).toBe(2);
    expect(productStock.releaseForOrderLines).toHaveBeenCalledTimes(2);
    expect(loyalty.refundRewardForOrder.mock.calls.map((c) => c[0])).toEqual([
      'o0',
      'o1',
    ]);
  });

  it('leaves alone an order whose payment landed at that moment', async () => {
    const { service, productStock, loyalty } = setup([0, 1]);
    expect(await service.releaseExpiredReservations(30)).toBe(1);
    expect(productStock.releaseForOrderLines).toHaveBeenCalledTimes(1);
    expect(loyalty.refundRewardForOrder).toHaveBeenCalledTimes(1);
    expect(loyalty.refundRewardForOrder).toHaveBeenCalledWith('o1');
  });
});
