import { Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

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

export type ShopCatalogProductInput = Omit<Partial<ShopCatalogProduct>, 'variants'> & {
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
      writeFileSync(p, readFileSync(this.popularSeedFilePath(), 'utf-8'), 'utf-8');
      return;
    }
    writeFileSync(p, JSON.stringify(DEFAULT_POPULAR, null, 2), 'utf-8');
  }

  private readAll(): ShopCatalogProduct[] {
    this.ensureFile();
    try {
      const raw = readFileSync(this.filePath(), 'utf-8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [...DEFAULT_PRODUCTS];
      return parsed as ShopCatalogProduct[];
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
      writeFileSync(p, readFileSync(this.layoutSeedFilePath(), 'utf-8'), 'utf-8');
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
                ? s.productIds.map((x: unknown) => String(x ?? '').trim()).filter(Boolean)
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
        productIds: dedupe(Array.isArray(section.productIds) ? section.productIds : []),
      });
    }

    const next: ShopCatalogLayout = { homeFeaturedProductIds, shopSections };
    mkdirSync(resolve(process.cwd(), 'data'), { recursive: true });
    writeFileSync(this.layoutFilePath(), JSON.stringify(next, null, 2), 'utf-8');
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

  private normalizeProduct(raw: ShopCatalogProductInput, cur?: ShopCatalogProduct): ShopCatalogProduct {
    const base = cur ?? ({} as ShopCatalogProduct);
    const id = (raw.id ?? base.id ?? randomUUID()).trim();
    const variants =
      raw.variants != null
        ? this.normalizeVariants(id, raw.variants)
        : base.variants;
    return {
      id,
      category: (raw.category as ShopCatalogProduct['category']) ?? base.category ?? 'specials',
      categoryLabel:
        raw.categoryLabel != null
          ? String(raw.categoryLabel).trim()
          : base.categoryLabel,
      name: raw.name != null ? String(raw.name).trim() : base.name ?? 'Untitled product',
      shortDescription:
        raw.shortDescription != null
          ? String(raw.shortDescription).trim()
          : base.shortDescription ?? '',
      description:
        raw.description != null ? String(raw.description).trim() : base.description ?? '',
      imageUrl: raw.imageUrl != null ? String(raw.imageUrl).trim() : base.imageUrl ?? '',
      images: raw.images != null ? raw.images : base.images,
      basePriceCents:
        raw.basePriceCents != null && Number.isFinite(Number(raw.basePriceCents))
          ? Number(raw.basePriceCents)
          : base.basePriceCents ?? 0,
      priceDisplay:
        raw.priceDisplay != null ? String(raw.priceDisplay).trim() : base.priceDisplay,
      variants,
      badge: raw.badge != null ? String(raw.badge).trim() : base.badge,
      soldOut: raw.soldOut != null ? Boolean(raw.soldOut) : base.soldOut,
      isActive: raw.isActive != null ? Boolean(raw.isActive) : base.isActive !== false,
      sortOrder:
        raw.sortOrder != null && Number.isFinite(Number(raw.sortOrder))
          ? Number(raw.sortOrder)
          : base.sortOrder ?? 0,
    };
  }

  listPublicProducts(): ShopCatalogProduct[] {
    return this.readAll()
      .filter((p) => p.isActive !== false)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  listAdminProducts(): ShopCatalogProduct[] {
    return this.readAll().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  createProduct(input: ShopCatalogProductInput): ShopCatalogProduct {
    const all = this.readAll();
    const next = this.normalizeProduct(input);
    all.push(next);
    this.writeAll(all);
    return next;
  }

  updateProduct(id: string, input: ShopCatalogProductInput): ShopCatalogProduct {
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
    writeFileSync(this.popularFilePath(), JSON.stringify(next, null, 2), 'utf-8');
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
}

