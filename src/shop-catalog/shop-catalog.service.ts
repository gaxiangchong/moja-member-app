import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { extname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
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
  basePriceCents: number;
  /** Human-readable price label, e.g. "RM168.00" or "RM13.90 each". */
  priceDisplay?: string;
  variants?: ShopCatalogProductVariant[];
  badge?: string;
  soldOut?: boolean;
  isActive: boolean;
  sortOrder: number;
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

const DEFAULT_PRODUCTS: ShopCatalogProduct[] = [];

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

const POPULAR_HARD_MAX = 5;

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

@Injectable()
export class ShopCatalogService {
  private filePath(): string {
    return resolve(process.cwd(), 'data', 'shop-catalog.products.json');
  }

  private layoutFilePath(): string {
    return resolve(process.cwd(), 'data', 'shop-catalog.layout.json');
  }

  private popularFilePath(): string {
    return resolve(process.cwd(), 'data', 'home-popular.json');
  }

  private seedFilePath(): string {
    return resolve(process.cwd(), 'config', 'shop-catalog.products.json');
  }

  private layoutSeedFilePath(): string {
    return resolve(process.cwd(), 'config', 'shop-catalog.layout.json');
  }

  private popularSeedFilePath(): string {
    return resolve(process.cwd(), 'config', 'home-popular.json');
  }

  private ensureFile(): void {
    const p = this.filePath();
    if (existsSync(p)) return;
    mkdirSync(resolve(process.cwd(), 'data'), { recursive: true });
    if (existsSync(this.seedFilePath())) {
      writeFileSync(p, readFileSync(this.seedFilePath(), 'utf-8'), 'utf-8');
      return;
    }
    writeFileSync(p, JSON.stringify(DEFAULT_PRODUCTS, null, 2), 'utf-8');
  }

  private ensurePopularFile(): void {
    const p = this.popularFilePath();
    if (existsSync(p)) return;
    mkdirSync(resolve(process.cwd(), 'data'), { recursive: true });
    if (existsSync(this.popularSeedFilePath())) {
      writeFileSync(
        p,
        readFileSync(this.popularSeedFilePath(), 'utf-8'),
        'utf-8',
      );
      return;
    }
    writeFileSync(p, JSON.stringify(DEFAULT_POPULAR, null, 2), 'utf-8');
  }

  /** Fix imageUrl drift from moja-sites sync (spaces, wrong case, old filenames). */
  private repairCanonicalProductImages(
    items: ShopCatalogProduct[],
  ): ShopCatalogProduct[] {
    let changed = false;
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
      changed = true;
      const images =
        Array.isArray(p.images) && p.images.length > 0
          ? p.images.map((img, i) =>
              i === 0 ? { ...img, src: canonical } : img,
            )
          : [{ src: canonical, alt: p.name }];
      return { ...p, imageUrl: canonical, images };
    });
    if (changed) this.writeAll(out);
    return out;
  }

  private readAll(): ShopCatalogProduct[] {
    this.ensureFile();
    try {
      const raw = readFileSync(this.filePath(), 'utf-8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [...DEFAULT_PRODUCTS];
      return this.repairCanonicalProductImages(parsed as ShopCatalogProduct[]);
    } catch {
      return [...DEFAULT_PRODUCTS];
    }
  }

  private writeAll(items: ShopCatalogProduct[]): void {
    mkdirSync(resolve(process.cwd(), 'data'), { recursive: true });
    writeFileSync(this.filePath(), JSON.stringify(items, null, 2), 'utf-8');
  }

  private ensureLayoutFile(): void {
    const p = this.layoutFilePath();
    if (existsSync(p)) return;
    mkdirSync(resolve(process.cwd(), 'data'), { recursive: true });
    if (existsSync(this.layoutSeedFilePath())) {
      writeFileSync(
        p,
        readFileSync(this.layoutSeedFilePath(), 'utf-8'),
        'utf-8',
      );
      return;
    }
    writeFileSync(p, JSON.stringify(DEFAULT_LAYOUT, null, 2), 'utf-8');
  }

  private readLayout(): ShopCatalogLayout {
    this.ensureLayoutFile();
    try {
      const raw = readFileSync(this.layoutFilePath(), 'utf-8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_LAYOUT };
      const homeFeaturedProductIds = Array.isArray(
        parsed.homeFeaturedProductIds,
      )
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
    } catch {
      return { ...DEFAULT_LAYOUT };
    }
  }

  getPublicLayout(): ShopCatalogLayout {
    const layout = this.readLayout();
    const activeIds = new Set(this.listPublicProducts().map((p) => p.id));
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

  listHomeFeaturedProducts(): ShopCatalogProduct[] {
    const ids = this.readLayout().homeFeaturedProductIds;
    if (ids.length === 0) return this.listPopularProducts();
    const byId = new Map(this.readAll().map((p) => [p.id, p]));
    const out: ShopCatalogProduct[] = [];
    for (const id of ids) {
      const p = byId.get(id);
      if (p && p.isActive !== false) out.push(p);
    }
    return out;
  }

  getAdminLayout(): ShopCatalogLayout {
    return this.readLayout();
  }

  setLayout(input: Partial<ShopCatalogLayout>): ShopCatalogLayout {
    const cur = this.readLayout();
    const validIds = new Set(this.readAll().map((p) => p.id));

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
    mkdirSync(resolve(process.cwd(), 'data'), { recursive: true });
    writeFileSync(
      this.layoutFilePath(),
      JSON.stringify(next, null, 2),
      'utf-8',
    );
    return next;
  }

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
      isActive:
        raw.isActive != null ? Boolean(raw.isActive) : base.isActive !== false,
      sortOrder:
        raw.sortOrder != null && Number.isFinite(Number(raw.sortOrder))
          ? Number(raw.sortOrder)
          : (base.sortOrder ?? 0),
    };
  }

  listPublicProducts(): ShopCatalogProduct[] {
    return this.readAll()
      .filter((p) => p.isActive !== false)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  listAdminProducts(): ShopCatalogProduct[] {
    return this.readAll().sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );
  }

  createProduct(input: ShopCatalogProductInput): ShopCatalogProduct {
    const all = this.readAll();
    const next = this.normalizeProduct(input);
    all.push(next);
    this.writeAll(all);
    return next;
  }

  updateProduct(
    id: string,
    input: ShopCatalogProductInput,
  ): ShopCatalogProduct {
    const all = this.readAll();
    const idx = all.findIndex((p) => p.id === id);
    if (idx < 0) throw new NotFoundException('Shop catalog product not found');
    const next = this.normalizeProduct(input, all[idx]);
    all[idx] = next;
    this.writeAll(all);
    return next;
  }

  getPopularConfig(): HomePopularConfig {
    this.ensurePopularFile();
    try {
      const raw = readFileSync(this.popularFilePath(), 'utf-8');
      const parsed = JSON.parse(raw);
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
    } catch {
      return { ...DEFAULT_POPULAR };
    }
  }

  setPopularConfig(input: Partial<HomePopularConfig>): HomePopularConfig {
    const cur = this.getPopularConfig();
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
    const all = this.readAll();
    const validIds = new Set(all.map((p) => p.id));
    const dedup: string[] = [];
    for (const id of rawIds) {
      const s = String(id ?? '').trim();
      if (!s || !validIds.has(s)) continue;
      if (dedup.includes(s)) continue;
      dedup.push(s);
      if (dedup.length >= maxLimit) break;
    }
    const next: HomePopularConfig = { productIds: dedup, maxLimit };
    mkdirSync(resolve(process.cwd(), 'data'), { recursive: true });
    writeFileSync(
      this.popularFilePath(),
      JSON.stringify(next, null, 2),
      'utf-8',
    );
    return next;
  }

  listPopularProducts(): ShopCatalogProduct[] {
    const cfg = this.getPopularConfig();
    if (cfg.productIds.length === 0) return [];
    const byId = new Map(this.readAll().map((p) => [p.id, p]));
    const out: ShopCatalogProduct[] = [];
    for (const id of cfg.productIds) {
      const p = byId.get(id);
      if (p && p.isActive !== false) out.push(p);
      if (out.length >= cfg.maxLimit) break;
    }
    return out;
  }

  /** Fixed path on the persistent disk (Render: mount at /opt/render/project/src/data). */
  sitesCatalogFilePath(): string {
    return resolve(process.cwd(), 'data', 'products.catalog.json');
  }

  /** First existing catalog file, in priority order. */
  private findSitesCatalogPath(): string | null {
    const candidates: string[] = [];
    const envPath = process.env.MOJA_SITES_CATALOG_PATH?.trim();
    if (envPath) candidates.push(resolve(envPath));
    candidates.push(this.sitesCatalogFilePath());
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

  private preferredSitesCatalogPathForErrors(): string {
    const envPath = process.env.MOJA_SITES_CATALOG_PATH?.trim();
    if (envPath) return resolve(envPath);
    return this.sitesCatalogFilePath();
  }

  private deriveSitesCatalogUrl(): string | null {
    const explicit = process.env.MOJA_SITES_CATALOG_URL?.trim();
    if (explicit) return explicit;
    const shopBase = process.env.SHOP_WEB_BASE_URL?.trim();
    if (!shopBase) return null;
    try {
      const origin = new URL(
        shopBase.endsWith('/') ? shopBase : `${shopBase}/`,
      ).origin;
      return `${origin}/config/products.catalog.json`;
    } catch {
      return null;
    }
  }

  getSitesCatalogFileInfo(): {
    exists: boolean;
    path: string;
    productCount?: number;
    mtime?: string;
  } {
    const path = this.sitesCatalogFilePath();
    if (!existsSync(path)) {
      return { exists: false, path };
    }
    try {
      const raw = readFileSync(path, 'utf-8');
      const catalog = this.parseSitesCatalog(raw);
      const stat = statSync(path);
      return {
        exists: true,
        path,
        productCount: catalog.products.length,
        mtime: stat.mtime.toISOString(),
      };
    } catch {
      return { exists: true, path };
    }
  }

  saveSitesCatalogFile(raw: string): {
    path: string;
    productCount: number;
  } {
    const catalog = this.parseSitesCatalog(raw);
    mkdirSync(resolve(process.cwd(), 'data'), { recursive: true });
    writeFileSync(
      this.sitesCatalogFilePath(),
      JSON.stringify(catalog, null, 2),
      'utf-8',
    );
    return {
      path: this.sitesCatalogFilePath(),
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
      const res = await fetch(url);
      if (res.ok) {
        const text = await res.text();
        return {
          catalog: this.parseSitesCatalog(text),
          source: 'url',
          sourceLabel: url,
        };
      }
      if (process.env.MOJA_SITES_CATALOG_URL?.trim()) {
        throw new BadRequestException(
          `Failed to fetch moja-sites catalog (${res.status}) from MOJA_SITES_CATALOG_URL`,
        );
      }
      /* SHOP_WEB_BASE_URL-derived URL failed — fall through to local file */
    }

    const path = this.findSitesCatalogPath();
    if (!path) {
      const preferred = this.preferredSitesCatalogPathForErrors();
      throw new BadRequestException(
        `moja-sites catalog not found. On Render: upload the catalog once below (saved to ${preferred}), or set MOJA_SITES_CATALOG_URL to a public JSON URL. Local dev: clone moja-sites as a sibling repo, or set MOJA_SITES_CATALOG_PATH.`,
      );
    }
    return {
      catalog: this.parseSitesCatalog(readFileSync(path, 'utf-8')),
      source: 'path',
      sourceLabel: path,
    };
  }

  previewSyncFromSites(input: {
    catalog?: SitesCatalog;
    mode?: ShopCatalogSyncMode;
    syncLayout?: boolean;
  }): Promise<ShopCatalogSyncPreview> {
    return this.loadSitesCatalog(input.catalog).then(
      ({ catalog, source, sourceLabel }) => {
        const mode = input.mode ?? 'pricing_and_media';
        return buildSyncPreview(
          this.readAll(),
          catalog,
          mode,
          source,
          sourceLabel,
          Boolean(input.syncLayout),
        );
      },
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

    const preview = buildSyncPreview(
      this.readAll(),
      catalog,
      mode,
      source,
      sourceLabel,
      syncLayout,
    );

    const next = applySyncToMemberCatalog(
      this.readAll(),
      catalog,
      mode,
      createMissing,
    );
    this.writeAll(next);

    if (writeSeedConfig) {
      mkdirSync(resolve(process.cwd(), 'config'), { recursive: true });
      writeFileSync(
        this.seedFilePath(),
        JSON.stringify(next, null, 2),
        'utf-8',
      );
    }

    let layoutUpdated = false;
    if (syncLayout) {
      this.setLayout(sitesCatalogToLayout(catalog));
      layoutUpdated = true;
      if (writeSeedConfig) {
        writeFileSync(
          this.layoutSeedFilePath(),
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
  // Product image upload (file from admin's PC → data/uploads/products/<id>-<ts>.<ext>)
  // The static asset middleware in main.ts serves data/uploads at /uploads/,
  // so the resulting public URL is /uploads/products/<file>. resolveApiAssetUrl
  // on the client side prepends the API base, giving the same absolute URL to
  // the member app and any other consumer (e.g. moja-sites) pointing at this API.
  // ---------------------------------------------------------------------

  private productImagesDir(): string {
    return resolve(process.cwd(), 'data', 'uploads', 'products');
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

  attachProductImage(
    id: string,
    file: {
      buffer: Buffer;
      mimetype: string;
      originalname?: string;
      size: number;
    },
  ): ShopCatalogProduct {
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

    const all = this.readAll();
    const idx = all.findIndex((p) => p.id === id);
    if (idx < 0) throw new NotFoundException('Product not found');

    mkdirSync(this.productImagesDir(), { recursive: true });
    const safeId = id.replace(/[^a-z0-9_-]/gi, '_');
    const filename = `${safeId}-${Date.now()}${ext}`;
    const diskPath = resolve(this.productImagesDir(), filename);
    writeFileSync(diskPath, file.buffer);

    const prevUrl = all[idx].imageUrl;
    const publicUrl = `${PRODUCT_IMAGE_PUBLIC_PREFIX}${filename}`;
    all[idx] = { ...all[idx], imageUrl: publicUrl };
    this.writeAll(all);

    if (prevUrl && prevUrl !== publicUrl) {
      this.tryRemoveLocalProductImage(prevUrl);
    }
    return all[idx];
  }

  clearProductImage(id: string): ShopCatalogProduct {
    const all = this.readAll();
    const idx = all.findIndex((p) => p.id === id);
    if (idx < 0) throw new NotFoundException('Product not found');
    const prev = all[idx].imageUrl;
    if (prev) this.tryRemoveLocalProductImage(prev);
    all[idx] = { ...all[idx], imageUrl: '' };
    this.writeAll(all);
    return all[idx];
  }
}
