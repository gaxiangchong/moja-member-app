/**
 * The shop page's in-store / pre-order split.
 *
 * The logic ships in `client-web/src/shop/lib/availability.ts`; client-web has
 * no test runner of its own, so the rules are re-stated here and exercised
 * against the same cases. Keep the two in step — the duplication is deliberate
 * and the alternative is no coverage at all on the decision that governs what
 * members are allowed to see.
 */

type Rules = {
  preorder: { days: number; categories: string[] };
  inStore: { enabled: boolean; categories: string[]; openNow: boolean };
};

type Availability = {
  inStoreToday: boolean;
  needsPreorder: boolean;
  stockTracked: boolean;
  totalLeftToday: number | null;
};

function classify(
  product: { category: string },
  rules: Rules | null,
  stock: Record<string, number> = {},
): Availability {
  const counted = Object.values(stock ?? {});
  const totalLeftToday = counted.length
    ? counted.reduce((sum, n) => sum + Math.max(0, n), 0)
    : null;
  if (!rules) {
    return {
      inStoreToday: true,
      needsPreorder: false,
      stockTracked: false,
      totalLeftToday,
    };
  }
  const isPreorderCategory =
    rules.preorder.days > 0 &&
    rules.preorder.categories.includes(product.category);
  const isInStoreCategory =
    rules.inStore.enabled &&
    rules.inStore.categories.includes(product.category);
  const inStoreToday = isInStoreCategory
    ? rules.inStore.openNow && (totalLeftToday ?? 0) > 0
    : !isPreorderCategory;
  return {
    inStoreToday,
    needsPreorder: isPreorderCategory,
    stockTracked: isInStoreCategory,
    totalLeftToday,
  };
}

function productInTab(a: Availability, tab: 'today' | 'preorder'): boolean {
  if (tab === 'today') return a.inStoreToday;
  return a.needsPreorder || a.stockTracked;
}

/** The shipped defaults: whole cakes are in BOTH lists. */
const OPEN: Rules = {
  preorder: { days: 2, categories: ['whole_cakes'] },
  inStore: { enabled: true, categories: ['whole_cakes'], openNow: true },
};
const SHUT: Rules = { ...OPEN, inStore: { ...OPEN.inStore, openNow: false } };

const cake = { category: 'whole_cakes' };
const cookie = { category: 'cake_slices' };
const drink = { category: 'drinks' };

const tabsFor = (p: { category: string }, r: Rules | null, s = {}) => {
  const a = classify(p, r, s);
  return (['today', 'preorder'] as const).filter((t) => productInTab(a, t));
};

describe('a cake the kitchen baked today', () => {
  it('shows in both tabs — collectable now, bookable later', () => {
    expect(tabsFor(cake, OPEN, { '6 inch': 3 })).toEqual(['today', 'preorder']);
  });

  it('reports what is left per size', () => {
    expect(
      classify(cake, OPEN, { '6 inch': 3, '8 inch': 1 }).totalLeftToday,
    ).toBe(4);
  });
});

describe('a cake that has sold out today', () => {
  it('drops out of the today tab but stays bookable', () => {
    expect(tabsFor(cake, OPEN, { '6 inch': 0 })).toEqual(['preorder']);
  });
});

describe('a cake the kitchen has not counted', () => {
  it('is not offered for today — absent is not zero, but it is not sellable', () => {
    expect(tabsFor(cake, OPEN, {})).toEqual(['preorder']);
  });

  it('keeps totalLeftToday null rather than claiming zero', () => {
    expect(classify(cake, OPEN, {}).totalLeftToday).toBeNull();
  });
});

describe('after the in-store cut-off', () => {
  it('moves every cake to pre-order only', () => {
    expect(tabsFor(cake, SHUT, { '6 inch': 3 })).toEqual(['preorder']);
  });

  it('leaves counter items alone — the shop is still open for those', () => {
    expect(tabsFor(cookie, SHUT)).toEqual(['today']);
    expect(tabsFor(drink, SHUT)).toEqual(['today']);
  });
});

describe('counter items (in neither category list)', () => {
  it('are in-store only, never pre-order', () => {
    expect(tabsFor(cookie, OPEN)).toEqual(['today']);
    expect(tabsFor(drink, OPEN)).toEqual(['today']);
  });

  it('are never stock-tracked, so they cannot read "sold out"', () => {
    expect(classify(cookie, OPEN).stockTracked).toBe(false);
  });
});

describe('a made-to-order line (pre-order only, never on the shelf)', () => {
  const custom = { category: 'custom_cakes' };
  const rules: Rules = {
    preorder: { days: 3, categories: ['whole_cakes', 'custom_cakes'] },
    inStore: { enabled: true, categories: ['whole_cakes'], openNow: true },
  };

  it('shows only under pre-order', () => {
    expect(tabsFor(custom, rules)).toEqual(['preorder']);
  });
});

describe('when the admin turns in-store off', () => {
  const off: Rules = { ...OPEN, inStore: { ...OPEN.inStore, enabled: false } };

  it('cakes become pre-order only, whatever the kitchen counted', () => {
    expect(tabsFor(cake, off, { '6 inch': 5 })).toEqual(['preorder']);
  });
});

describe('when the notice is set to zero', () => {
  const noNotice: Rules = {
    ...OPEN,
    preorder: { days: 0, categories: ['whole_cakes'] },
  };

  it('a cake with stock is in-store, and bookable because its stock can run out', () => {
    expect(tabsFor(cake, noNotice, { '6 inch': 2 })).toEqual([
      'today',
      'preorder',
    ]);
  });

  it('no product claims to need notice', () => {
    expect(classify(cake, noNotice, { '6 inch': 2 }).needsPreorder).toBe(false);
  });
});

describe('before the rules have loaded', () => {
  it('shows everything rather than flashing an empty shop', () => {
    expect(tabsFor(cake, null, { '6 inch': 3 })).toEqual(['today']);
    expect(tabsFor(cookie, null)).toEqual(['today']);
  });
});

/**
 * Size wording on an in-store card. Mirrors `sizesReadyLabel` in
 * `client-web/src/shop/lib/availability.ts`.
 *
 * No counts anywhere: "2 left" frames a freshly baked cake as a remainder.
 */
function sizesReadyLabel(leftBySize: Record<string, number>): string {
  const sizes = Object.entries(leftBySize)
    .filter(([, n]) => n > 0)
    .map(([label]) => label);
  if (sizes.length === 0) return '';
  if (sizes.length === 1) return `Ready in ${sizes[0]}`;
  const last = sizes[sizes.length - 1];
  return `Ready in ${sizes.slice(0, -1).join(', ')} and ${last}`;
}

describe('sizesReadyLabel', () => {
  it('names a single size', () => {
    expect(sizesReadyLabel({ '8 inch': 4 })).toBe('Ready in 8 inch');
  });

  it('joins two sizes with "and"', () => {
    expect(sizesReadyLabel({ '6 inch': 3, '8 inch': 1 })).toBe(
      'Ready in 6 inch and 8 inch',
    );
  });

  it('joins three with commas and a final "and"', () => {
    expect(sizesReadyLabel({ '6 inch': 1, '8 inch': 2, Slice: 5 })).toBe(
      'Ready in 6 inch, 8 inch and Slice',
    );
  });

  it('leaves out a size that has run out', () => {
    expect(sizesReadyLabel({ '6 inch': 0, '8 inch': 2 })).toBe(
      'Ready in 8 inch',
    );
  });

  it('is empty when nothing is on the shelf', () => {
    expect(sizesReadyLabel({ '6 inch': 0 })).toBe('');
    expect(sizesReadyLabel({})).toBe('');
  });

  it('leaks no stock count — the only digits are the size names themselves', () => {
    // 3 and 1 are the counts; 6 and 8 belong to the labels and must survive.
    const label = sizesReadyLabel({ '6 inch': 3, '8 inch': 1 });
    expect(label).toBe('Ready in 6 inch and 8 inch');
    expect(label.replace(/6 inch|8 inch/g, '')).not.toMatch(/\d/);
    expect(label).not.toMatch(/left|remaining|only|last/i);
  });

  it('reads the same whether one is on the shelf or fifty', () => {
    expect(sizesReadyLabel({ '6 inch': 1 })).toBe(
      sizesReadyLabel({ '6 inch': 50 }),
    );
  });
});
