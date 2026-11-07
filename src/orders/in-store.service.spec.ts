import { InStoreService } from './in-store.service';
import { DEFAULT_PICKUP_RULES, zonedWallToUtc } from './pickup-rules';
import { stockKey } from './product-stock.service';

// Monday 2 Nov 2026, 15:10 in Kuala Lumpur: open, before the cut-off.
const NOW = zonedWallToUtc('2026-11-02', '15:10', 'Asia/Kuala_Lumpur');

function makeService(left: Record<string, number | null>) {
  const prisma = {
    shopProduct: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'strawberry-shortcake', category: 'whole_cakes' },
        { id: 'latte', category: 'drinks' },
      ]),
      findUnique: jest.fn().mockResolvedValue({ name: 'Strawberry Shortcake' }),
    },
  };
  const pickupRules = {
    getRules: jest.fn().mockResolvedValue(DEFAULT_PICKUP_RULES),
  };
  const productStock = {
    getSellableQty: jest.fn(
      (productId: string, _date: string, variant: string) =>
        Promise.resolve(left[stockKey(productId, variant)] ?? null),
    ),
  };
  return {
    svc: new InStoreService(
      prisma as never,
      pickupRules as never,
      productStock as never,
    ),
    productStock,
  };
}

const cake = (variantLabel: string, qty = 1) => ({
  productId: 'strawberry-shortcake',
  variantLabel,
  qty,
});

describe('InStoreService.quote', () => {
  it('is available when every cake size has enough left today', async () => {
    const { svc } = makeService({
      'strawberry-shortcake|6 inch': 2,
      'strawberry-shortcake|Slice': 5,
    });
    const quote = await svc.quote(
      [cake('6 inch'), cake('Slice', 3), { productId: 'latte', qty: 2 }],
      NOW,
    );
    expect(quote).toMatchObject({
      available: true,
      reason: null,
      today: '2026-11-02',
      readyFrom: '3:40 PM',
    });
    // Drinks are not counted by the kitchen, so they are not checked.
    expect(quote.lines.map((l) => l.variantLabel)).toEqual(['6 inch', 'Slice']);
  });

  it('is not available for a size the kitchen did not count', async () => {
    const { svc } = makeService({ 'strawberry-shortcake|6 inch': 2 });
    const quote = await svc.quote([cake('8 inch')], NOW);
    expect(quote.available).toBe(false);
    expect(quote.reason).toContain('Strawberry Shortcake (8 inch)');
    expect(quote.readyFrom).toBeNull();
  });

  it('adds up the same size across lines before checking', async () => {
    const { svc } = makeService({ 'strawberry-shortcake|6 inch': 2 });
    const quote = await svc.quote([cake('6 inch', 2), cake('6 inch', 1)], NOW);
    expect(quote.available).toBe(false);
    expect(quote.reason).toBe(
      'Only 2 Strawberry Shortcake (6 inch) left on the shelf.',
    );
  });

  it('refuses a whole cake when only slices are on the shelf', async () => {
    const { svc } = makeService({ 'strawberry-shortcake|Slice': 8 });
    expect((await svc.quote([cake('Slice')], NOW)).available).toBe(true);
    const quote = await svc.quote([cake('6 inch')], NOW);
    expect(quote.available).toBe(false);
    expect(quote.reason).toContain("isn't on the shelf");
    const late = zonedWallToUtc('2026-11-02', '22:00', 'Asia/Kuala_Lumpur');
    expect((await svc.quote([cake('8 inch')], late)).available).toBe(false);
  });

  it('sells from the shelf after the cut-off, for the next open day', async () => {
    const { svc } = makeService({ 'strawberry-shortcake|6 inch': 5 });
    const late = zonedWallToUtc('2026-11-02', '20:45', 'Asia/Kuala_Lumpur');
    const quote = await svc.quote([cake('6 inch')], late);
    expect(quote).toMatchObject({
      available: true,
      reason: null,
      readyFrom: '10:00 AM',
      collectOn: 'Tue 3 Nov',
    });
    expect(await svc.collection(late)).toEqual({
      scheduledDate: '2026-11-03',
      summaryLines: [
        'Self pickup',
        'Date: 2026-11-03',
        'Time: 10:00',
        'From shelf stock',
      ],
    });
  });

  it('keeps same-day orders on the prepare-now lane', async () => {
    const { svc } = makeService({});
    expect(await svc.collection(NOW)).toEqual({
      scheduledDate: null,
      summaryLines: ['In store · prepare now', 'Collect today from 3:40 PM'],
    });
  });
});
