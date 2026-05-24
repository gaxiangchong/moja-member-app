/**
 * One-time / repeatable import from moja-sites config/products.catalog.json
 * into member API data/shop-catalog.products.json + shop-catalog.layout.json
 *
 * Usage: npx ts-node scripts/import-shop-catalog-from-sites.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type SitesVariant = {
  label: string;
  price: string | null;
  available: boolean;
};

type SitesProduct = {
  slug: string;
  name: string;
  price: string;
  category: string;
  images: { src: string; alt: string }[];
  summary: string;
  shortDescription?: string;
  badge?: string;
  soldOut?: boolean;
  variants?: SitesVariant[];
};

type SitesCatalog = {
  homeFeaturedSlugs: string[];
  shopSections: Array<{
    id: string;
    title: string;
    description: string;
    productSlugs: string[];
  }>;
  products: SitesProduct[];
};

type ShopCatalogProduct = {
  id: string;
  category: 'whole_cakes' | 'cake_slices' | 'drinks' | 'specials';
  categoryLabel: string;
  name: string;
  shortDescription: string;
  description: string;
  imageUrl: string;
  images: { src: string; alt: string }[];
  basePriceCents: number;
  priceDisplay: string;
  variants?: Array<{
    id: string;
    label: string;
    priceCents: number;
    available: boolean;
    priceDisplay: string | null;
  }>;
  badge?: string;
  soldOut?: boolean;
  isActive: boolean;
  sortOrder: number;
};

function parseRmToCents(label: string | null | undefined): number {
  if (!label?.trim()) return 0;
  const n = Number.parseFloat(label.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function slugifyVariant(label: string): string {
  return label.toLowerCase().replace(/\s+/g, '-').replace(/"/g, '');
}

function mapCategory(category: string): ShopCatalogProduct['category'] {
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

function convertProduct(p: SitesProduct, sortOrder: number): ShopCatalogProduct {
  const variants = p.variants?.map((v) => ({
    id: `${p.slug}__${slugifyVariant(v.label)}`,
    label: v.label,
    priceCents: parseRmToCents(v.price),
    available: v.available,
    priceDisplay: v.price,
  }));

  const availableVariantPrices = variants?.filter((v) => v.available && v.priceCents > 0) ?? [];
  const basePriceCents =
    availableVariantPrices.length > 0
      ? Math.min(...availableVariantPrices.map((v) => v.priceCents))
      : parseRmToCents(p.price);

  const allVariantsUnavailable =
    variants != null && variants.length > 0 && availableVariantPrices.length === 0;

  return {
    id: p.slug,
    category: mapCategory(p.category),
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

const repoRoot = resolve(__dirname, '..');
const sitesCatalogPath = resolve(repoRoot, '..', 'moja-sites', 'config', 'products.catalog.json');
const raw = readFileSync(sitesCatalogPath, 'utf-8');
const catalog = JSON.parse(raw) as SitesCatalog;

const products = catalog.products.map((p, i) => convertProduct(p, (i + 1) * 10));

const layout = {
  homeFeaturedProductIds: catalog.homeFeaturedSlugs,
  shopSections: catalog.shopSections.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    productIds: s.productSlugs,
  })),
};

const dataDir = resolve(repoRoot, 'config');
mkdirSync(dataDir, { recursive: true });
writeFileSync(
  resolve(dataDir, 'shop-catalog.products.json'),
  JSON.stringify(products, null, 2),
  'utf-8',
);
writeFileSync(
  resolve(dataDir, 'shop-catalog.layout.json'),
  JSON.stringify(layout, null, 2),
  'utf-8',
);
writeFileSync(
  resolve(dataDir, 'home-popular.json'),
  JSON.stringify(
    {
      productIds: catalog.homeFeaturedSlugs.slice(0, 5),
      maxLimit: 5,
    },
    null,
    2,
  ),
  'utf-8',
);

console.log(`Imported ${products.length} products into config/shop-catalog.products.json`);
console.log(`Wrote layout with ${layout.shopSections.length} sections`);
