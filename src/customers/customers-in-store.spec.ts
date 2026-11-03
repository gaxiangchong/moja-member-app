import { DEFAULT_DELIVERY_SETTINGS } from '../orders/delivery';
import { CustomersService } from './customers.service';
import type { SubmitMemberOrderDto } from './dto/submit-member-order.dto';

const SIX_INCH = {
  productId: 'strawberry-shortcake',
  name: 'Strawberry Shortcake',
  variantLabel: '6 inch',
  unitPriceCents: 12800,
  qty: 1,
};

function makeService(failed: string[] = []) {
  const created: Record<string, unknown>[] = [];
  const assertCanPlace = jest.fn().mockResolvedValue(undefined);
  const reserveForOrderLines = jest.fn().mockResolvedValue(failed);
  const isCounted = jest.fn().mockReturnValue(true);
  const tx = {
    customerOrder: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        const lines = (data.lines as { create: Record<string, unknown>[] })
          .create;
        return Promise.resolve({ ...data, id: 'o1', lines });
      }),
    },
  };
  const svc = Object.create(CustomersService.prototype) as unknown as Record<
    string,
    unknown
  >;
  svc.deliverySettings = {
    getSettings: () => Promise.resolve(DEFAULT_DELIVERY_SETTINGS),
  };
  svc.earlyOrderDiscount = {
    getSettings: () => Promise.resolve({ enabled: false }),
  };
  svc.pickupRules = { assertCanPlace };
  svc.productStock = { reserveForOrderLines };
  svc.inStore = {
    countedLinePredicate: jest.fn().mockResolvedValue(isCounted),
    summaryLines: jest
      .fn()
      .mockResolvedValue([
        'In store · prepare now',
        'Collect today from 3:40 PM',
      ]),
  };
  svc.prisma = {
    shopProduct: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  };
  const place = (dto: Partial<SubmitMemberOrderDto>) =>
    (svc as unknown as CustomersService).createPendingMemberOrder(
      'c1',
      dto as SubmitMemberOrderDto,
    );
  return { place, created, assertCanPlace, reserveForOrderLines };
}

const inStoreDto: Partial<SubmitMemberOrderDto> = {
  totalCents: 12800,
  fulfilmentType: 'IN_STORE',
  lines: [SIX_INCH],
};

describe('createPendingMemberOrder: in-store today', () => {
  it('holds today’s stock for the size, refusing uncounted sizes', async () => {
    const { place, created, assertCanPlace, reserveForOrderLines } =
      makeService();
    await place({ ...inStoreDto });

    expect(assertCanPlace).toHaveBeenCalledWith(
      expect.objectContaining({
        fulfilmentType: 'IN_STORE',
        scheduledDate: null,
        scheduledSlot: null,
      }),
      expect.anything(),
    );
    const [lines, , , opts] = reserveForOrderLines.mock.calls[0] as [
      unknown,
      string,
      unknown,
      { requireTracked?: unknown },
    ];
    expect(lines).toEqual([
      { productId: 'strawberry-shortcake', variantLabel: '6 inch', qty: 1 },
    ]);
    expect(typeof opts.requireTracked).toBe('function');
    expect(created[0]).toMatchObject({
      fulfilmentType: 'IN_STORE',
      scheduledDate: null,
      fulfillmentSummary: [
        'In store · prepare now',
        'Collect today from 3:40 PM',
      ],
    });
  });

  it('says which size sold out', async () => {
    const { place } = makeService(['strawberry-shortcake']);
    await expect(place({ ...inStoreDto })).rejects.toMatchObject({
      response: {
        code: 'CAKE_OUT_OF_STOCK',
        message:
          'Strawberry Shortcake (6 inch) is no longer available in store today. Pre-order for another day or adjust your cart.',
      },
    });
  });
});
