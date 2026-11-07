import { BadRequestException } from '@nestjs/common';
import { ShopCatalogService } from './shop-catalog.service';

/**
 * The duplicate-size guard where it is actually wired: the admin write paths
 * refuse a repeat, the kitchen read collapses one, and an import drops it
 * rather than aborting the run.
 */

type Svc = ShopCatalogService & Record<string, unknown>;

function makeService(overrides: Record<string, unknown> = {}): {
  svc: Svc;
  saved: unknown[];
  warnings: string[];
} {
  const saved: unknown[] = [];
  const warnings: string[] = [];
  const svc = Object.create(ShopCatalogService.prototype) as Svc;
  const s = svc as unknown as Record<string, unknown>;
  s.logger = {
    warn: (m: string) => warnings.push(m),
    error: () => undefined,
    log: () => undefined,
  };
  s.loadAll = () => Promise.resolve([]);
  s.requireOne = () =>
    Promise.resolve({
      id: 'basque',
      name: 'Original Basque',
      category: 'whole_cakes',
      basePriceCents: 9000,
      variants: [{ id: 'basque__6-inch', label: '6 inch', priceCents: 9000 }],
    });
  s.assertSalesplayCodesFree = () => undefined;
  s.saveProduct = (p: unknown) => {
    saved.push(p);
    return Promise.resolve(p);
  };
  Object.assign(s, overrides);
  return { svc, saved, warnings };
}

const variant = (label: string, priceCents = 9000) => ({ label, priceCents });

describe('admin write paths refuse a repeated size', () => {
  it.each([
    ['an exact repeat', ['8 inch', '8 inch']],
    ['a different case', ['6 inch', '6 Inch']],
    ['a double space', ['6 inch', '6  inch']],
    ['leading whitespace', ['6 inch', '  6 inch']],
  ])('updateProduct rejects %s', async (_name, labels) => {
    const { svc, saved } = makeService();
    await expect(
      svc.updateProduct('basque', {
        name: 'Original Basque',
        variants: labels.map((l) => variant(l)),
      }),
    ).rejects.toThrow(BadRequestException);
    expect(saved).toHaveLength(0);
  });

  it('createProduct rejects it too', async () => {
    const { svc, saved } = makeService();
    await expect(
      svc.createProduct({
        name: 'New Cake',
        category: 'whole_cakes',
        variants: [variant('6 inch'), variant('6 INCH')],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(saved).toHaveLength(0);
  });

  it('names both spellings so the admin can see which to fix', async () => {
    const { svc } = makeService();
    await expect(
      svc.updateProduct('basque', {
        name: 'Original Basque',
        variants: [variant('6 inch'), variant('6 Inch')],
      }),
    ).rejects.toThrow(/"6 inch" and "6 Inch"/);
  });

  it('lets genuinely different sizes through', async () => {
    const { svc, saved } = makeService();
    await svc.updateProduct('basque', {
      name: 'Original Basque',
      variants: [variant('6 inch'), variant('8 inch', 12500)],
    });
    expect(saved).toHaveLength(1);
    const labels = (saved[0] as { variants: { label: string }[] }).variants.map(
      (v) => v.label,
    );
    expect(labels).toEqual(['6 inch', '8 inch']);
  });

  it('stores the tidied label, keeping the casing', async () => {
    const { svc, saved } = makeService();
    await svc.updateProduct('basque', {
      name: 'Original Basque',
      variants: [variant('  6   Inch ')],
    });
    const labels = (saved[0] as { variants: { label: string }[] }).variants.map(
      (v) => v.label,
    );
    expect(labels).toEqual(['6 Inch']);
  });
});

describe('listKitchenStock collapses a stored repeat', () => {
  const row = (id: string, name: string, labels: string[]) => ({
    id,
    name,
    category: 'whole_cakes',
    isActive: true,
    sortOrder: 0,
    soldOut: false,
    shippable: false,
    salesplayProductCode: null,
    availableQty: null,
    document: {
      basePriceCents: 9000,
      variants: labels.map((label) => ({
        id: `${id}__${label}`,
        label,
        priceCents: 9000,
      })),
    },
  });

  function kitchenService(rows: unknown[]) {
    const { svc } = makeService({
      prisma: { shopProduct: { findMany: () => Promise.resolve(rows) } },
    });
    return svc;
  }

  it('gives one label per size even when the document repeats one', async () => {
    const svc = kitchenService([
      row('basque', 'Original Basque', ['6 inch', '6 Inch', '8 inch']),
    ]);
    const out = await svc.listKitchenStock();
    expect(out[0].variants).toEqual(['6 inch', '8 inch']);
  });

  it('leaves a clean product untouched', async () => {
    const svc = kitchenService([
      row('basque', 'Original Basque', ['6 inch', '8 inch']),
    ]);
    const out = await svc.listKitchenStock();
    expect(out[0].variants).toEqual(['6 inch', '8 inch']);
  });

  it('drops a blank label rather than making it an "Each" row', async () => {
    const svc = kitchenService([
      row('basque', 'Original Basque', ['6 inch', '   ']),
    ]);
    const out = await svc.listKitchenStock();
    expect(out[0].variants).toEqual(['6 inch']);
  });
});

describe('normalizeVariants (the import path) drops rather than throws', () => {
  it('keeps the first size and warns, so a sync run is not aborted', () => {
    const { svc, warnings } = makeService();
    const out = (
      svc as unknown as {
        normalizeVariants: (
          id: string,
          raw: { label: string; priceCents: number }[],
        ) => { label: string }[];
      }
    ).normalizeVariants('basque', [
      variant('6 inch'),
      variant('6  INCH', 9500),
      variant('8 inch', 12500),
    ]);
    expect(out.map((v) => v.label)).toEqual(['6 inch', '8 inch']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('duplicate size');
  });
});
