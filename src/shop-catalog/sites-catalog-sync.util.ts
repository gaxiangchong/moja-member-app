import type {
  ShopCatalogProduct,
  ShopCatalogProductVariant,
} from './shop-catalog.service';
import type {
  ShopCatalogSyncFieldChange,
  ShopCatalogSyncMode,
  ShopCatalogSyncPreview,
  ShopCatalogSyncProductChange,
  SitesCatalog,
  SitesCatalogProduct,
} from './sites-catalog.types';

export function parseRmToCents(label: string | null | undefined): number {
  if (!label?.trim()) return 0;
  const n = Number.parseFloat(label.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function slugifyVariantLabel(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/"/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function mapSitesCategory(
  category: string,
): ShopCatalogProduct['category'] {
  switch (category) {
    case 'Premium Cake':
    case 'Festive Cake':
      return 'whole_cakes';
    case 'Collection Cake':
      return 'cake_slices';
    case 'Box Edition':
      return 'specials';
    default:
      return 'specials';
  }
}

export function convertSitesProduct(
  p: SitesCatalogProduct,
  sortOrder: number,
): ShopCatalogProduct {
  const variants = p.variants?.map((v) => ({
    id: `${p.slug}__${slugifyVariantLabel(v.label)}`,
    label: v.label,
    priceCents: parseRmToCents(v.price),
    available: v.available,
    priceDisplay: v.price,
  }));

  const availableVariantPrices =
    variants?.filter((v) => v.available && v.priceCents > 0) ?? [];
  const basePriceCents =
    availableVariantPrices.length > 0
      ? Math.min(...availableVariantPrices.map((v) => v.priceCents))
      : parseRmToCents(p.price);

  const allVariantsUnavailable =
    variants != null &&
    variants.length > 0 &&
    availableVariantPrices.length === 0;

  return {
    id: p.slug,
    category: mapSitesCategory(p.category),
    categoryLabel: p.category,
    name: p.name,
    shortDescription: (p.shortDescription ?? p.summary).trim().slice(0, 500),
    description: p.summary.trim(),
    imageUrl: p.images[0]?.src ?? '',
    images: p.images,
    basePriceCents,
    priceDisplay: p.price,
    variants,
    badge: p.badge,
    soldOut: p.soldOut === true || allVariantsUnavailable,
    isActive: true,
    sortOrder,
  };
}

export function convertSitesCatalog(
  catalog: SitesCatalog,
): ShopCatalogProduct[] {
  return catalog.products.map((p, i) => convertSitesProduct(p, (i + 1) * 10));
}

function formatVariantsForDiff(
  variants: ShopCatalogProductVariant[] | undefined,
): string {
  if (!variants?.length) return '(none)';
  return variants
    .map((v) => {
      const price =
        v.priceDisplay?.trim() ||
        (v.priceCents > 0 ? `RM${(v.priceCents / 100).toFixed(2)}` : '-');
      const avail = v.available === false ? 'unavailable' : 'available';
      return `${v.label}: ${price} (${avail})`;
    })
    .join('; ');
}

function productSnapshot(
  p: ShopCatalogProduct,
  fields: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of fields) {
    switch (field) {
      case 'imageUrl':
        out.imageUrl = p.imageUrl ?? '';
        break;
      case 'basePriceCents':
        out.basePriceCents = String(p.basePriceCents ?? 0);
        break;
      case 'priceDisplay':
        out.priceDisplay = p.priceDisplay ?? '';
        break;
      case 'variants':
        out.variants = formatVariantsForDiff(p.variants);
        break;
      case 'soldOut':
        out.soldOut = String(Boolean(p.soldOut));
        break;
      case 'badge':
        out.badge = p.badge ?? '';
        break;
      case 'name':
        out.name = p.name ?? '';
        break;
      case 'categoryLabel':
        out.categoryLabel = p.categoryLabel ?? '';
        break;
      case 'shortDescription':
        out.shortDescription = p.shortDescription ?? '';
        break;
      case 'description':
        out.description = p.description ?? '';
        break;
      default:
        break;
    }
  }
  return out;
}

function diffFields(
  before: Record<string, string>,
  fromSites: Record<string, string>,
  locks: Set<string>,
): ShopCatalogSyncFieldChange[] {
  const changes: ShopCatalogSyncFieldChange[] = [];
  for (const field of Object.keys(fromSites)) {
    const b = before[field] ?? '';
    const a = fromSites[field] ?? '';
    if (b === a) continue;
    const locked = locks.has(field);
    changes.push({
      field,
      before: b || '(empty)',
      after: a || '(empty)',
      ...(locked ? { locked: true } : {}),
    });
  }
  return changes;
}

const PRICING_MEDIA_FIELDS = [
  'imageUrl',
  'basePriceCents',
  'priceDisplay',
  'variants',
  'soldOut',
  'badge',
] as const;

const FULL_FIELDS = [
  ...PRICING_MEDIA_FIELDS,
  'name',
  'categoryLabel',
  'shortDescription',
  'description',
] as const;

/** Field-level merge: take `fromSites` value unless that field is locked on `existing`. */
function pickField<K extends keyof ShopCatalogProduct>(
  existing: ShopCatalogProduct,
  fromSites: ShopCatalogProduct,
  field: K,
  locks: Set<string>,
): ShopCatalogProduct[K] {
  return locks.has(field as string) ? existing[field] : fromSites[field];
}

export function mergeSitesIntoMemberProduct(
  existing: ShopCatalogProduct,
  fromSites: ShopCatalogProduct,
  mode: ShopCatalogSyncMode,
): ShopCatalogProduct {
  const locks = new Set(existing.syncOverrides ?? []);

  if (mode === 'full') {
    return {
      id: existing.id,
      isActive: existing.isActive,
      sortOrder: existing.sortOrder,
      syncOverrides: existing.syncOverrides,
      // Admin-managed POS mapping — never sourced from moja-sites.
      salesplayProductCode: existing.salesplayProductCode,
      salesplayVariantCodes: existing.salesplayVariantCodes,
      category: pickField(existing, fromSites, 'category', locks),
      categoryLabel: pickField(existing, fromSites, 'categoryLabel', locks),
      name: pickField(existing, fromSites, 'name', locks),
      shortDescription: pickField(existing, fromSites, 'shortDescription', locks),
      description: pickField(existing, fromSites, 'description', locks),
      imageUrl: pickField(existing, fromSites, 'imageUrl', locks),
      images: pickField(existing, fromSites, 'images', locks),
      basePriceCents: pickField(existing, fromSites, 'basePriceCents', locks),
      priceDisplay: pickField(existing, fromSites, 'priceDisplay', locks),
      variants: pickField(existing, fromSites, 'variants', locks),
      badge: pickField(existing, fromSites, 'badge', locks),
      soldOut: pickField(existing, fromSites, 'soldOut', locks),
    };
  }

  return {
    ...existing,
    imageUrl: pickField(existing, fromSites, 'imageUrl', locks),
    images: pickField(existing, fromSites, 'images', locks),
    basePriceCents: pickField(existing, fromSites, 'basePriceCents', locks),
    priceDisplay: pickField(existing, fromSites, 'priceDisplay', locks),
    variants: pickField(existing, fromSites, 'variants', locks),
    soldOut: pickField(existing, fromSites, 'soldOut', locks),
    badge: pickField(existing, fromSites, 'badge', locks),
  };
}

export function buildSyncPreview(
  memberProducts: ShopCatalogProduct[],
  sitesCatalog: SitesCatalog,
  mode: ShopCatalogSyncMode,
  source: ShopCatalogSyncPreview['source'],
  sourceLabel: string,
  syncLayout: boolean,
): ShopCatalogSyncPreview {
  const sitesProducts = convertSitesCatalog(sitesCatalog);
  const sitesById = new Map(sitesProducts.map((p) => [p.id, p]));
  const memberById = new Map(memberProducts.map((p) => [p.id, p]));
  const fields = mode === 'full' ? FULL_FIELDS : PRICING_MEDIA_FIELDS;

  const products: ShopCatalogSyncProductChange[] = [];
  let toUpdate = 0;
  let toCreate = 0;
  let unchanged = 0;
  let lockedProducts = 0;

  for (const fromSites of sitesProducts) {
    const existing = memberById.get(fromSites.id);
    if (!existing) {
      toCreate += 1;
      const after = productSnapshot(fromSites, [...fields]);
      products.push({
        id: fromSites.id,
        name: fromSites.name,
        status: 'create',
        changes: Object.entries(after).map(([field, afterVal]) => ({
          field,
          before: '(missing)',
          after: afterVal || '(empty)',
        })),
      });
      continue;
    }

    const locks = new Set(existing.syncOverrides ?? []);
    if (locks.size > 0) lockedProducts += 1;
    const beforeSnap = productSnapshot(existing, [...fields]);
    const sitesSnap = productSnapshot(fromSites, [...fields]);
    const allChanges = diffFields(beforeSnap, sitesSnap, locks);
    const willActuallyChange = allChanges.some((c) => !c.locked);

    if (allChanges.length === 0) {
      unchanged += 1;
      products.push({
        id: fromSites.id,
        name: existing.name || fromSites.name,
        status: 'unchanged',
        changes: [],
        ...(locks.size ? { lockedFields: [...locks] } : {}),
      });
    } else if (!willActuallyChange) {
      // Diffs exist but every changed field is locked — sync would do nothing.
      unchanged += 1;
      products.push({
        id: fromSites.id,
        name: existing.name || fromSites.name,
        status: 'unchanged',
        changes: allChanges,
        lockedFields: [...locks],
      });
    } else {
      toUpdate += 1;
      products.push({
        id: fromSites.id,
        name: existing.name || fromSites.name,
        status: 'update',
        changes: allChanges,
        ...(locks.size ? { lockedFields: [...locks] } : {}),
      });
    }
  }

  const onlyInMember = memberProducts.filter(
    (p) => !sitesById.has(p.id),
  ).length;

  return {
    source,
    sourceLabel,
    mode,
    summary: {
      sitesProductCount: sitesProducts.length,
      memberProductCount: memberProducts.length,
      toUpdate,
      toCreate,
      unchanged,
      onlyInMember,
      lockedProducts,
    },
    products,
    layoutWouldUpdate: syncLayout,
  };
}

export function applySyncToMemberCatalog(
  memberProducts: ShopCatalogProduct[],
  sitesCatalog: SitesCatalog,
  mode: ShopCatalogSyncMode,
  createMissing: boolean,
): ShopCatalogProduct[] {
  const sitesProducts = convertSitesCatalog(sitesCatalog);
  const sitesById = new Map(sitesProducts.map((p) => [p.id, p]));
  const out: ShopCatalogProduct[] = [];

  for (const existing of memberProducts) {
    const fromSites = sitesById.get(existing.id);
    if (!fromSites) {
      out.push(existing);
      continue;
    }
    out.push(mergeSitesIntoMemberProduct(existing, fromSites, mode));
    sitesById.delete(existing.id);
  }

  if (createMissing) {
    for (const fromSites of sitesById.values()) {
      out.push(fromSites);
    }
  }

  return out.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export function sitesCatalogToLayout(sitesCatalog: SitesCatalog) {
  return {
    homeFeaturedProductIds: sitesCatalog.homeFeaturedSlugs,
    shopSections: sitesCatalog.shopSections.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      productIds: s.productSlugs,
    })),
  };
}
