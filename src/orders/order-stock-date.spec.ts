import { ORDER_STATUS } from './order-status';
import { stockBusinessDateForOrder } from './product-stock.service';
import { CustomersService } from '../customers/customers.service';
import { OpsQueueService } from '../ops-queue/ops-queue.service';

describe('stockBusinessDateForOrder', () => {
  const placedAt = new Date('2026-10-04T02:00:00.000Z'); // 10:00 in Malaysia

  it('uses the collection date when the order has one', () => {
    expect(
      stockBusinessDateForOrder({
        scheduledDate: new Date('2026-10-10T00:00:00.000Z'),
        placedAt,
      }),
    ).toBe('2026-10-10');
  });

  it('uses the Malaysia shop day the order was placed when there is no collection date', () => {
    expect(stockBusinessDateForOrder({ scheduledDate: null, placedAt })).toBe(
      '2026-10-04',
    );
    // 16:30 UTC is 00:30 the next morning in Malaysia.
    expect(
      stockBusinessDateForOrder({
        scheduledDate: null,
        placedAt: new Date('2026-10-04T16:30:00.000Z'),
      }),
    ).toBe('2026-10-05');
  });
});

describe('cancelling an order with no collection date', () => {
  const placedAt = new Date('2026-10-04T02:00:00.000Z');
  const lines = [{ productId: 'butter-cookies', qty: 2 }];

  beforeEach(() => {
    jest.useFakeTimers({ now: Date.parse('2026-10-05T04:00:00.000Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the member-cancelled hold to the placement day, not today', async () => {
    const releaseForOrderLines = jest.fn().mockResolvedValue(undefined);
    const svc = Object.create(CustomersService.prototype) as CustomersService &
      Record<string, unknown>;
    svc.logger = { error: jest.fn() };
    svc.productStock = { releaseForOrderLines };
    svc.wallet = { refundOrderCredits: jest.fn().mockResolvedValue(0) };
    svc.loyalty = { refundRewardForOrder: jest.fn().mockResolvedValue(0) };
    svc.orderNotices = { notify: jest.fn() };
    svc.prisma = {
      customerOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'o1',
          status: ORDER_STATUS.PLACED,
          scheduledDate: null,
          placedAt,
          lines,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    await svc.cancelMyOrder('c1', 'o1');

    expect(releaseForOrderLines).toHaveBeenCalledWith(lines, '2026-10-04');
  });

  it('returns a kitchen-cancelled hold to the placement day, not today', async () => {
    const releaseForOrderLines = jest.fn().mockResolvedValue(undefined);
    const svc = Object.create(OpsQueueService.prototype) as OpsQueueService &
      Record<string, unknown>;
    svc.logger = { error: jest.fn() };
    svc.productStock = { releaseForOrderLines };
    svc.wallet = { refundOrderCredits: jest.fn().mockResolvedValue(0) };
    svc.loyalty = { refundRewardForOrder: jest.fn().mockResolvedValue(0) };
    svc.orderNotices = { notify: jest.fn() };
    svc.prisma = {
      customerOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'o1',
          status: ORDER_STATUS.PLACED,
          scheduledDate: null,
          placedAt,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'o1' }),
      },
      customerOrderLine: {
        findMany: jest.fn().mockResolvedValue(lines),
      },
    };

    await svc.setOrderStatus('o1', ORDER_STATUS.CANCELLED);

    expect(releaseForOrderLines).toHaveBeenCalledWith(lines, '2026-10-04');
  });
});
