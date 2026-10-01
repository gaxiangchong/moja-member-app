import {
  applySalesplaySyncPlan,
  buildSalesplaySyncPlan,
  findSalesplayCodeConflict,
  normalizeProductName,
  splitSalesplayProductName,
  suggestProductForName,
  toSalesplayCsvRows,
} from './salesplay-catalog-sync';
import type { ShopCatalogProduct } from './shop-catalog.service';

/** A row in the shape `csv-parse` hands back for the Back Office export. */
function csvRecord(
  code: string,
  name: string,
  category: string,
  price: string,
  status = 'ENABLE',
): Record<string, string> {
  return {
    'Product code': code,
    'Product name': name,
    Category: category,
    'Sub category': '',
    'Price(MYR)': price,
    'Cost(MYR)': '0.00',
    'Stock control mode': 'OFF',
    'In hand stock': '0',
    'Price change enable': 'OFF',
    Barcode: code,
    'Tax code': '',
    'Safety stock': '',
    'Product status': status,
  };
}

function product(over: Partial<ShopCatalogProduct>): ShopCatalogProduct {
  return {
    id: 'p',
    category: 'whole_cakes',
    name: 'P',
    shortDescription: '',
    description: '',
    imageUrl: '',
    basePriceCents: 0,
    isActive: true,
    sortOrder: 0,
    ...over,
  };
}

describe('splitSalesplayProductName', () => {
  it('reads the size suffix as a variant label', () => {
    expect(splitSalesplayProductName('Caramel Espresso Gateau (6in)')).toEqual({
      baseName: 'Caramel Espresso Gateau',
      variantLabel: '6 inch',
    });
    // The export mixes casing: (8In) and (slice).
    expect(splitSalesplayProductName('Gula Melaka Basque (8In)')).toEqual({
      baseName: 'Gula Melaka Basque',
      variantLabel: '8 inch',
    });
    expect(splitSalesplayProductName('Citron Pavot (slice)')).toEqual({
      baseName: 'Citron Pavot',
      variantLabel: 'Slice',
    });
    expect(splitSalesplayProductName('Latte (Hot)')).toEqual({
      baseName: 'Latte',
      variantLabel: 'Hot',
    });
  });

  it('leaves brackets that are part of the name alone', () => {
    // Otherwise "Bento (Promo)" would silently become a size of "Bento", and
    // every MERDEKA PROMO flavour a size of one promo product.
    expect(splitSalesplayProductName('Bento (Promo)')).toEqual({
      baseName: 'Bento (Promo)',
      variantLabel: null,
    });
    expect(splitSalesplayProductName('MERDEKA PROMO (citron)')).toEqual({
      baseName: 'MERDEKA PROMO (citron)',
      variantLabel: null,
    });
    expect(splitSalesplayProductName('Delivery Charges (10)')).toEqual({
      baseName: 'Delivery Charges (10)',
      variantLabel: null,
    });
  });
});

describe('normalizeProductName', () => {
  it('ignores spacing and punctuation so the same cake matches', () => {
    expect(normalizeProductName('Maison Strawberry Short Cake')).toBe(
      normalizeProductName('Maison Strawberry Shortcake'),
    );
  });
});

describe('suggestProductForName', () => {
  // The three real mismatches between this catalog and the POS export.
  const catalog = [
    product({ id: 'matcha-marmalade', name: 'Matcha Marmalade' }),
    product({ id: 'citron-basque-cheesecake', name: 'Citron Basque' }),
    product({ id: 'pistachio-noir-cheesecake', name: 'Pistachio Noir' }),
    product({ id: 'mixed-fruit-basque-cheesecake', name: 'Original Basque' }),
    product({ id: 'truffle-basque-cheesecake', name: 'Truffle Noir' }),
  ];

  it('spots the same product under a longer POS name', () => {
    expect(suggestProductForName('Matcha Marmalade Gateau', catalog)).toBe(
      'matcha-marmalade',
    );
    expect(suggestProductForName('Citron Blossom Basque', catalog)).toBe(
      'citron-basque-cheesecake',
    );
  });

  it('spots the same product spelled differently on the till', () => {
    expect(suggestProductForName('Pistache Noir', catalog)).toBe(
      'pistachio-noir-cheesecake',
    );
  });

  it('stays quiet when it cannot be sure', () => {
    // Shares only "Basque", and the rest is nothing like an existing cake.
    expect(suggestProductForName('Gula Melaka Basque', catalog)).toBeNull();
    // A single shared word never suggests.
    expect(suggestProductForName('Americano', catalog)).toBeNull();
    // Short names have to be near-identical, or every drink would match one.
    expect(suggestProductForName('Koko', catalog)).toBeNull();
    // Two cakes are equally close, so there is no single answer.
    expect(
      suggestProductForName('Noir', [
        product({ id: 'a', name: 'Noira' }),
        product({ id: 'b', name: 'Noire' }),
      ]),
    ).toBeNull();
  });
});

describe('toSalesplayCsvRows', () => {
  it('parses codes, prices and status, and reports unusable rows', () => {
    const { rows, skipped } = toSalesplayCsvRows([
      csvRecord(
        '30003-105',
        'Caramel Espresso Gateau (6in)',
        'Creamcake',
        '159.00',
      ),
      csvRecord('40012-132', 'Latte (Hot)', 'Drinks', '10.00', 'DISABLE'),
      csvRecord('', 'No code here', 'Drinks', '5.00'),
      csvRecord('30003-105', 'Duplicated code', 'Creamcake', '1.00'),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      code: '30003-105',
      baseName: 'Caramel Espresso Gateau',
      variantLabel: '6 inch',
      priceCents: 15900,
      enabled: true,
    });
    expect(rows[1].enabled).toBe(false);
    expect(skipped.map((s) => s.reason)).toEqual([
      'No product code',
      'Duplicate product code "30003-105"',
    ]);
  });
});

describe('buildSalesplaySyncPlan', () => {
  const catalog = [
    product({
      id: 'caramel-espresso-gateau',
      name: 'Caramel Espresso Gateau',
      basePriceCents: 15900,
      variants: [
        { id: 'v6', label: '6 inch', priceCents: 15900 },
        { id: 'v8', label: '8 inch', priceCents: 22800 },
      ],
    }),
    product({
      id: 'strawberry-shortcake',
      name: 'Maison Strawberry Short Cake',
      basePriceCents: 14900,
      variants: [{ id: 's6', label: '6 inch', priceCents: 14900 }],
    }),
  ];

  const rows = toSalesplayCsvRows([
    csvRecord(
      '30003-105',
      'Caramel Espresso Gateau (6in)',
      'Creamcake',
      '159.00',
    ),
    csvRecord(
      '30003-106',
      'Caramel Espresso Gateau (8In)',
      'Creamcake',
      '235.00',
    ),
    csvRecord(
      '30003-107',
      'Caramel Espresso Gateau (slice)',
      'Creamcake',
      '24.00',
    ),
    csvRecord(
      '30002-105',
      'Maison Strawberry Shortcake (6in)',
      'Creamcake',
      '149.00',
    ),
    csvRecord('600316-160', 'Gula Melaka Basque (6in)', 'Cheesecake', '168.00'),
    csvRecord('19002-132', 'Delivery Charges (10)', 'Delivery', '10.00'),
    csvRecord('600210', 'GrabFood Bento', 'GrabFood', '17.90'),
  ]);

  it('leaves till-only categories out of scope by default', () => {
    const plan = buildSalesplaySyncPlan(catalog, rows);
    const included = plan.categories
      .filter((c) => c.included)
      .map((c) => c.name);
    expect(included.sort()).toEqual(['Cheesecake', 'Creamcake']);
    expect(plan.summary.csvRowsInScope).toBe(5);
    // Nothing from Delivery / GrabFood reaches the diff at all.
    expect(plan.csvOnly.map((r) => r.code)).not.toContain('19002-132');
    expect(plan.csvOnly.map((r) => r.code)).not.toContain('600210');
  });

  it('matches on name plus size, even across spelling differences', () => {
    const plan = buildSalesplaySyncPlan(catalog, rows);
    const byCode = new Map(plan.matched.map((m) => [m.code, m]));
    expect(byCode.get('30003-105')).toMatchObject({
      productId: 'caramel-espresso-gateau',
      variantLabel: '6 inch',
      via: 'name',
      codeAction: 'set',
    });
    expect(byCode.get('30002-105')).toMatchObject({
      productId: 'strawberry-shortcake',
      variantLabel: '6 inch',
    });
    // 8 inch is RM235 in the POS but RM228 in the app.
    expect(byCode.get('30003-106')).toMatchObject({
      priceAction: 'set',
      currentPriceCents: 22800,
      csvPriceCents: 23500,
    });
  });

  it('calls a missing size a new variant and an unknown cake a new product', () => {
    const plan = buildSalesplaySyncPlan(catalog, rows);
    const slice = plan.csvOnly.find((r) => r.code === '30003-107');
    expect(slice).toMatchObject({
      kind: 'new-variant',
      variantLabel: 'Slice',
      suggestedProductId: 'caramel-espresso-gateau',
    });
    expect(plan.csvOnly.find((r) => r.code === '600316-160')).toMatchObject({
      kind: 'new-product',
      baseName: 'Gula Melaka Basque',
      suggestedProductId: null,
    });
  });

  it('lists what the app sells that the POS export does not', () => {
    // A cake with no POS product at all: in-store sales of it can never be
    // matched back, and an online order for it cannot be pushed.
    const withGhost = [
      ...catalog,
      product({
        id: 'retired-cake',
        name: 'Retired Cake',
        basePriceCents: 9900,
      }),
    ];
    const plan = buildSalesplaySyncPlan(withGhost, rows);
    expect(plan.catalogOnly).toEqual([
      expect.objectContaining({
        productId: 'retired-cake',
        variantLabel: null,
        currentCode: null,
        reason: 'missing',
      }),
    ]);
  });

  it('flags a matched product that the POS has switched off', () => {
    const mapped = [
      product({
        id: 'rocher-noir',
        name: 'Rocher Noir Basque',
        salesplayProductCode: '60014-143',
      }),
    ];
    const disabled = toSalesplayCsvRows([
      csvRecord(
        '60014-143',
        'Rocher Noir Basque (6in)',
        'Cheesecake',
        '228.00',
        'DISABLE',
      ),
    ]);
    const plan = buildSalesplaySyncPlan(mapped, disabled);
    expect(plan.matched[0]).toMatchObject({
      code: '60014-143',
      enabled: false,
    });
    expect(plan.summary.matchedDisabled).toBe(1);
  });

  it('does not treat a category it was told to ignore as a dropped product', () => {
    const bento = [
      product({ id: 'bento', name: 'Bento', salesplayProductCode: '600208' }),
    ];
    const withBento = buildSalesplaySyncPlan(
      bento,
      toSalesplayCsvRows([csvRecord('600208', 'Bento', 'Bento', '17.90')]),
      { missingAction: 'delete' },
    );
    expect(withBento.catalogOnly[0]).toMatchObject({
      productId: 'bento',
      reason: 'out-of-scope',
      action: 'keep',
      blockedReason: 'Its SalesPlay category is not being synced',
    });
  });

  it('prefers a code already stored on the product over the name', () => {
    const renamed = [
      product({
        id: 'caramel-espresso-gateau',
        name: 'Something Else Entirely',
        variants: [{ id: 'v6', label: '6 inch', priceCents: 15900 }],
        salesplayVariantCodes: { '6 inch': '30003-105' },
      }),
    ];
    const plan = buildSalesplaySyncPlan(renamed, rows);
    expect(plan.matched[0]).toMatchObject({
      code: '30003-105',
      via: 'code',
      codeAction: 'unchanged',
    });
  });

  it('honours a manual assignment over both', () => {
    const plan = buildSalesplaySyncPlan(catalog, rows, {
      assignments: [
        {
          code: '600316-160',
          productId: 'strawberry-shortcake',
          variantLabel: '6 inch',
        },
      ],
    });
    expect(plan.matched.find((m) => m.code === '600316-160')).toMatchObject({
      productId: 'strawberry-shortcake',
      via: 'manual',
    });
  });

  it('skips a price the admin edited by hand', () => {
    const locked = [
      product({
        ...catalog[0],
        syncOverrides: ['variants', 'basePriceCents', 'priceDisplay'],
      }),
    ];
    const plan = buildSalesplaySyncPlan(locked, rows, { updatePrices: true });
    expect(plan.matched.find((m) => m.code === '30003-106')?.priceAction).toBe(
      'locked',
    );
    expect(plan.summary.pricesToWrite).toBe(0);
    expect(plan.summary.pricesLocked).toBe(1);
  });
});

describe('applySalesplaySyncPlan', () => {
  const catalog = [
    product({
      id: 'caramel-espresso-gateau',
      name: 'Caramel Espresso Gateau',
      basePriceCents: 15900,
      variants: [
        { id: 'v6', label: '6 inch', priceCents: 15900 },
        { id: 'v8', label: '8 inch', priceCents: 22800 },
      ],
    }),
  ];
  const rows = toSalesplayCsvRows([
    csvRecord(
      '30003-105',
      'Caramel Espresso Gateau (6in)',
      'Creamcake',
      '159.00',
    ),
    csvRecord(
      '30003-106',
      'Caramel Espresso Gateau (8In)',
      'Creamcake',
      '235.00',
    ),
    csvRecord(
      '30003-107',
      'Caramel Espresso Gateau (slice)',
      'Creamcake',
      '24.00',
    ),
    csvRecord('600316-160', 'Gula Melaka Basque (6in)', 'Cheesecake', '168.00'),
    csvRecord('600316-161', 'Gula Melaka Basque (8In)', 'Cheesecake', '228.00'),
  ]);

  it('writes variant codes and leaves prices alone by default', () => {
    const plan = buildSalesplaySyncPlan(catalog, rows);
    const { updated, created } = applySalesplaySyncPlan(catalog, plan);
    expect(created).toEqual([]);
    expect(updated).toHaveLength(1);
    expect(updated[0].salesplayVariantCodes).toEqual({
      '6 inch': '30003-105',
      '8 inch': '30003-106',
    });
    expect(updated[0].variants?.[1].priceCents).toBe(22800);
  });

  it('copies POS prices and reprices the "from" figure when asked', () => {
    const plan = buildSalesplaySyncPlan(catalog, rows, { updatePrices: true });
    const { updated } = applySalesplaySyncPlan(catalog, plan);
    expect(updated[0].variants?.[1]).toMatchObject({
      priceCents: 23500,
      priceDisplay: 'RM235.00',
    });
    expect(updated[0].basePriceCents).toBe(15900);
  });

  it('adds a missing size to the product that already exists', () => {
    const plan = buildSalesplaySyncPlan(catalog, rows, {
      createMissingVariants: true,
    });
    const { updated } = applySalesplaySyncPlan(catalog, plan);
    expect(updated[0].variants?.map((v) => v.label)).toEqual([
      '6 inch',
      '8 inch',
      'Slice',
    ]);
    expect(updated[0].salesplayVariantCodes?.['Slice']).toBe('30003-107');
  });

  it('creates one hidden product carrying all of its sizes', () => {
    const plan = buildSalesplaySyncPlan(catalog, rows, {
      createMissingProducts: true,
    });
    const { created } = applySalesplaySyncPlan(catalog, plan);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      id: 'gula-melaka-basque',
      name: 'Gula Melaka Basque',
      category: 'whole_cakes',
      basePriceCents: 16800,
      // Imported without a photo or copy, so it must not go live on its own.
      isActive: false,
      salesplayVariantCodes: { '6 inch': '600316-160', '8 inch': '600316-161' },
    });
    expect(created[0].variants?.map((v) => v.label)).toEqual([
      '6 inch',
      '8 inch',
    ]);
  });

  it('never creates a product the POS has disabled or prices at zero', () => {
    const promo = toSalesplayCsvRows([
      csvRecord('100016-177', 'MERDEKA PROMO citron', 'Cheesecake', '0.00'),
      csvRecord(
        '60014-143',
        'Rocher Noir Basque (6in)',
        'Cheesecake',
        '228.00',
        'DISABLE',
      ),
    ]);
    const plan = buildSalesplaySyncPlan(catalog, promo, {
      createMissingProducts: true,
    });
    expect(plan.summary.productsToCreate).toBe(0);
    expect(plan.csvOnly.map((r) => r.skipReason).sort()).toEqual([
      'Disabled in SalesPlay',
      'No price in SalesPlay',
    ]);
    expect(applySalesplaySyncPlan(catalog, plan).created).toEqual([]);
  });

  it('keeps a product whose other size still sells in store', () => {
    // Only the 6" is exported, so the 8" is unmatched — but the cake is still
    // on sale and must not disappear from the app.
    const only6 = toSalesplayCsvRows([
      csvRecord(
        '30003-105',
        'Caramel Espresso Gateau (6in)',
        'Creamcake',
        '159.00',
      ),
    ]);
    const plan = buildSalesplaySyncPlan(catalog, only6, {
      missingAction: 'delete',
    });
    expect(plan.summary.toDelete).toBe(0);
    expect(plan.catalogOnly[0].blockedReason).toBe(
      'Another size of this product still sells in SalesPlay',
    );
    expect(applySalesplaySyncPlan(catalog, plan).deleted).toEqual([]);
  });

  const gone = toSalesplayCsvRows([
    csvRecord('600316-160', 'Gula Melaka Basque (6in)', 'Cheesecake', '168.00'),
  ]);

  it('hides a product the export dropped entirely', () => {
    const plan = buildSalesplaySyncPlan(catalog, gone, {
      missingAction: 'hide',
    });
    expect(plan.summary.toHide).toBe(1);
    expect(plan.summary.toDelete).toBe(0);
    const { hidden, deleted } = applySalesplaySyncPlan(catalog, plan);
    expect(deleted).toEqual([]);
    expect(hidden.map((p) => p.id)).toEqual(['caramel-espresso-gateau']);
    expect(hidden[0].isActive).toBe(false);
  });

  it('deletes a product the export dropped entirely', () => {
    const plan = buildSalesplaySyncPlan(catalog, gone, {
      missingAction: 'delete',
    });
    expect(plan.summary.toDelete).toBe(1);
    const { deleted, updated } = applySalesplaySyncPlan(catalog, plan);
    expect(deleted.map((p) => p.id)).toEqual(['caramel-espresso-gateau']);
    // No point saving a code onto something that is about to be removed.
    expect(updated).toEqual([]);
  });

  it('will not remove a product that is mid-order', () => {
    const plan = buildSalesplaySyncPlan(catalog, gone, {
      missingAction: 'delete',
      productIdsWithOpenOrders: ['caramel-espresso-gateau'],
    });
    expect(plan.summary.toDelete).toBe(0);
    expect(plan.catalogOnly[0].blockedReason).toBe(
      'An order for this is still open',
    );
    expect(applySalesplaySyncPlan(catalog, plan).deleted).toEqual([]);
  });

  it('will not remove a product the POS merely renamed', () => {
    // "Caramel Espresso Gateau" is gone from the export, but "Caramel Espresso
    // Gateau Deluxe" is in it — almost certainly the same cake, so deleting it
    // (and its photos) would be the wrong call.
    const renamed = toSalesplayCsvRows([
      csvRecord(
        '30003-201',
        'Caramel Espresso Gateau Deluxe (6in)',
        'Creamcake',
        '165.00',
      ),
    ]);
    const plan = buildSalesplaySyncPlan(catalog, renamed, {
      missingAction: 'delete',
    });
    expect(plan.summary.toDelete).toBe(0);
    expect(plan.summary.removalBlocked).toBe(1);
    expect(plan.catalogOnly[0].blockedReason).toContain(
      'Caramel Espresso Gateau Deluxe',
    );
    expect(applySalesplaySyncPlan(catalog, plan).deleted).toEqual([]);
  });

  it('removes it once the admin maps the renamed code by hand', () => {
    const plan = buildSalesplaySyncPlan(catalog, gone, {
      missingAction: 'delete',
      assignments: [
        {
          code: '600316-160',
          productId: 'caramel-espresso-gateau',
          variantLabel: '6 inch',
        },
      ],
    });
    // Mapped, so it is no longer missing — and its 8 inch sibling is spared too.
    expect(plan.summary.toDelete).toBe(0);
    expect(plan.matched[0]).toMatchObject({
      productId: 'caramel-espresso-gateau',
      via: 'manual',
    });
  });
});

describe('one POS code, one product', () => {
  const cake = {
    id: 'cake',
    name: 'Caramel Cake',
    salesplayProductCode: null,
    salesplayVariantCodes: { '6 inch': '30003-105', '8 inch': '30003-106' },
  };
  const loaf = {
    id: 'loaf',
    name: 'Banana Loaf',
    salesplayProductCode: '20001',
    salesplayVariantCodes: undefined,
  };

  it('allows codes nobody else uses', () => {
    expect(
      findSalesplayCodeConflict(
        { ...loaf, salesplayProductCode: '20002' },
        [cake, loaf],
        loaf,
      ),
    ).toBeNull();
  });

  it("refuses a code that is another product's — product-level or per size, any case", () => {
    expect(
      findSalesplayCodeConflict(
        { ...loaf, salesplayProductCode: '30003-105' },
        [cake, loaf],
        loaf,
      ),
    ).toMatch(/already belongs to "Caramel Cake"/);
    expect(
      findSalesplayCodeConflict(
        { ...cake, salesplayVariantCodes: { '6 inch': '20001' } },
        [cake, loaf],
        cake,
      ),
    ).toMatch(/already belongs to "Banana Loaf"/);
    expect(
      findSalesplayCodeConflict(
        { id: 'new', name: 'New', salesplayProductCode: 'ABC' },
        [{ ...loaf, salesplayProductCode: 'abc' }],
      ),
    ).toMatch(/already belongs/);
  });

  it('refuses the same code twice on one product', () => {
    expect(
      findSalesplayCodeConflict(
        {
          ...cake,
          salesplayVariantCodes: { '6 inch': 'X1', '8 inch': 'x1' },
        },
        [cake],
        cake,
      ),
    ).toMatch(/more than once/);
  });

  it('still lets a product that already carries a clash be edited', () => {
    const clashing = { ...loaf, salesplayProductCode: '30003-105' };
    expect(
      findSalesplayCodeConflict(clashing, [cake, clashing], clashing),
    ).toBeNull();
  });

  it('does not clash with itself', () => {
    expect(findSalesplayCodeConflict(cake, [cake, loaf], undefined)).toBeNull();
  });
});

describe('adding an unmatched POS item to an existing product as a new size', () => {
  const sized = product({
    id: 'matcha-marmalade',
    name: 'Matcha Marmalade',
    basePriceCents: 15900,
    variants: [{ id: 'm6', label: '6 inch', priceCents: 15900 }],
    salesplayVariantCodes: { '6 inch': '30001-105' },
  });
  const plain = product({
    id: 'americano',
    name: 'Americano',
    category: 'drinks',
    basePriceCents: 900,
    salesplayProductCode: 'D-1',
  });
  const rows = toSalesplayCsvRows([
    csvRecord(
      '30001-105',
      'Matcha Marmalade Gateau (6in)',
      'Creamcake',
      '159.00',
    ),
    csvRecord(
      '30001-109',
      'Matcha Marmalade Special Cut',
      'Creamcake',
      '28.00',
    ),
    csvRecord('D-2', 'Americano Large', 'Drinks', '12.00'),
    csvRecord('D-3', 'Americano XL', 'Drinks', '14.00'),
    csvRecord('D-9', 'Free Sample', 'Drinks', '0.00'),
  ]);
  const plan = (
    assignments: {
      code: string;
      productId: string;
      newSizeLabel?: string;
      variantLabel?: string | null;
    }[],
    products = [sized, plain],
  ) => buildSalesplaySyncPlan(products, rows, { assignments });

  it('plans the new size instead of leaving the row unmatched', () => {
    const p = plan([
      {
        code: '30001-109',
        productId: 'matcha-marmalade',
        newSizeLabel: 'Special Cut',
      },
    ]);
    expect(p.sizeAdditions).toEqual([
      expect.objectContaining({
        code: '30001-109',
        productId: 'matcha-marmalade',
        sizeLabel: 'Special Cut',
        csvPriceCents: 2800,
        convertsPlain: false,
      }),
    ]);
    expect(p.summary.sizesToAdd).toBe(1);
    expect(p.csvOnly.map((r) => r.code)).not.toContain('30001-109');
  });

  it('adds the size, its price and its POS code to the product', () => {
    const p = plan([
      {
        code: '30001-109',
        productId: 'matcha-marmalade',
        newSizeLabel: 'Special Cut',
      },
    ]);
    const { updated } = applySalesplaySyncPlan([sized, plain], p);
    const next = updated.find((x) => x.id === 'matcha-marmalade')!;
    expect(next.variants?.map((v) => [v.label, v.priceCents])).toEqual([
      ['6 inch', 15900],
      ['Special Cut', 2800],
    ]);
    expect(next.salesplayVariantCodes).toEqual({
      '6 inch': '30001-105',
      'Special Cut': '30001-109',
    });
    expect(new Set(next.variants?.map((v) => v.id)).size).toBe(2);
  });

  it('turns a single-item product into a sized one, keeping its price and code', () => {
    const p = plan([
      { code: 'D-2', productId: 'americano', newSizeLabel: 'Large' },
    ]);
    expect(p.sizeAdditions[0].convertsPlain).toBe(true);
    const { updated } = applySalesplaySyncPlan([sized, plain], p);
    const next = updated.find((x) => x.id === 'americano')!;
    expect(next.variants?.map((v) => [v.label, v.priceCents])).toEqual([
      ['Regular', 900],
      ['Large', 1200],
    ]);
    expect(next.salesplayVariantCodes).toEqual({
      Regular: 'D-1',
      Large: 'D-2',
    });
    expect(next.salesplayProductCode).toBeUndefined();
  });

  it('converts a single-item product only once when two sizes are added', () => {
    const p = plan([
      { code: 'D-2', productId: 'americano', newSizeLabel: 'Large' },
      { code: 'D-3', productId: 'americano', newSizeLabel: 'XL' },
    ]);
    expect(p.sizeAdditions.map((a) => a.convertsPlain)).toEqual([true, false]);
    const { updated } = applySalesplaySyncPlan([sized, plain], p);
    const next = updated.find((x) => x.id === 'americano')!;
    expect(next.variants?.map((v) => v.label)).toEqual([
      'Regular',
      'Large',
      'XL',
    ]);
  });

  it('refuses a size name that is already taken, and says why', () => {
    const p = plan([
      {
        code: '30001-109',
        productId: 'matcha-marmalade',
        newSizeLabel: '6 INCH',
      },
    ]);
    // Same size already exists → treated as a plain mapping onto it.
    expect(p.sizeAdditions).toHaveLength(0);
    expect(p.matched.find((m) => m.code === '30001-109')?.via).toBe('manual');

    const dup = plan([
      { code: 'D-2', productId: 'americano', newSizeLabel: 'Large' },
      { code: 'D-3', productId: 'americano', newSizeLabel: 'large' },
    ]);
    expect(dup.sizeAdditions).toHaveLength(1);
    expect(dup.csvOnly.find((r) => r.code === 'D-3')?.skipReason).toMatch(
      /already being added/,
    );
  });

  it('will not add an item with no price', () => {
    const p = plan([
      { code: 'D-9', productId: 'americano', newSizeLabel: 'Sample' },
    ]);
    expect(p.sizeAdditions).toHaveLength(0);
    expect(p.csvOnly.find((r) => r.code === 'D-9')?.skipReason).toBe(
      'No price in SalesPlay',
    );
  });

  it('keeps the product it was added to from being hidden or deleted', () => {
    const only = [product({ id: 'solo', name: 'Solo', basePriceCents: 500 })];
    const p = buildSalesplaySyncPlan(
      only,
      toSalesplayCsvRows([csvRecord('X-1', 'Solo Big', 'Drinks', '9.00')]),
      {
        missingAction: 'delete',
        assignments: [{ code: 'X-1', productId: 'solo', newSizeLabel: 'Big' }],
      },
    );
    expect(applySalesplaySyncPlan(only, p).deleted).toHaveLength(0);
  });
});
