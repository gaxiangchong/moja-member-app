import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, ShopProduct as ShopProductRow } from '@prisma/client';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { extname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  applySyncToMemberCatalog,
  buildSyncPreview,
  sitesCatalogToLayout,
} from './sites-catalog-sync.util';
import type {
  ShopCatalogSyncMode,
  ShopCatalogSyncPreview,
  SitesCatalog,
} from './sites-catalog.types';
import { dataDir } from '../config/data-dir';

export type ShopCatalogProductImage = {
  src: string;
  alt: string;
};

export type ShopCatalogProductVariant = {
  id: string;
  label: string;
  priceCents: number;
  available?: boolean;
  priceDisplay?: string | null;
};

export type ShopCatalogProduct = {
  /** Canonical product id (same as storefront slug). */
  id: string;
  category: 'whole_cakes' | 'cake_slices' | 'drinks' | 'specials';
  /** Display category for the public shop site, e.g. "Premium Cake". */
  categoryLabel?: string;
  name: string;
  shortDescription: string;
  description: string;
  imageUrl: string;
  images?: ShopCatalogProductImage[];
  /** Horizontal focal point for the product photo, 0–100 (default 50 = center). */
  imageOffsetX?: number;
  /** Vertical focal point for the product photo, 0–100 (default 50 = center). */
  imageOffsetY?: number;
  /** Optional zoom level for the product photo, 1.0 = no zoom (default 1). */
  imageScale?: number;
  basePriceCents: number;
  /** Human-readable price label, e.g. "RM168.00" or "RM13.90 each". */
  priceDisplay?: string;
  variants?: ShopCatalogProductVariant[];
  badge?: string;
  soldOut?: boolean;
  /**
   * Kitchen-tracked count of this cake currently ready for sale. `undefined`
   * means this product isn't stock-tracked (unaffected by kitchen updates).
   * Set via the kitchen staff screen (ops/kitchen), decremented automatically
   * as orders are paid. Stored in the `shop_products.available_qty` column
   * (never inside `document`) so it can only change through atomic updates.
   * See `isProductSoldOut`.
   */
  availableQty?: number;
  isActive: boolean;
  sortOrder: number;
  /**
   * SalesPlay POS product code for this product. Used as `product_code` when
   * pushing online orders to SalesPlay, and to fold POS receipt lines back
   * onto this catalog product in cross-channel reporting.
   */
  salesplayProductCode?: string | null;
  /**
   * SalesPlay product code per variant, keyed by the variant label (e.g.
   * "6 inch" → "SP-BASQUE-6"). Sizes are usually separate SalesPlay products.
   * Kept at product level (not on the variant objects) so sync from
   * moja-sites, which replaces the variants array wholesale, cannot drop it.
   */
  salesplayVariantCodes?: Record<string, string>;
  /**
   * Field names that the admin has manually edited. Sync from moja-sites will
   * skip these fields so manual prices, photos, and variants don't get
   * silently reverted on the next sync. Auto-populated by `updateProduct` and
   * `attachProductImage`. Cleared via the admin "Reset sync overrides" action.
   */
  syncOverrides?: string[];
};

/** One SalesPlay code with the catalog product it maps back to. */
export type SalesplayCodeMapping = {
  code: string;
  productId: string;
  productName: string;
  variantLabel: string | null;
};

export type ShopCatalogSection = {
  id: string;
  title: string;
  description: string;
  productIds: string[];
};

export type ShopCatalogLayout = {
  homeFeaturedProductIds: string[];
  shopSections: ShopCatalogSection[];
};

export type ShopCatalogProductInput = Omit<
  Partial<ShopCatalogProduct>,
  'variants'
> & {
  variants?: Partial<ShopCatalogProductVariant>[];
};

export type HomePopularConfig = {
  productIds: string[];
  maxLimit: number;
};

const DEFAULT_POPULAR: HomePopularConfig = {
  productIds: [],
  maxLimit: 5,
};

const DEFAULT_LAYOUT: ShopCatalogLayout = {
  homeFeaturedProductIds: [],
  shopSections: [],
};

/** app_settings keys for the non-product catalog config. */
const SETTING_LAYOUT = 'shop_catalog.layout';
const SETTING_POPULAR = 'shop_catalog.popular';
/** Uploaded moja-sites `products.catalog.json` (sync source), with an `uploadedAt`. */
const SETTING_SITES_SOURCE = 'shop_catalog.sites_source';

/** Safety ceiling, not a product decision — admin picks the actual max shown (see `maxLimit`). */
const POPULAR_HARD_MAX = 100;

const PRODUCT_IMAGE_PUBLIC_PREFIX = '/uploads/products/';
const PRODUCT_IMAGE_ALLOWED_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Committed static files under public/images/products/ (case-sensitive on Linux). */
const CANONICAL_PRODUCT_IMAGE_URL: Record<string, string> = {
  'jasmine-blanc-cheesecake': '/images/products/jasmine_blanc.png',
  'strawberry-shortcake': '/images/products/strawberry_shortcake.png',
};

/**
 * When the admin edits one of these fields, lock the whole group so sync from
 * moja-sites skips them. e.g. editing variants also locks basePriceCents and
 * priceDisplay because they are derived together.
 */
const SYNC_LOCK_GROUPS: Record<string, string[]> = {
  name: ['name'],
  categoryLabel: ['categoryLabel'],
  shortDescription: ['shortDescription'],
  description: ['description'],
  imageUrl: ['imageUrl', 'images'],
  images: ['imageUrl', 'images'],
  imageOffsetX: ['imageOffsetX', 'imageOffsetY', 'imageScale'],
  imageOffsetY: ['imageOffsetX', 'imageOffsetY', 'imageScale'],
  imageScale: ['imageOffsetX', 'imageOffsetY', 'imageScale'],
  basePriceCents: ['basePriceCents', 'priceDisplay', 'variants'],
  priceDisplay: ['basePriceCents', 'priceDisplay', 'variants'],
  variants: ['basePriceCents', 'priceDisplay', 'variants'],
  badge: ['badge'],
  soldOut: ['soldOut'],
};

function expandSyncOverrides(fields: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const f of fields) {
    const group = SYNC_LOCK_GROUPS[f];
    if (group) {
      for (const g of group) out.add(g);
    } else {
      out.add(f);
    }
  }
  return [...out].sort();
}

function mergeSyncOverrides(
  existing: string[] | undefined,
  added: Iterable<string>,
): string[] {
  return expandSyncOverrides(new Set([...(existing ?? []), ...added]));
}

const COMPARABLE_FIELDS = [
  'name',
  'categoryLabel',
  'shortDescription',
  'description',
  'imageUrl',
  'imageOffsetX',
  'imageOffsetY',
  'imageScale',
  'basePriceCents',
  'priceDisplay',
  'variants',
  'badge',
  'soldOut',
] as const;

function clampPercent(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(100, Math.round(n * 100) / 100));
}

function clampScale(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0.5, Math.min(3, Math.round(n * 100) / 100));
}

function clampQty(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.round(n));
}

/** Effective sold-out state: the manual admin toggle OR a kitchen-tracked count at zero. */
export function isProductSoldOut(p: ShopCatalogProduct): boolean {
  return p.soldOut === true || (p.availableQty != null && p.availableQty <= 0);
}

function normalizeSalesplayCode(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s ? s.slice(0, 64) : undefined;
}

function normalizeSalesplayVariantCodes(
  v: unknown,
): Record<string, string> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [label, code] of Object.entries(v as Record<string, unknown>)) {
    const key = String(label ?? '').trim();
    const val = normalizeSalesplayCode(code);
    if (key && val) out[key] = val;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function detectChangedFields(
  before: ShopCatalogProduct | undefined,
  after: ShopCatalogProduct,
): string[] {
  if (!before) return [];
  const changed: string[] = [];
  for (const field of COMPARABLE_FIELDS) {
    const a = JSON.stringify(
      (before as Record<string, unknown>)[field] ?? null,
    );
    const b = JSON.stringify((after as Record<string, unknown>)[field] ?? null);
    if (a !== b) changed.push(field);
  }
  return changed;
}

/** Drops `undefined` members so the stored JSON document stays compact. */
function toJsonDocument(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** DB row → the product shape the storefront/admin consume. */
function rowToProduct(row: ShopProductRow): ShopCatalogProduct {
  const doc = (row.document ?? {}) as Partial<ShopCatalogProduct>;
  return {
    ...(doc as ShopCatalogProduct),
    id: row.id,
    category: row.category as ShopCatalogProduct['category'],
    name: row.name,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    soldOut: row.soldOut ? true : doc.soldOut,
    salesplayProductCode: row.salesplayProductCode ?? undefined,
    availableQty: row.availableQty ?? undefined,
  };
}

/**
 * Product → row columns. `availableQty` is deliberately NOT part of the
 * document and is only written when `includeStock` is set (admin explicitly
 * provided it, seed import) so a concurrent kitchen update is never clobbered
 * by an unrelated product edit.
 */
function productToRow(
  p: ShopCatalogProduct,
  opts: { includeStock: boolean },
): Prisma.ShopProductUncheckedCreateInput {
  const { availableQty, ...document } = p;
  const row: Prisma.ShopProductUncheckedCreateInput = {
    id: p.id,
    category: p.category,
    name: p.name,
    isActive: p.isActive !== false,
    sortOrder: Number.isFinite(p.sortOrder) ? p.sortOrder : 0,
    soldOut: p.soldOut === true,
    salesplayProductCode: p.salesplayProductCode?.trim() || null,
    document: toJsonDocument(document),
  };
  if (opts.includeStock) row.availableQty = availableQty ?? null;
  return row;
}

@Injectable()
export class ShopCatalogService implements OnModuleInit {
  private readonly logger = new Logger(ShopCatalogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seedFromFilesIfEmpty();
    } catch (err) {
      // A seed failure must not stop the API from booting — the catalog can be
      // re-imported from the admin (sync from moja-sites) at any time.
      this.logger.error(
        `Shop catalog seed failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ---------------------------------------------------------------------
  // One-time import of the legacy JSON files (data/ then config/) into Postgres
  // ---------------------------------------------------------------------

  private legacyFileCandidates(name: string): string[] {
    return [
      dataDir(name),
      resolve(process.cwd(), 'config', name),
    ];
  }

  private readLegacyJson(
    name: string,
  ): { path: string; value: unknown } | null {
    for (const p of this.legacyFileCandidates(name)) {
      if (!existsSync(p)) continue;
      try {
        return { path: p, value: JSON.parse(readFileSync(p, 'utf-8')) };
      } catch (err) {
        this.logger.warn(
          `Ignoring unreadable ${p}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return null;
  }

  private async seedFromFilesIfEmpty(): Promise<void> {
    const count = await this.prisma.shopProduct.count();
    if (count === 0) {
      const legacy = this.readLegacyJson('shop-catalog.products.json');
      if (legacy && Array.isArray(legacy.value) && legacy.value.length > 0) {
        const products = (legacy.value as ShopCatalogProductInput[]).map(
          (raw) => this.normalizeProduct(raw),
        );
        await this.prisma.shopProduct.createMany({
          data: products.map((p) => productToRow(p, { includeStock: true })),
          skipDuplicates: true,
        });
        this.logger.log(
          `Seeded ${products.length} shop products from ${legacy.path}`,
        );
      }
    }

    const layoutRow = await this.prisma.appSetting.findUnique({
      where: { key: SETTING_LAYOUT },
    });
    if (!layoutRow) {
      const legacy = this.readLegacyJson('shop-catalog.layout.json');
      if (legacy && legacy.value && typeof legacy.value === 'object') {
        await this.setLayout(legacy.value as Partial<ShopCatalogLayout>);
        this.logger.log(`Seeded shop layout from ${legacy.path}`);
      }
    }

    const popularRow = await this.prisma.appSetting.findUnique({
      where: { key: SETTING_POPULAR },
    });
    if (!popularRow) {
      const legacy = this.readLegacyJson('home-popular.json');
      if (legacy && legacy.value && typeof legacy.value === 'object') {
        await this.setPopularConfig(legacy.value as Partial<HomePopularConfig>);
        this.logger.log(`Seeded home popular config from ${legacy.path}`);
      }
    }
  }

  // ---------------------------------------------------------------------
  // Product storage
  // ---------------------------------------------------------------------

  /** Fix imageUrl drift from moja-sites sync (spaces, wrong case, old filenames). */
  private async repairCanonicalProductImages(
    items: ShopCatalogProduct[],
  ): Promise<ShopCatalogProduct[]> {
    const repaired: ShopCatalogProduct[] = [];
    const out = items.map((p) => {
      const canonical = CANONICAL_PRODUCT_IMAGE_URL[p.id];
      if (!canonical) return p;
      const cur = (p.imageUrl ?? '').trim();
      const needsFix =
        !cur ||
        cur !== canonical ||
        /\s/.test(cur) ||
        /Jasmine_blanc/i.test(cur) ||
        /jasmine blanc/i.test(cur);
      if (!needsFix) return p;
      const images =
        Array.isArray(p.images) && p.images.length > 0
          ? p.images.map((img, i) =>
              i === 0 ? { ...img, src: canonical } : img,
            )
          : [{ src: canonical, alt: p.name }];
      const next = { ...p, imageUrl: canonical, images };
      repaired.push(next);
      return next;
    });
    for (const p of repaired) await this.saveProduct(p);
    return out;
  }

  private async loadAll(): Promise<ShopCatalogProduct[]> {
    const rows = await this.prisma.shopProduct.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return this.repairCanonicalProductImages(rows.map(rowToProduct));
  }

  private async loadOne(id: string): Promise<ShopCatalogProduct | null> {
    const row = await this.prisma.shopProduct.findUnique({ where: { id } });
    return row ? rowToProduct(row) : null;
  }

  private async requireOne(id: string): Promise<ShopCatalogProduct> {
    const p = await this.loadOne(id);
    if (!p) throw new NotFoundException('Shop catalog product not found');
    return p;
  }

  /** Upsert one product's document/columns. Stock is left untouched unless `includeStock`. */
  private async saveProduct(
    p: ShopCatalogProduct,
    opts: { includeStock?: boolean } = {},
  ): Promise<ShopCatalogProduct> {
    const includeStock = Boolean(opts.includeStock);
    const data = productToRow(p, { includeStock });
    const { id, ...rest } = data;
    const row = await this.prisma.shopProduct.upsert({
      where: { id },
      create: data,
      update: rest,
    });
    return rowToProduct(row);
  }

  /**
   * Replace the whole catalog with `items` (used by sync from moja-sites):
   * upserts every product and deletes the ones no longer present, in one
   * transaction. Stock columns are preserved for existing rows.
   */
  private async saveAll(items: ShopCatalogProduct[]): Promise<void> {
    const keepIds = items.map((p) => p.id);
    await this.prisma.$transaction(async (tx) => {
      for (const p of items) {
        const data = productToRow(p, { includeStock: false });
        const { id, ...rest } = data;
        await tx.shopProduct.upsert({
          where: { id },
          create: data,
          update: rest,
        });
      }
      await tx.shopProduct.deleteMany({ where: { id: { notIn: keepIds } } });
    });
  }

  // ---------------------------------------------------------------------
  // Layout (home featured + shop sections) — app_settings
  // ---------------------------------------------------------------------

  private async readLayout(): Promise<ShopCatalogLayout> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: SETTING_LAYOUT },
    });
    const parsed = row?.value as Partial<ShopCatalogLayout> | null | undefined;
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_LAYOUT };
    const homeFeaturedProductIds = Array.isArray(parsed.homeFeaturedProductIds)
      ? parsed.homeFeaturedProductIds
          .map((x: unknown) => String(x ?? '').trim())
          .filter(Boolean)
      : [];
    const shopSections = Array.isArray(parsed.shopSections)
      ? parsed.shopSections
          .map((s: ShopCatalogSection) => ({
            id: String(s.id ?? '').trim(),
            title: String(s.title ?? '').trim(),
            description: String(s.description ?? '').trim(),
            productIds: Array.isArray(s.productIds)
              ? s.productIds
                  .map((x: unknown) => String(x ?? '').trim())
                  .filter(Boolean)
              : [],
          }))
          .filter((s: ShopCatalogSection) => s.id && s.title)
      : [];
    return { homeFeaturedProductIds, shopSections };
  }

  async getPublicLayout(): Promise<ShopCatalogLayout> {
    const [layout, products] = await Promise.all([
      this.readLayout(),
      this.listPublicProducts(),
    ]);
    const activeIds = new Set(products.map((p) => p.id));
    return {
      homeFeaturedProductIds: layout.homeFeaturedProductIds.filter((id) =>
        activeIds.has(id),
      ),
      shopSections: layout.shopSections.map((section) => ({
        ...section,
        productIds: section.productIds.filter((id) => activeIds.has(id)),
      })),
    };
  }

  async listHomeFeaturedProducts(): Promise<ShopCatalogProduct[]> {
    const ids = (await this.readLayout()).homeFeaturedProductIds;
    if (ids.length === 0) return this.listPopularProducts();
    const byId = new Map((await this.loadAll()).map((p) => [p.id, p]));
    const out: ShopCatalogProduct[] = [];
    for (const id of ids) {
      const p = byId.get(id);
      if (p && p.isActive !== false) out.push(p);
    }
    return out;
  }

  getAdminLayout(): Promise<ShopCatalogLayout> {
    return this.readLayout();
  }

  async setLayout(
    input: Partial<ShopCatalogLayout>,
  ): Promise<ShopCatalogLayout> {
    const cur = await this.readLayout();
    const validIds = new Set((await this.loadAll()).map((p) => p.id));

    const dedupe = (ids: string[]) => {
      const out: string[] = [];
      for (const raw of ids) {
        const id = String(raw ?? '').trim();
        if (!id || !validIds.has(id) || out.includes(id)) continue;
        out.push(id);
      }
      return out;
    };

    const homeFeaturedProductIds = dedupe(
      Array.isArray(input.homeFeaturedProductIds)
        ? input.homeFeaturedProductIds
        : cur.homeFeaturedProductIds,
    ).slice(0, 24);

    const rawSections = Array.isArray(input.shopSections)
      ? input.shopSections
      : cur.shopSections;
    const shopSections: ShopCatalogSection[] = [];
    const seenSectionIds = new Set<string>();
    for (const section of rawSections) {
      const id = String(section.id ?? '').trim();
      const title = String(section.title ?? '').trim();
      if (!id || !title || seenSectionIds.has(id)) continue;
      seenSectionIds.add(id);
      shopSections.push({
        id,
        title,
        description: String(section.description ?? '').trim(),
        productIds: dedupe(
          Array.isArray(section.productIds) ? section.productIds : [],
        ),
      });
    }

    const next: ShopCatalogLayout = { homeFeaturedProductIds, shopSections };
    await this.prisma.appSetting.upsert({
      where: { key: SETTING_LAYOUT },
      create: { key: SETTING_LAYOUT, value: toJsonDocument(next) },
      update: { value: toJsonDocument(next) },
    });
    return next;
  }

  // ---------------------------------------------------------------------
  // Product normalisation + CRUD
  // ---------------------------------------------------------------------

  private slugifyVariantLabel(label: string): string {
    return label
      .toLowerCase()
      .trim()
      .replace(/"/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  private formatRm(priceCents: number): string {
    if (!Number.isFinite(priceCents) || priceCents <= 0) return '';
    return `RM${(priceCents / 100).toFixed(2)}`;
  }

  private normalizeVariants(
    productId: string,
    raw: Partial<ShopCatalogProductVariant>[],
  ): ShopCatalogProductVariant[] {
    const out: ShopCatalogProductVariant[] = [];
    const usedIds = new Set<string>();
    for (const v of raw) {
      const label = String(v?.label ?? '').trim();
      if (!label) continue;
      const priceCents = Number.isFinite(Number(v?.priceCents))
        ? Math.max(0, Math.round(Number(v?.priceCents)))
        : 0;
      const available = v?.available !== false;
      let id = String(v?.id ?? '').trim();
      if (!id) {
        const base = `${productId}__${this.slugifyVariantLabel(label)}`;
        id = base;
        let i = 2;
        while (usedIds.has(id)) {
          id = `${base}-${i++}`;
        }
      }
      usedIds.add(id);
      const priceDisplay =
        v?.priceDisplay != null && String(v.priceDisplay).trim() !== ''
          ? String(v.priceDisplay).trim()
          : available && priceCents > 0
            ? this.formatRm(priceCents)
            : null;
      out.push({ id, label, priceCents, available, priceDisplay });
    }
    return out;
  }

  private normalizeProduct(
    raw: ShopCatalogProductInput,
    cur?: ShopCatalogProduct,
  ): ShopCatalogProduct {
    const base = cur ?? ({} as ShopCatalogProduct);
    const id = (raw.id ?? base.id ?? randomUUID()).trim();
    const variants =
      raw.variants != null
        ? this.normalizeVariants(id, raw.variants)
        : base.variants;
    return {
      id,
      category:
        (raw.category as ShopCatalogProduct['category']) ??
        base.category ??
        'specials',
      categoryLabel:
        raw.categoryLabel != null
          ? String(raw.categoryLabel).trim()
          : base.categoryLabel,
      name:
        raw.name != null
          ? String(raw.name).trim()
          : (base.name ?? 'Untitled product'),
      shortDescription:
        raw.shortDescription != null
          ? String(raw.shortDescription).trim()
          : (base.shortDescription ?? ''),
      description:
        raw.description != null
          ? String(raw.description).trim()
          : (base.description ?? ''),
      imageUrl:
        raw.imageUrl != null
          ? String(raw.imageUrl).trim()
          : (base.imageUrl ?? ''),
      images: raw.images != null ? raw.images : base.images,
      imageOffsetX: clampPercent(
        raw.imageOffsetX != null ? raw.imageOffsetX : base.imageOffsetX,
      ),
      imageOffsetY: clampPercent(
        raw.imageOffsetY != null ? raw.imageOffsetY : base.imageOffsetY,
      ),
      imageScale: clampScale(
        raw.imageScale != null ? raw.imageScale : base.imageScale,
      ),
      basePriceCents:
        raw.basePriceCents != null &&
        Number.isFinite(Number(raw.basePriceCents))
          ? Number(raw.basePriceCents)
          : (base.basePriceCents ?? 0),
      priceDisplay:
        raw.priceDisplay != null
          ? String(raw.priceDisplay).trim()
          : base.priceDisplay,
      variants,
      badge: raw.badge != null ? String(raw.badge).trim() : base.badge,
      soldOut: raw.soldOut != null ? Boolean(raw.soldOut) : base.soldOut,
      availableQty:
        raw.availableQty !== undefined
          ? clampQty(raw.availableQty)
          : base.availableQty,
      isActive:
        raw.isActive != null ? Boolean(raw.isActive) : base.isActive !== false,
      sortOrder:
        raw.sortOrder != null && Number.isFinite(Number(raw.sortOrder))
          ? Number(raw.sortOrder)
          : (base.sortOrder ?? 0),
      salesplayProductCode:
        raw.salesplayProductCode !== undefined
          ? normalizeSalesplayCode(raw.salesplayProductCode)
          : (base.salesplayProductCode ?? undefined),
      salesplayVariantCodes:
        raw.salesplayVariantCodes !== undefined
          ? normalizeSalesplayVariantCodes(raw.salesplayVariantCodes)
          : (base.salesplayVariantCodes ?? undefined),
      syncOverrides: Array.isArray(raw.syncOverrides)
        ? expandSyncOverrides(raw.syncOverrides as string[])
        : (base.syncOverrides ?? undefined),
    };
  }

  async listPublicProducts(): Promise<ShopCatalogProduct[]> {
    return (await this.loadAll())
      .filter((p) => p.isActive !== false)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  async listAdminProducts(): Promise<ShopCatalogProduct[]> {
    return (await this.loadAll()).sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );
  }

  async createProduct(
    input: ShopCatalogProductInput,
  ): Promise<ShopCatalogProduct> {
    const next = this.normalizeProduct(input);
    if (await this.loadOne(next.id)) {
      throw new BadRequestException(
        `A product with id "${next.id}" already exists.`,
      );
    }
    return this.saveProduct(next, { includeStock: true });
  }

  async updateProduct(
    id: string,
    input: ShopCatalogProductInput,
  ): Promise<ShopCatalogProduct> {
    const before = await this.requireOne(id);
    const next = this.normalizeProduct(input, before);
    const changed = detectChangedFields(before, next);
    if (changed.length > 0) {
      next.syncOverrides = mergeSyncOverrides(before.syncOverrides, changed);
    }
    // Only touch the stock column when the admin explicitly sent a value —
    // otherwise a product edit would overwrite a concurrent kitchen update.
    return this.saveProduct(next, {
      includeStock: input.availableQty !== undefined,
    });
  }

  // ---------------------------------------------------------------------
  // Kitchen stock tracking (cakes only)
  // ---------------------------------------------------------------------

  /** Cake products for the kitchen staff stock screen (ops/kitchen). */
  async listKitchenStock(): Promise<
    {
      id: string;
      name: string;
      category: ShopCatalogProduct['category'];
      availableQty: number | null;
      soldOut: boolean;
    }[]
  > {
    const rows = await this.prisma.shopProduct.findMany({
      where: { category: { in: ['whole_cakes', 'cake_slices'] } },
      orderBy: { name: 'asc' },
    });
    return rows.map(rowToProduct).map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      availableQty: p.availableQty ?? null,
      soldOut: isProductSoldOut(p),
    }));
  }

  /** Kitchen staff set today's ready count for one cake. */
  async setAvailableQty(id: string, qty: number): Promise<ShopCatalogProduct> {
    const res = await this.prisma.shopProduct.updateMany({
      where: { id },
      data: { availableQty: clampQty(qty) ?? 0 },
    });
    if (res.count === 0) {
      throw new NotFoundException('Shop catalog product not found');
    }
    return this.requireOne(id);
  }

  /** Currently available quantity for a stock-tracked product, or null if untracked/missing. */
  async getAvailableQty(id: string): Promise<number | null> {
    const row = await this.prisma.shopProduct.findUnique({
      where: { id },
      select: { availableQty: true },
    });
    return row?.availableQty ?? null;
  }

  /**
   * Decrements kitchen-tracked stock for a paid order's lines, clamped at 0,
   * as atomic per-row UPDATEs (safe under concurrent payments and kitchen
   * edits). Products that aren't stock-tracked (`available_qty` NULL) are
   * untouched. Pass the surrounding transaction client so the decrement
   * commits together with the order status change.
   */
  async decrementStockForOrderLines(
    lines: { productId: string; qty: number }[],
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    for (const line of lines) {
      const qty = Math.max(0, Math.round(line.qty));
      if (qty === 0) continue;
      await tx.$executeRaw`
        UPDATE shop_products
        SET available_qty = GREATEST(0, available_qty - ${qty}),
            updated_at = NOW()
        WHERE id = ${line.productId} AND available_qty IS NOT NULL
      `;
    }
  }

  /**
   * Permanently removes a product from the member catalog: deletes the record,
   * cleans up any locally-uploaded images, and drops dangling references from
   * the home/shop layout and the popular config.
   */
  async deleteProduct(id: string): Promise<{ id: string; deleted: true }> {
    const removed = await this.requireOne(id);
    await this.prisma.shopProduct.delete({ where: { id } });

    if (removed.imageUrl) this.tryRemoveLocalProductImage(removed.imageUrl);
    if (Array.isArray(removed.images)) {
      for (const img of removed.images) {
        this.tryRemoveLocalProductImage(img?.src);
      }
    }

    // Re-saving layout / popular prunes ids that no longer exist in the catalog.
    await this.setLayout(await this.readLayout());
    await this.setPopularConfig(await this.getPopularConfig());

    return { id, deleted: true };
  }

  async resetProductSyncOverrides(id: string): Promise<ShopCatalogProduct> {
    const cur = await this.requireOne(id);
    return this.saveProduct({ ...cur, syncOverrides: undefined });
  }

  // ---------------------------------------------------------------------
  // Home "popular" config — app_settings
  // ---------------------------------------------------------------------

  async getPopularConfig(): Promise<HomePopularConfig> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: SETTING_POPULAR },
    });
    const parsed = row?.value as Partial<HomePopularConfig> | null | undefined;
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_POPULAR };
    const maxLimit = Math.max(
      1,
      Math.min(
        POPULAR_HARD_MAX,
        Number.isFinite(Number(parsed.maxLimit))
          ? Number(parsed.maxLimit)
          : DEFAULT_POPULAR.maxLimit,
      ),
    );
    const ids = Array.isArray(parsed.productIds)
      ? parsed.productIds
          .map((x: unknown) => String(x ?? '').trim())
          .filter(Boolean)
          .slice(0, maxLimit)
      : [];
    return { productIds: ids, maxLimit };
  }

  async setPopularConfig(
    input: Partial<HomePopularConfig>,
  ): Promise<HomePopularConfig> {
    const cur = await this.getPopularConfig();
    const maxLimit = Math.max(
      1,
      Math.min(
        POPULAR_HARD_MAX,
        input.maxLimit != null && Number.isFinite(Number(input.maxLimit))
          ? Number(input.maxLimit)
          : cur.maxLimit,
      ),
    );
    const rawIds = Array.isArray(input.productIds)
      ? input.productIds
      : cur.productIds;
    const validIds = new Set((await this.loadAll()).map((p) => p.id));
    const dedup: string[] = [];
    for (const id of rawIds) {
      const s = String(id ?? '').trim();
      if (!s || !validIds.has(s)) continue;
      if (dedup.includes(s)) continue;
      dedup.push(s);
      if (dedup.length >= maxLimit) break;
    }
    const next: HomePopularConfig = { productIds: dedup, maxLimit };
    await this.prisma.appSetting.upsert({
      where: { key: SETTING_POPULAR },
      create: { key: SETTING_POPULAR, value: toJsonDocument(next) },
      update: { value: toJsonDocument(next) },
    });
    return next;
  }

  async listPopularProducts(): Promise<ShopCatalogProduct[]> {
    const cfg = await this.getPopularConfig();
    if (cfg.productIds.length === 0) return [];
    const byId = new Map((await this.loadAll()).map((p) => [p.id, p]));
    const out: ShopCatalogProduct[] = [];
    for (const id of cfg.productIds) {
      const p = byId.get(id);
      if (p && p.isActive !== false) out.push(p);
      if (out.length >= cfg.maxLimit) break;
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // moja-sites catalog (sync source). The uploaded copy lives in app_settings;
  // local files / URL are fallbacks for dev and first-time setup.
  // ---------------------------------------------------------------------

  /** Label shown to admins for the stored upload (no longer a disk path). */
  private sitesCatalogStoredLabel(): string {
    return `app_settings:${SETTING_SITES_SOURCE}`;
  }

  /** Local file fallbacks, in priority order. */
  private findSitesCatalogPath(): string | null {
    const candidates: string[] = [];
    const envPath = process.env.MOJA_SITES_CATALOG_PATH?.trim();
    if (envPath) candidates.push(resolve(envPath));
    candidates.push(dataDir('products.catalog.json'));
    candidates.push(resolve(process.cwd(), 'config', 'products.catalog.json'));
    candidates.push(
      resolve(
        process.cwd(),
        '..',
        'moja-sites',
        'config',
        'products.catalog.json',
      ),
    );
    for (const p of candidates) {
      if (existsSync(p)) return p;
    }
    return null;
  }

  private deriveSitesCatalogUrl(): string | null {
    const explicit = process.env.MOJA_SITES_CATALOG_URL?.trim();
    if (explicit) return explicit;
    const shopBase = process.env.SHOP_WEB_BASE_URL?.trim();
    if (!shopBase) return null;
    try {
      const origin = new URL(shopBase.endsWith('/') ? shopBase : `${shopBase}/`)
        .origin;
      return `${origin}/config/products.catalog.json`;
    } catch {
      return null;
    }
  }

  private async readStoredSitesCatalog(): Promise<{
    catalog: SitesCatalog;
    uploadedAt: string | null;
  } | null> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: SETTING_SITES_SOURCE },
    });
    const value = row?.value as
      | { catalog?: unknown; uploadedAt?: unknown }
      | null
      | undefined;
    if (!value || typeof value !== 'object') return null;
    try {
      return {
        catalog: this.parseSitesCatalog(JSON.stringify(value.catalog)),
        uploadedAt:
          typeof value.uploadedAt === 'string' ? value.uploadedAt : null,
      };
    } catch {
      return null;
    }
  }

  async getSitesCatalogFileInfo(): Promise<{
    exists: boolean;
    path: string;
    productCount?: number;
    mtime?: string;
  }> {
    const stored = await this.readStoredSitesCatalog();
    if (!stored) {
      return { exists: false, path: this.sitesCatalogStoredLabel() };
    }
    return {
      exists: true,
      path: this.sitesCatalogStoredLabel(),
      productCount: stored.catalog.products.length,
      mtime: stored.uploadedAt ?? undefined,
    };
  }

  async saveSitesCatalogFile(raw: string): Promise<{
    path: string;
    productCount: number;
  }> {
    const catalog = this.parseSitesCatalog(raw);
    const value = toJsonDocument({
      catalog,
      uploadedAt: new Date().toISOString(),
    });
    await this.prisma.appSetting.upsert({
      where: { key: SETTING_SITES_SOURCE },
      create: { key: SETTING_SITES_SOURCE, value },
      update: { value },
    });
    return {
      path: this.sitesCatalogStoredLabel(),
      productCount: catalog.products.length,
    };
  }

  private parseSitesCatalog(raw: string): SitesCatalog {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException('Invalid moja-sites catalog JSON');
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !Array.isArray((parsed as SitesCatalog).products)
    ) {
      throw new BadRequestException(
        'Catalog JSON must include a products array (moja-sites products.catalog.json shape)',
      );
    }
    return parsed as SitesCatalog;
  }

  async loadSitesCatalog(catalog?: SitesCatalog): Promise<{
    catalog: SitesCatalog;
    source: ShopCatalogSyncPreview['source'];
    sourceLabel: string;
  }> {
    if (catalog) {
      if (!Array.isArray(catalog.products)) {
        throw new BadRequestException('catalog.products must be an array');
      }
      return {
        catalog,
        source: 'body',
        sourceLabel: 'Uploaded / request body',
      };
    }

    const url = this.deriveSitesCatalogUrl();
    if (url) {
      const explicitUrl = Boolean(process.env.MOJA_SITES_CATALOG_URL?.trim());
      let failure: string | null = null;
      try {
        const res = await fetch(url);
        if (res.ok) {
          const text = await res.text();
          return {
            catalog: this.parseSitesCatalog(text),
            source: 'url',
            sourceLabel: url,
          };
        }
        failure = `HTTP ${res.status}`;
      } catch (err) {
        // Connection refused / DNS / timeout — treat like a non-OK response.
        failure = err instanceof Error ? err.message : String(err);
      }
      if (explicitUrl) {
        throw new BadRequestException(
          `Failed to fetch moja-sites catalog (${failure}) from MOJA_SITES_CATALOG_URL`,
        );
      }
      this.logger.warn(
        `moja-sites catalog fetch from ${url} failed (${failure}); using stored copy / local file`,
      );
      /* SHOP_WEB_BASE_URL-derived URL failed — fall through to stored copy / local file */
    }

    const stored = await this.readStoredSitesCatalog();
    if (stored) {
      return {
        catalog: stored.catalog,
        source: 'path',
        sourceLabel: this.sitesCatalogStoredLabel(),
      };
    }

    const path = this.findSitesCatalogPath();
    if (!path) {
      throw new BadRequestException(
        'moja-sites catalog not found. Upload the catalog once in the admin (it is stored in the database), or set MOJA_SITES_CATALOG_URL to a public JSON URL. Local dev: clone moja-sites as a sibling repo, or set MOJA_SITES_CATALOG_PATH.',
      );
    }
    return {
      catalog: this.parseSitesCatalog(readFileSync(path, 'utf-8')),
      source: 'path',
      sourceLabel: path,
    };
  }

  async previewSyncFromSites(input: {
    catalog?: SitesCatalog;
    mode?: ShopCatalogSyncMode;
    syncLayout?: boolean;
  }): Promise<ShopCatalogSyncPreview> {
    const { catalog, source, sourceLabel } = await this.loadSitesCatalog(
      input.catalog,
    );
    const mode = input.mode ?? 'pricing_and_media';
    return buildSyncPreview(
      await this.loadAll(),
      catalog,
      mode,
      source,
      sourceLabel,
      Boolean(input.syncLayout),
    );
  }

  async applySyncFromSites(input: {
    catalog?: SitesCatalog;
    mode?: ShopCatalogSyncMode;
    createMissing?: boolean;
    syncLayout?: boolean;
    writeSeedConfig?: boolean;
  }): Promise<{
    preview: ShopCatalogSyncPreview;
    productsUpdated: number;
    productsCreated: number;
    layoutUpdated: boolean;
  }> {
    const { catalog, source, sourceLabel } = await this.loadSitesCatalog(
      input.catalog,
    );
    const mode = input.mode ?? 'pricing_and_media';
    const createMissing = input.createMissing !== false;
    const syncLayout = Boolean(input.syncLayout);
    const writeSeedConfig = Boolean(input.writeSeedConfig);

    const current = await this.loadAll();
    const preview = buildSyncPreview(
      current,
      catalog,
      mode,
      source,
      sourceLabel,
      syncLayout,
    );

    const next = applySyncToMemberCatalog(
      current,
      catalog,
      mode,
      createMissing,
    );
    await this.saveAll(next);

    // Dev convenience: refresh the committed seed under config/ so a fresh
    // database boots with the synced catalog.
    if (writeSeedConfig) {
      mkdirSync(resolve(process.cwd(), 'config'), { recursive: true });
      writeFileSync(
        resolve(process.cwd(), 'config', 'shop-catalog.products.json'),
        JSON.stringify(next, null, 2),
        'utf-8',
      );
    }

    let layoutUpdated = false;
    if (syncLayout) {
      await this.setLayout(sitesCatalogToLayout(catalog));
      layoutUpdated = true;
      if (writeSeedConfig) {
        writeFileSync(
          resolve(process.cwd(), 'config', 'shop-catalog.layout.json'),
          JSON.stringify(sitesCatalogToLayout(catalog), null, 2),
          'utf-8',
        );
      }
    }

    return {
      preview,
      productsUpdated: preview.summary.toUpdate,
      productsCreated: createMissing ? preview.summary.toCreate : 0,
      layoutUpdated,
    };
  }

  // ---------------------------------------------------------------------
  // SalesPlay product mapping
  // ---------------------------------------------------------------------

  /**
   * Resolves the SalesPlay product code for an order line: the variant-level
   * code when the line has a matching variant label, else the product-level
   * code, else null (caller falls back to the catalog product id).
   */
  async resolveSalesplayProductCode(
    productId: string,
    variantLabel?: string | null,
  ): Promise<string | null> {
    const product = await this.loadOne(productId);
    if (!product) return null;
    const label = variantLabel?.trim();
    if (label && product.salesplayVariantCodes) {
      const exact = product.salesplayVariantCodes[label];
      if (exact?.trim()) return exact.trim();
    }
    return product.salesplayProductCode?.trim() || null;
  }

  /**
   * Every configured SalesPlay code → catalog product, for folding POS receipt
   * lines back onto catalog identities in reporting. Variant codes map to
   * their parent product (reporting is product-level). Codes are matched
   * case-insensitively (keys are lower-cased).
   */
  async salesplayCodeIndex(): Promise<Map<string, SalesplayCodeMapping>> {
    const index = new Map<string, SalesplayCodeMapping>();
    for (const p of await this.loadAll()) {
      const productCode = p.salesplayProductCode?.trim();
      if (productCode) {
        index.set(productCode.toLowerCase(), {
          code: productCode,
          productId: p.id,
          productName: p.name,
          variantLabel: null,
        });
      }
      for (const [label, code] of Object.entries(
        p.salesplayVariantCodes ?? {},
      )) {
        const trimmed = code?.trim();
        if (!trimmed) continue;
        index.set(trimmed.toLowerCase(), {
          code: trimmed,
          productId: p.id,
          productName: p.name,
          variantLabel: label,
        });
      }
    }
    return index;
  }

  /**
   * Distinct product codes seen on POS receipt lines (with a sample name and
   * how often each sold), to help the admin match catalog products to
   * SalesPlay codes without leaving the dashboard.
   */
  async listKnownSalesplayCodes(): Promise<
    {
      code: string;
      name: string;
      lineCount: number;
      mappedProductId: string | null;
    }[]
  > {
    const rows = await this.prisma.posReceiptLine.groupBy({
      by: ['productCode'],
      where: { productCode: { not: null } },
      _count: { _all: true },
      _max: { name: true },
      orderBy: { _count: { productCode: 'desc' } },
      take: 500,
    });
    const index = await this.salesplayCodeIndex();
    return rows
      .filter((r) => r.productCode?.trim())
      .map((r) => {
        const code = r.productCode!.trim();
        return {
          code,
          name: r._max.name ?? '',
          lineCount: r._count._all,
          mappedProductId: index.get(code.toLowerCase())?.productId ?? null,
        };
      });
  }

  // ---------------------------------------------------------------------
  // Product image upload (file from admin's PC → data/uploads/products/<id>-<ts>.<ext>)
  // The static asset middleware in main.ts serves data/uploads at /uploads/,
  // so the resulting public URL is /uploads/products/<file>. resolveApiAssetUrl
  // on the client side prepends the API base, giving the same absolute URL to
  // the member app and any other consumer (e.g. moja-sites) pointing at this API.
  // NOTE: uploads still live on local disk — mount a persistent volume for
  // data/ (see docs/DEPLOYMENT.md §6.1) or move to object storage.
  // ---------------------------------------------------------------------

  private productImagesDir(): string {
    return dataDir('uploads', 'products');
  }

  private tryRemoveLocalProductImage(url: string | null | undefined): void {
    if (!url) return;
    if (!url.startsWith(PRODUCT_IMAGE_PUBLIC_PREFIX)) return;
    const name = url.substring(PRODUCT_IMAGE_PUBLIC_PREFIX.length);
    if (!/^[a-z0-9._-]+$/i.test(name)) return;
    const p = resolve(this.productImagesDir(), name);
    try {
      if (existsSync(p)) unlinkSync(p);
    } catch {
      /* ignore */
    }
  }

  async attachProductImage(
    id: string,
    file: {
      buffer: Buffer;
      mimetype: string;
      originalname?: string;
      size: number;
    },
  ): Promise<ShopCatalogProduct> {
    if (!file || !file.buffer || !file.buffer.length) {
      throw new BadRequestException('No file provided');
    }
    if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
      throw new BadRequestException(
        `Image too large. Max ${Math.round(
          PRODUCT_IMAGE_MAX_BYTES / 1024 / 1024,
        )} MB.`,
      );
    }
    const ext =
      PRODUCT_IMAGE_ALLOWED_MIME[String(file.mimetype || '').toLowerCase()] ||
      (file.originalname ? extname(file.originalname).toLowerCase() : '');
    const allowedExts = new Set(Object.values(PRODUCT_IMAGE_ALLOWED_MIME));
    if (!ext || !allowedExts.has(ext)) {
      throw new BadRequestException(
        'Unsupported image type. Use PNG, JPEG, WEBP, or GIF.',
      );
    }

    const cur = await this.loadOne(id);
    if (!cur) throw new NotFoundException('Product not found');

    mkdirSync(this.productImagesDir(), { recursive: true });
    const safeId = id.replace(/[^a-z0-9_-]/gi, '_');
    const filename = `${safeId}-${Date.now()}${ext}`;
    const diskPath = resolve(this.productImagesDir(), filename);
    writeFileSync(diskPath, file.buffer);

    const prevUrl = cur.imageUrl;
    const publicUrl = `${PRODUCT_IMAGE_PUBLIC_PREFIX}${filename}`;
    const existingImages = Array.isArray(cur.images) ? cur.images : [];
    const nextImages = [
      { src: publicUrl, alt: cur.name },
      ...existingImages.filter(
        (img) => img.src !== prevUrl && img.src !== publicUrl,
      ),
    ];
    const saved = await this.saveProduct({
      ...cur,
      imageUrl: publicUrl,
      images: nextImages,
      syncOverrides: mergeSyncOverrides(cur.syncOverrides, ['imageUrl']),
    });

    if (prevUrl && prevUrl !== publicUrl) {
      this.tryRemoveLocalProductImage(prevUrl);
    }
    return saved;
  }

  async clearProductImage(id: string): Promise<ShopCatalogProduct> {
    const cur = await this.loadOne(id);
    if (!cur) throw new NotFoundException('Product not found');
    const prev = cur.imageUrl;
    if (prev) this.tryRemoveLocalProductImage(prev);
    return this.saveProduct({
      ...cur,
      imageUrl: '',
      images: undefined,
      syncOverrides: mergeSyncOverrides(cur.syncOverrides, ['imageUrl']),
    });
  }
}
