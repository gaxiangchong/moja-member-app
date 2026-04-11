import { Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export type ShopCatalogProduct = {
  id: string;
  category: 'whole_cakes' | 'cake_slices' | 'drinks' | 'specials';
  name: string;
  shortDescription: string;
  description: string;
  imageUrl: string;
  basePriceCents: number;
  variants?: Array<{ id: string; label: string; priceCents: number }>;
  isActive: boolean;
  sortOrder: number;
};

const DEFAULT_PRODUCTS: ShopCatalogProduct[] = [
  {
    id: 'wc-basque',
    category: 'whole_cakes',
    name: 'Burnt Basque Cheesecake',
    shortDescription: 'Caramelised top, creamy center',
    description: 'Signature whole cake, rich cream cheese with a deep caramelized top.',
    imageUrl:
      'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=800&q=80',
    basePriceCents: 18800,
    variants: [
      { id: 'wc-basque-6', label: '6"', priceCents: 14800 },
      { id: 'wc-basque-8', label: '8"', priceCents: 18800 },
    ],
    isActive: true,
    sortOrder: 10,
  },
  {
    id: 'cs-redvelvet',
    category: 'cake_slices',
    name: 'Red Velvet Slice',
    shortDescription: 'Classic with cream cheese frosting',
    description: 'Moist cocoa-buttermilk layers with whipped cream cheese frosting.',
    imageUrl:
      'https://images.unsplash.com/photo-1586985289686-ca1b91c2db5b?auto=format&fit=crop&w=800&q=80',
    basePriceCents: 1900,
    isActive: true,
    sortOrder: 20,
  },
  {
    id: 'dr-coldbrew',
    category: 'drinks',
    name: 'Oat Cold Brew',
    shortDescription: 'Slow-steeped, smooth',
    description: '16oz cold brew with oat milk.',
    imageUrl:
      'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=800&q=80',
    basePriceCents: 1450,
    isActive: true,
    sortOrder: 30,
  },
];

@Injectable()
export class ShopCatalogService {
  private filePath(): string {
    return resolve(process.cwd(), 'data', 'shop-catalog.products.json');
  }

  private ensureFile(): void {
    const p = this.filePath();
    if (existsSync(p)) return;
    mkdirSync(resolve(process.cwd(), 'data'), { recursive: true });
    writeFileSync(p, JSON.stringify(DEFAULT_PRODUCTS, null, 2), 'utf-8');
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

  listPublicProducts(): ShopCatalogProduct[] {
    return this.readAll()
      .filter((p) => p.isActive !== false)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  listAdminProducts(): ShopCatalogProduct[] {
    return this.readAll().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  createProduct(input: Partial<ShopCatalogProduct>): ShopCatalogProduct {
    const all = this.readAll();
    const next: ShopCatalogProduct = {
      id: input.id?.trim() || randomUUID(),
      category: (input.category as ShopCatalogProduct['category']) || 'specials',
      name: input.name?.trim() || 'Untitled product',
      shortDescription: input.shortDescription?.trim() || '',
      description: input.description?.trim() || '',
      imageUrl: input.imageUrl?.trim() || '',
      basePriceCents: Number.isFinite(input.basePriceCents) ? Number(input.basePriceCents) : 0,
      variants: Array.isArray(input.variants) ? input.variants : undefined,
      isActive: input.isActive !== false,
      sortOrder: Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : 0,
    };
    all.push(next);
    this.writeAll(all);
    return next;
  }

  updateProduct(id: string, input: Partial<ShopCatalogProduct>): ShopCatalogProduct {
    const all = this.readAll();
    const idx = all.findIndex((p) => p.id === id);
    if (idx < 0) throw new NotFoundException('Shop catalog product not found');
    const cur = all[idx];
    const next: ShopCatalogProduct = {
      ...cur,
      id: cur.id,
      category:
        input.category != null
          ? (input.category as ShopCatalogProduct['category'])
          : cur.category,
      name: input.name != null ? String(input.name).trim() : cur.name,
      shortDescription:
        input.shortDescription != null
          ? String(input.shortDescription).trim()
          : cur.shortDescription,
      description:
        input.description != null ? String(input.description).trim() : cur.description,
      imageUrl: input.imageUrl != null ? String(input.imageUrl).trim() : cur.imageUrl,
      basePriceCents:
        input.basePriceCents != null && Number.isFinite(Number(input.basePriceCents))
          ? Number(input.basePriceCents)
          : cur.basePriceCents,
      sortOrder:
        input.sortOrder != null && Number.isFinite(Number(input.sortOrder))
          ? Number(input.sortOrder)
          : cur.sortOrder,
      isActive: input.isActive != null ? Boolean(input.isActive) : cur.isActive,
      variants: input.variants != null ? input.variants : cur.variants,
    };
    all[idx] = next;
    this.writeAll(all);
    return next;
  }
}

