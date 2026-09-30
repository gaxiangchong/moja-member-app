/**
 * Sync the member shopping catalog against the SalesPlay POS product list.
 *
 * SalesPlay Back Office exports its products as CSV ("Product list-<date>.csv").
 * That file is the POS master: every code in it is what a receipt line carries
 * and what an online order has to be pushed as. This module turns that export
 * into a reviewable diff against the member catalog so the two stay on the same
 * product identities.
 *
 * Nothing here touches the database — `shop-catalog.service.ts` applies the
 * plan produced by {@link buildSalesplaySyncPlan}.
 */
import type {
  ShopCatalogProduct,
  ShopCatalogProductVariant,
} from './shop-catalog.service';

// ---------------------------------------------------------------------------
// CSV rows
// ---------------------------------------------------------------------------

export type SalesplayCsvRow = {
  /** SalesPlay "Product code" — the identity we map onto. */
  code: string;
  /** Full name as exported, e.g. `Caramel Espresso Gateau (6in)`. */
  name: string;
  /** Name with the size/serving suffix removed, e.g. `Caramel Espresso Gateau`. */
  baseName: string;
  /** Canonical variant label from the suffix, e.g. `6 inch`. Null when there is none. */
  variantLabel: string | null;
  /** SalesPlay category, e.g. `Creamcake`. */
  category: string;
  priceCents: number;
  /** `Product status` column — DISABLE rows are still parsed, never sold. */
  enabled: boolean;
};

export type SalesplayCsvSkippedRow = {
  line: number;
  name: string;
  reason: string;
};

export type SalesplayCsvParseResult = {
  rows: SalesplayCsvRow[];
  skipped: SalesplayCsvSkippedRow[];
};

/**
 * SalesPlay categories that exist for till/marketplace bookkeeping and must
 * never become storefront products: delivery-fee SKUs, the GrabFood mirror
 * catalog, bento (its own module), and the misc drawer.
 */
export const NON_CATALOG_SALESPLAY_CATEGORIES = [
  'Delivery',
  'GrabFood',
  'Bento',
  'OTHER',
];

/**
 * Trailing `(...)` fragments that mean "same product, different size/serve".
 * Anything else in brackets is part of the name, so `Bento (Promo)` stays its
 * own product rather than becoming a variant of `Bento`.
 */
const VARIANT_SUFFIXES: Record<string, string> = {
  '6in': '6 inch',
  '6inch': '6 inch',
  '6"': '6 inch',
  '8in': '8 inch',
  '8inch': '8 inch',
  '8"': '8 inch',
  slice: 'Slice',
  full: 'Full',
  whole: 'Full',
  hot: 'Hot',
  cold: 'Cold',
  iced: 'Iced',
};

/** SalesPlay category → member catalog category. */
export function mapSalesplayCategory(
  category: string,
  variantLabel: string | null,
): ShopCatalogProduct['category'] {
  if (variantLabel === 'Slice') return 'cake_slices';
  switch (category.trim().toLowerCase()) {
    case 'cheesecake':
    case 'creamcake':
    case 'loaf':
      return 'whole_cakes';
    case 'drinks':
      return 'drinks';
    default:
      return 'specials';
  }
}

/**
 * Splits `Gula Melaka Basque (6in)` into its base name and variant label.
 * Returns a null label when the bracketed part is not a known size/serve.
 */
export function splitSalesplayProductName(name: string): {
  baseName: string;
  variantLabel: string | null;
} {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  const match = /^(.*?)\s*\(([^()]+)\)$/.exec(trimmed);
  if (!match) return { baseName: trimmed, variantLabel: null };
  const key = match[2].trim().toLowerCase().replace(/\s+/g, '');
  const label = VARIANT_SUFFIXES[key];
  if (!label) return { baseName: trimmed, variantLabel: null };
  return { baseName: match[1].trim(), variantLabel: label };
}

/**
 * Comparison key for product names. Punctuation and spacing are dropped
 * entirely so `Maison Strawberry Short Cake` and `Maison Strawberry Shortcake`
 * are the same product.
 */
export function normalizeProductName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

function isSubset(small: Set<string>, big: Set<string>): boolean {
  for (const t of small) if (!big.has(t)) return false;
  return true;
}

/**
 * Best guess at the catalog product a SalesPlay name refers to when the names
 * are not identical — one is the other plus a word, as in `Matcha Marmalade`
 * against `Matcha Marmalade Gateau`. Only answers when exactly one product
 * fits, so a guess is never ambiguous, and only ever a suggestion for the
 * admin: nothing is mapped or created off the back of it.
 */
export function suggestProductForName(
  baseName: string,
  products: ShopCatalogProduct[],
): string | null {
  const csv = nameTokens(baseName);
  if (csv.size === 0) return null;
  const hits = products.filter((p) => {
    const cat = nameTokens(p.name);
    if (cat.size === 0) return false;
    const [small, big] = cat.size <= csv.size ? [cat, csv] : [csv, cat];
    // Two shared words minimum, or "Hot Latte" would suggest "Hot Chocolate".
    return small.size >= 2 && isSubset(small, big);
  });
  return hits.length === 1 ? hits[0].id : null;
}

function parsePriceCents(raw: string): number {
  const n = Number.parseFloat(String(raw ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * Turns already-parsed CSV records (from `csv-parse`, with `columns: true`)
 * into catalog-shaped rows. Rows without a code or name are reported as
 * skipped rather than silently dropped.
 */
export function toSalesplayCsvRows(
  records: Record<string, string>[],
): SalesplayCsvParseResult {
  const rows: SalesplayCsvRow[] = [];
  const skipped: SalesplayCsvSkippedRow[] = [];
  const seen = new Set<string>();

  records.forEach((record, i) => {
    // Header row is line 1, so the first record is line 2.
    const line = i + 2;
    const code = String(record['Product code'] ?? '').trim();
    const name = String(record['Product name'] ?? '').trim();
    if (!code && !name) return; // trailing blank line
    if (!code) {
      skipped.push({ line, name, reason: 'No product code' });
      return;
    }
    if (!name) {
      skipped.push({ line, name: code, reason: 'No product name' });
      return;
    }
    if (seen.has(code.toLowerCase())) {
      skipped.push({ line, name, reason: `Duplicate product code "${code}"` });
      return;
    }
    seen.add(code.toLowerCase());

    const { baseName, variantLabel } = splitSalesplayProductName(name);
    rows.push({
      code,
      name: name.replace(/\s+/g, ' '),
      baseName,
      variantLabel,
      category: String(record['Category'] ?? '').trim(),
      priceCents: parsePriceCents(record['Price(MYR)']),
      enabled:
        String(record['Product status'] ?? '')
          .trim()
          .toUpperCase() !== 'DISABLE',
    });
  });

  return { rows, skipped };
}

// ---------------------------------------------------------------------------
// The catalog side: one entry per sellable unit (product, or product + variant)
// ---------------------------------------------------------------------------

export type CatalogUnit = {
  productId: string;
  productName: string;
  variantLabel: string | null;
  /**
   * The code SalesPlay orders are pushed with today: the variant's own code,
   * falling back to the product-level code (see `resolveSalesplayProductCode`).
   */
  effectiveCode: string | null;
  /** The code stored in this unit's own slot, ignoring the product-level fallback. */
  ownCode: string | null;
  priceCents: number;
  isActive: boolean;
};

export function catalogUnits(products: ShopCatalogProduct[]): CatalogUnit[] {
  const out: CatalogUnit[] = [];
  for (const p of products) {
    const productCode = p.salesplayProductCode?.trim() || null;
    const variants = p.variants ?? [];
    if (variants.length === 0) {
      out.push({
        productId: p.id,
        productName: p.name,
        variantLabel: null,
        effectiveCode: productCode,
        ownCode: productCode,
        priceCents: p.basePriceCents ?? 0,
        isActive: p.isActive !== false,
      });
      continue;
    }
    for (const v of variants) {
      const own = p.salesplayVariantCodes?.[v.label]?.trim() || null;
      out.push({
        productId: p.id,
        productName: p.name,
        variantLabel: v.label,
        effectiveCode: own ?? productCode,
        ownCode: own,
        priceCents: v.priceCents ?? 0,
        isActive: p.isActive !== false,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

/** A CSV row that resolved to a catalog product (and variant, when sized). */
export type SalesplayMatch = {
  code: string;
  csvName: string;
  category: string;
  csvPriceCents: number;
  enabled: boolean;
  productId: string;
  productName: string;
  variantLabel: string | null;
  /** How this row found its catalog product. */
  via: 'code' | 'name' | 'manual';
  currentCode: string | null;
  codeAction: 'set' | 'replace' | 'unchanged';
  currentPriceCents: number;
  /** `locked` means the admin has hand-edited the price, so sync leaves it alone. */
  priceAction: 'set' | 'unchanged' | 'locked';
};

/** A CSV row with nothing to map onto in the member catalog. */
export type SalesplayCsvOnly = {
  code: string;
  csvName: string;
  baseName: string;
  variantLabel: string | null;
  category: string;
  csvPriceCents: number;
  enabled: boolean;
  /**
   * `new-variant` when the base name matches a catalog product that simply has
   * no such size yet — adding the variant is usually the right fix. Otherwise
   * `new-product`.
   */
  kind: 'new-product' | 'new-variant';
  /** Set for `new-variant`, and for a `new-product` whose name looks close to an existing one. */
  suggestedProductId: string | null;
  suggestedProductName: string | null;
  /** Whether the chosen options mean this row gets created on apply. */
  willCreate: boolean;
  /** Why it will not be created, when it will not. */
  skipReason: string | null;
};

/** A sellable unit the app offers that the SalesPlay export does not list. */
export type SalesplayCatalogOnly = {
  productId: string;
  productName: string;
  variantLabel: string | null;
  currentCode: string | null;
  isActive: boolean;
  /**
   * `missing` — the code is nowhere in the export.
   * `disabled` — the export has it, with status DISABLE.
   * `out-of-scope` — the export has it, in a category this sync is ignoring.
   */
  reason: 'missing' | 'disabled' | 'out-of-scope';
  willDeactivate: boolean;
};

export type SalesplaySyncOptions = {
  /** SalesPlay categories to consider. Defaults to everything except {@link NON_CATALOG_SALESPLAY_CATEGORIES}. */
  categories?: string[];
  /** Write the SalesPlay code onto every matched product/variant. */
  updateCodes?: boolean;
  /** Copy the SalesPlay price onto matched products, unless the admin has locked it. */
  updatePrices?: boolean;
  /** Create catalog products for CSV rows with no counterpart. */
  createMissingProducts?: boolean;
  /** Add missing sizes to catalog products that already exist. */
  createMissingVariants?: boolean;
  /** Hide catalog products the export no longer sells. */
  deactivateMissing?: boolean;
  /** Admin overrides: SalesPlay code → the catalog unit it belongs to. */
  assignments?: {
    code: string;
    productId: string;
    variantLabel?: string | null;
  }[];
};

export type SalesplaySyncPlan = {
  options: Required<Omit<SalesplaySyncOptions, 'assignments'>> & {
    assignments: NonNullable<SalesplaySyncOptions['assignments']>;
  };
  /** Every category in the export, with its row count and whether it is in scope. */
  categories: { name: string; rowCount: number; included: boolean }[];
  summary: {
    csvRows: number;
    csvRowsInScope: number;
    catalogUnits: number;
    matched: number;
    /** Matched products SalesPlay has switched off — still live in the app. */
    matchedDisabled: number;
    codesToWrite: number;
    pricesToWrite: number;
    pricesLocked: number;
    productsToCreate: number;
    variantsToCreate: number;
    toDeactivate: number;
    csvOnly: number;
    catalogOnly: number;
  };
  matched: SalesplayMatch[];
  csvOnly: SalesplayCsvOnly[];
  catalogOnly: SalesplayCatalogOnly[];
  skipped: SalesplayCsvSkippedRow[];
};

/** Fields that mean "the admin set this price by hand" (see SYNC_LOCK_GROUPS). */
function priceLocked(
  p: ShopCatalogProduct,
  variantLabel: string | null,
): boolean {
  const locks = p.syncOverrides ?? [];
  return variantLabel
    ? locks.includes('variants')
    : locks.includes('basePriceCents');
}

function resolveCategories(
  rows: SalesplayCsvRow[],
  requested: string[] | undefined,
): { name: string; rowCount: number; included: boolean }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const name = r.category || '(none)';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const allow = requested?.length
    ? new Set(requested.map((c) => c.trim().toLowerCase()))
    : null;
  const excluded = new Set(
    NON_CATALOG_SALESPLAY_CATEGORIES.map((c) => c.toLowerCase()),
  );
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, rowCount]) => ({
      name,
      rowCount,
      included: allow
        ? allow.has(name.toLowerCase())
        : !excluded.has(name.toLowerCase()),
    }));
}

/**
 * Builds the full diff between the SalesPlay export and the member catalog.
 *
 * Matching runs in three passes, most confident first:
 *  1. an admin assignment for that code,
 *  2. the code already stored on a catalog product or variant,
 *  3. the product name (punctuation-insensitive) plus the size suffix.
 *
 * Rows that match nothing land in `csvOnly` with a suggestion where one is
 * obvious; catalog units that no row claims land in `catalogOnly`.
 */
export function buildSalesplaySyncPlan(
  products: ShopCatalogProduct[],
  parsed: SalesplayCsvParseResult,
  options: SalesplaySyncOptions = {},
): SalesplaySyncPlan {
  const opts = {
    categories: options.categories ?? [],
    updateCodes: options.updateCodes !== false,
    updatePrices: options.updatePrices === true,
    createMissingProducts: options.createMissingProducts === true,
    createMissingVariants: options.createMissingVariants === true,
    deactivateMissing: options.deactivateMissing === true,
    assignments: options.assignments ?? [],
  };

  const categories = resolveCategories(parsed.rows, options.categories);
  const includedCategories = new Set(
    categories.filter((c) => c.included).map((c) => c.name.toLowerCase()),
  );
  const inScope = (row: SalesplayCsvRow) =>
    includedCategories.has((row.category || '(none)').toLowerCase());

  const productById = new Map(products.map((p) => [p.id, p]));
  const units = catalogUnits(products);

  // Lookup indexes over the catalog side.
  const byCode = new Map<string, CatalogUnit>();
  const byNameAndVariant = new Map<string, CatalogUnit>();
  const productIdByName = new Map<string, string>();
  const ambiguousNames = new Set<string>();
  for (const u of units) {
    if (u.ownCode) byCode.set(u.ownCode.toLowerCase(), u);
    const key = `${normalizeProductName(u.productName)}::${u.variantLabel ?? ''}`;
    if (!byNameAndVariant.has(key)) byNameAndVariant.set(key, u);
  }
  for (const p of products) {
    const key = normalizeProductName(p.name);
    if (productIdByName.has(key) && productIdByName.get(key) !== p.id) {
      ambiguousNames.add(key);
    } else {
      productIdByName.set(key, p.id);
    }
  }
  const assignmentByCode = new Map(
    opts.assignments.map((a) => [a.code.trim().toLowerCase(), a]),
  );

  const unitKey = (productId: string, variantLabel: string | null) =>
    `${productId}::${variantLabel ?? ''}`;
  const unitByKey = new Map(
    units.map((u) => [unitKey(u.productId, u.variantLabel), u]),
  );

  const matched: SalesplayMatch[] = [];
  const csvOnly: SalesplayCsvOnly[] = [];
  const claimed = new Set<string>();
  /** Codes seen anywhere in the export, so `catalogOnly` can tell missing from disabled. */
  const codesInExport = new Map<string, SalesplayCsvRow>();
  for (const row of parsed.rows) codesInExport.set(row.code.toLowerCase(), row);

  let csvRowsInScope = 0;

  for (const row of parsed.rows) {
    if (!inScope(row)) continue;
    csvRowsInScope++;

    let unit: CatalogUnit | undefined;
    let via: SalesplayMatch['via'] = 'code';

    const assignment = assignmentByCode.get(row.code.toLowerCase());
    if (assignment) {
      unit = unitByKey.get(
        unitKey(assignment.productId, assignment.variantLabel ?? null),
      );
      via = 'manual';
    }
    if (!unit) {
      unit = byCode.get(row.code.toLowerCase());
      via = 'code';
    }
    if (!unit) {
      const key = `${normalizeProductName(row.baseName)}::${row.variantLabel ?? ''}`;
      unit = byNameAndVariant.get(key);
      via = 'name';
    }

    if (unit) {
      claimed.add(unitKey(unit.productId, unit.variantLabel));
      const product = productById.get(unit.productId)!;
      const currentCode = unit.ownCode;
      const codeAction: SalesplayMatch['codeAction'] =
        currentCode == null
          ? 'set'
          : currentCode.toLowerCase() === row.code.toLowerCase()
            ? 'unchanged'
            : 'replace';
      const locked = priceLocked(product, unit.variantLabel);
      const priceAction: SalesplayMatch['priceAction'] =
        unit.priceCents === row.priceCents
          ? 'unchanged'
          : locked
            ? 'locked'
            : 'set';
      matched.push({
        code: row.code,
        csvName: row.name,
        category: row.category,
        csvPriceCents: row.priceCents,
        enabled: row.enabled,
        productId: unit.productId,
        productName: unit.productName,
        variantLabel: unit.variantLabel,
        via,
        currentCode,
        codeAction,
        currentPriceCents: unit.priceCents,
        priceAction,
      });
      continue;
    }

    // No catalog unit — is the parent product at least there?
    const baseKey = normalizeProductName(row.baseName);
    const parentId = ambiguousNames.has(baseKey)
      ? null
      : (productIdByName.get(baseKey) ?? null);
    const kind: SalesplayCsvOnly['kind'] =
      parentId && row.variantLabel ? 'new-variant' : 'new-product';
    // A near-miss on the name is advisory only — `kind` stays `new-product`,
    // so "create missing" still creates it unless the admin maps it by hand.
    const suggestedId =
      parentId ?? suggestProductForName(row.baseName, products);
    const wanted =
      kind === 'new-variant'
        ? opts.createMissingVariants
        : opts.createMissingProducts;
    const sellable = row.enabled && row.priceCents > 0;
    csvOnly.push({
      code: row.code,
      csvName: row.name,
      baseName: row.baseName,
      variantLabel: row.variantLabel,
      category: row.category,
      csvPriceCents: row.priceCents,
      enabled: row.enabled,
      kind,
      suggestedProductId: suggestedId,
      suggestedProductName: suggestedId
        ? (productById.get(suggestedId)?.name ?? null)
        : null,
      willCreate: wanted && sellable,
      skipReason: !wanted
        ? null
        : !row.enabled
          ? 'Disabled in SalesPlay'
          : row.priceCents <= 0
            ? 'No price in SalesPlay'
            : null,
    });
  }

  // A product whose 6" still sells in store must stay in the app even if its
  // 8" has gone, so deactivation is decided per product, not per unit.
  const stillSold = new Set(matched.map((m) => m.productId));

  const catalogOnly: SalesplayCatalogOnly[] = [];
  for (const u of units) {
    if (claimed.has(unitKey(u.productId, u.variantLabel))) continue;
    const exported = u.effectiveCode
      ? codesInExport.get(u.effectiveCode.toLowerCase())
      : undefined;
    const reason: SalesplayCatalogOnly['reason'] = !exported
      ? 'missing'
      : !exported.enabled
        ? 'disabled'
        : !inScope(exported)
          ? 'out-of-scope'
          : 'missing';
    catalogOnly.push({
      productId: u.productId,
      productName: u.productName,
      variantLabel: u.variantLabel,
      currentCode: u.effectiveCode,
      isActive: u.isActive,
      reason,
      willDeactivate:
        opts.deactivateMissing &&
        u.isActive &&
        !stillSold.has(u.productId) &&
        // A code we simply chose not to look at is no evidence the POS
        // stopped selling it.
        reason !== 'out-of-scope',
    });
  }

  const codesToWrite = opts.updateCodes
    ? matched.filter((m) => m.codeAction !== 'unchanged').length
    : 0;
  const pricesToWrite = opts.updatePrices
    ? matched.filter((m) => m.priceAction === 'set').length
    : 0;

  return {
    options: opts,
    categories,
    summary: {
      csvRows: parsed.rows.length,
      csvRowsInScope,
      catalogUnits: units.length,
      matched: matched.length,
      matchedDisabled: matched.filter((m) => !m.enabled).length,
      codesToWrite,
      pricesToWrite,
      pricesLocked: matched.filter((m) => m.priceAction === 'locked').length,
      productsToCreate: csvOnly.filter(
        (r) => r.willCreate && r.kind === 'new-product',
      ).length,
      variantsToCreate: csvOnly.filter(
        (r) => r.willCreate && r.kind === 'new-variant',
      ).length,
      toDeactivate: new Set(
        catalogOnly.filter((r) => r.willDeactivate).map((r) => r.productId),
      ).size,
      csvOnly: csvOnly.length,
      catalogOnly: catalogOnly.length,
    },
    matched,
    csvOnly,
    catalogOnly,
    skipped: parsed.skipped,
  };
}

// ---------------------------------------------------------------------------
// Turning the plan into products
// ---------------------------------------------------------------------------

function slugifyId(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 60) || 'product'
  );
}

function slugifyVariantLabel(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/"/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function formatRm(priceCents: number): string {
  return `RM${(priceCents / 100).toFixed(2)}`;
}

/**
 * Applies a plan to a copy of the catalog and returns the products that
 * changed, plus the ones to create. The caller persists them.
 *
 * New products come in deliberately bare — name, category, price, variants and
 * SalesPlay codes only. Photos and copy are the admin's job (or a moja-sites
 * sync); a POS export has none of that.
 */
export function applySalesplaySyncPlan(
  products: ShopCatalogProduct[],
  plan: SalesplaySyncPlan,
): {
  updated: ShopCatalogProduct[];
  created: ShopCatalogProduct[];
  deactivated: ShopCatalogProduct[];
} {
  const opts = plan.options;
  const byId = new Map(products.map((p) => [p.id, { ...p }]));
  const touched = new Set<string>();
  const deactivatedIds = new Set<string>();

  if (opts.updateCodes || opts.updatePrices) {
    for (const m of plan.matched) {
      const p = byId.get(m.productId);
      if (!p) continue;

      if (opts.updateCodes && m.codeAction !== 'unchanged') {
        if (m.variantLabel) {
          p.salesplayVariantCodes = {
            ...(p.salesplayVariantCodes ?? {}),
            [m.variantLabel]: m.code,
          };
        } else {
          p.salesplayProductCode = m.code;
        }
        touched.add(p.id);
      }

      if (opts.updatePrices && m.priceAction === 'set') {
        if (m.variantLabel) {
          p.variants = (p.variants ?? []).map((v) =>
            v.label === m.variantLabel
              ? {
                  ...v,
                  priceCents: m.csvPriceCents,
                  priceDisplay: formatRm(m.csvPriceCents),
                }
              : v,
          );
          const cheapest = (p.variants ?? [])
            .filter((v) => v.available !== false && v.priceCents > 0)
            .map((v) => v.priceCents);
          if (cheapest.length) p.basePriceCents = Math.min(...cheapest);
        } else {
          p.basePriceCents = m.csvPriceCents;
          p.priceDisplay = formatRm(m.csvPriceCents);
        }
        touched.add(p.id);
      }
    }
  }

  // New variants on products that already exist.
  const created: ShopCatalogProduct[] = [];
  const newVariantRows = plan.csvOnly.filter(
    (r) => r.willCreate && r.kind === 'new-variant',
  );
  for (const row of newVariantRows) {
    const p = row.suggestedProductId
      ? byId.get(row.suggestedProductId)
      : undefined;
    if (!p || !row.variantLabel) continue;
    const variants = [...(p.variants ?? [])];
    if (variants.some((v) => v.label === row.variantLabel)) continue;
    variants.push({
      id: `${p.id}__${slugifyVariantLabel(row.variantLabel)}`,
      label: row.variantLabel,
      priceCents: row.csvPriceCents,
      available: true,
      priceDisplay: formatRm(row.csvPriceCents),
    });
    p.variants = variants;
    p.salesplayVariantCodes = {
      ...(p.salesplayVariantCodes ?? {}),
      [row.variantLabel]: row.code,
    };
    touched.add(p.id);
  }

  // Brand new products, one per base name so all its sizes land together.
  const newProductRows = plan.csvOnly.filter(
    (r) => r.willCreate && r.kind === 'new-product',
  );
  const grouped = new Map<string, SalesplayCsvOnly[]>();
  for (const row of newProductRows) {
    const key = normalizeProductName(row.baseName);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  const usedIds = new Set(products.map((p) => p.id));
  let nextSortOrder =
    products.reduce((max, p) => Math.max(max, p.sortOrder ?? 0), 0) + 10;

  for (const rows of grouped.values()) {
    const first = rows[0];
    let id = slugifyId(first.baseName);
    let n = 2;
    while (usedIds.has(id)) id = `${slugifyId(first.baseName)}-${n++}`;
    usedIds.add(id);

    const sized = rows.filter((r) => r.variantLabel);
    const variants: ShopCatalogProductVariant[] = sized.map((r) => ({
      id: `${id}__${slugifyVariantLabel(r.variantLabel!)}`,
      label: r.variantLabel!,
      priceCents: r.csvPriceCents,
      available: true,
      priceDisplay: formatRm(r.csvPriceCents),
    }));
    const salesplayVariantCodes: Record<string, string> = {};
    for (const r of sized) salesplayVariantCodes[r.variantLabel!] = r.code;
    const plain = rows.find((r) => !r.variantLabel);
    const basePriceCents = variants.length
      ? Math.min(...variants.map((v) => v.priceCents))
      : (plain?.csvPriceCents ?? first.csvPriceCents);

    created.push({
      id,
      category: mapSalesplayCategory(first.category, first.variantLabel),
      categoryLabel: first.category || undefined,
      name: first.baseName,
      shortDescription: '',
      description: '',
      imageUrl: '',
      basePriceCents,
      priceDisplay: formatRm(basePriceCents),
      variants: variants.length ? variants : undefined,
      soldOut: false,
      // Imported from the POS with no photo or copy yet — the admin publishes
      // it once it looks right in the storefront.
      isActive: false,
      sortOrder: (nextSortOrder += 10),
      salesplayProductCode: plain?.code ?? undefined,
      salesplayVariantCodes: Object.keys(salesplayVariantCodes).length
        ? salesplayVariantCodes
        : undefined,
    });
  }

  if (opts.deactivateMissing) {
    for (const row of plan.catalogOnly) {
      if (!row.willDeactivate) continue;
      const p = byId.get(row.productId);
      if (!p || p.isActive === false) continue;
      p.isActive = false;
      touched.add(p.id);
      deactivatedIds.add(p.id);
    }
  }

  const updated = [...touched].map((id) => byId.get(id)!);
  return {
    updated,
    created,
    deactivated: updated.filter((p) => deactivatedIds.has(p.id)),
  };
}
