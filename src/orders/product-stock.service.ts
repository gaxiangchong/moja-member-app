import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { shopCalendarYmd } from '../bento/bento-shop-date.util';
import { PrismaService } from '../prisma/prisma.service';
import { ShopCatalogService } from '../shop-catalog/shop-catalog.service';

export type DayStock = {
  productId: string;
  /** Variant label ("6 inch", "8 inch", "Slice"), or "" for the whole product. */
  variant: string;
  /** yyyy-mm-dd in the shop timezone. */
  businessDate: string;
  /** What the kitchen says exists for that day. */
  qty: number;
  /** Spoken for by paid orders. */
  reservedQty: number;
  /** qty − reservedQty, floored at 0. */
  sellableQty: number;
  /** False when the day has no explicit row (falling back to the global count). */
  explicit: boolean;
  /** Kitchen's physical recount for that day, or null before it is submitted. */
  actualQty: number | null;
  /** actualQty − qty (short if negative), or null before a recount is submitted. */
  varianceQty: number | null;
};

/** One order or receipt line as stock sees it. */
export type StockLine = {
  productId: string;
  /** The size bought; null/empty for a product without sizes. */
  variantLabel?: string | null;
  qty: number;
};

type Tx = Prisma.TransactionClient | PrismaService;

/** Parses yyyy-mm-dd into the UTC midnight instant Postgres stores for a DATE. */
export function parseBusinessDate(ymd: string): Date {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid business date: ${ymd}`);
  }
  return d;
}

export function todayBusinessDate(): string {
  return shopCalendarYmd();
}

/** The stock row a line counts against: its size, or "" for the whole product. */
export function stockVariant(label?: string | null): string {
  return (label ?? '').trim();
}

/** Map key for one product size. */
export function stockKey(productId: string, variant: string): string {
  return `${productId}|${variant}`;
}

function toDayStock(
  productId: string,
  variant: string,
  businessDate: string,
  row: { qty: number; reservedQty: number; actualQty: number | null },
): DayStock {
  return {
    productId,
    variant,
    businessDate,
    qty: row.qty,
    reservedQty: row.reservedQty,
    sellableQty: Math.max(0, row.qty - row.reservedQty),
    explicit: true,
    actualQty: row.actualQty,
    varianceQty: row.actualQty === null ? null : row.actualQty - row.qty,
  };
}

/**
 * Per-day kitchen availability, counted per size: a cake's 6 inch, 8 inch and
 * Slice each have their own row (`variant` = the catalog variant label).
 * Products without sizes use `variant = ''`.
 *
 * A size is sellable for a date when `qty - reservedQty > 0`. With no row for
 * that date, the whole-product row ('') falls back to the product-level
 * `shop_products.available_qty`; a size falls back to nothing. Either way
 * `null` means not stock-tracked, which ordinary orders treat as unlimited and
 * in-store-today orders treat as unavailable.
 *
 * All mutations are single atomic statements so concurrent checkouts and
 * kitchen edits cannot lose an update.
 */
@Injectable()
export class ProductStockService {
  private readonly logger = new Logger(ProductStockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopCatalog: ShopCatalogService,
  ) {}

  /** The count to use when a day has no row for this size yet. */
  private async fallbackQty(
    productId: string,
    variant: string,
  ): Promise<number | null> {
    if (variant) return null;
    return this.shopCatalog.getAvailableQty(productId);
  }

  /**
   * Sellable quantity for one size on one date, or `null` when it is not
   * stock-tracked at all.
   */
  async getSellableQty(
    productId: string,
    businessDate: string,
    variant = '',
  ): Promise<number | null> {
    const row = await this.prisma.productStockDay.findUnique({
      where: {
        productId_variant_businessDate: {
          productId,
          variant,
          businessDate: parseBusinessDate(businessDate),
        },
      },
      select: { qty: true, reservedQty: true },
    });
    if (row) return Math.max(0, row.qty - row.reservedQty);
    return this.fallbackQty(productId, variant);
  }

  /**
   * Sellable quantities for many products on one date. Keyed by
   * `stockKey(productId, variant)`: every size with a row, plus the
   * whole-product key ('') for each id (row or product-level fallback).
   */
  async getSellableQtyMap(
    productIds: string[],
    businessDate: string,
  ): Promise<Map<string, number | null>> {
    const ids = [...new Set(productIds)];
    const out = new Map<string, number | null>();
    if (ids.length === 0) return out;

    const rows = await this.prisma.productStockDay.findMany({
      where: {
        productId: { in: ids },
        businessDate: parseBusinessDate(businessDate),
      },
      select: { productId: true, variant: true, qty: true, reservedQty: true },
    });
    for (const r of rows) {
      out.set(
        stockKey(r.productId, r.variant),
        Math.max(0, r.qty - r.reservedQty),
      );
    }
    for (const id of ids) {
      const key = stockKey(id, '');
      if (!out.has(key)) out.set(key, await this.fallbackQty(id, ''));
    }
    return out;
  }

  /**
   * The kitchen's day grid: one row per product size for each date in the
   * range. `products[].variants` lists the sizes; an empty list means the
   * product is counted as a whole.
   */
  async listRange(
    products: { id: string; variants: string[] }[],
    fromDate: string,
    days: number,
  ): Promise<DayStock[]> {
    const dates: string[] = [];
    const start = parseBusinessDate(fromDate);
    for (let i = 0; i < Math.max(1, Math.min(days, 31)); i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }

    const rows = await this.prisma.productStockDay.findMany({
      where: {
        productId: { in: products.map((p) => p.id) },
        businessDate: {
          gte: start,
          lte: parseBusinessDate(dates[dates.length - 1]),
        },
      },
    });
    const byKey = new Map(
      rows.map((r) => [
        `${stockKey(r.productId, r.variant)}|${r.businessDate.toISOString().slice(0, 10)}`,
        r,
      ]),
    );

    const out: DayStock[] = [];
    for (const product of products) {
      const variants = product.variants.length > 0 ? product.variants : [''];
      for (const variant of variants) {
        const fallback = await this.fallbackQty(product.id, variant);
        for (const businessDate of dates) {
          const row = byKey.get(
            `${stockKey(product.id, variant)}|${businessDate}`,
          );
          if (row) {
            out.push(toDayStock(product.id, variant, businessDate, row));
          } else {
            out.push({
              productId: product.id,
              variant,
              businessDate,
              qty: fallback ?? 0,
              reservedQty: 0,
              sellableQty: fallback ?? 0,
              explicit: false,
              actualQty: null,
              varianceQty: null,
            });
          }
        }
      }
    }
    return out;
  }

  /** Kitchen sets the count it can supply for one size on one day. */
  async setQty(
    productId: string,
    variant: string,
    businessDate: string,
    qty: number,
  ): Promise<DayStock> {
    const safeQty = Math.max(0, Math.round(qty));
    const date = parseBusinessDate(businessDate);
    const row = await this.prisma.productStockDay.upsert({
      where: {
        productId_variant_businessDate: {
          productId,
          variant,
          businessDate: date,
        },
      },
      create: { productId, variant, businessDate: date, qty: safeQty },
      update: { qty: safeQty },
    });
    return toDayStock(productId, variant, businessDate, row);
  }

  /** Whether a size has a row for this day, i.e. the kitchen counted it. */
  private async hasRow(
    tx: Tx,
    productId: string,
    variant: string,
    date: Date,
  ): Promise<boolean> {
    const existing = await tx.productStockDay.findUnique({
      where: {
        productId_variant_businessDate: {
          productId,
          variant,
          businessDate: date,
        },
      },
      select: { id: true },
    });
    return existing !== null;
  }

  /**
   * Reserves stock for an order's lines. Creates the day row from the
   * product-level fallback when the kitchen has not set that date yet, so an
   * order never silently oversells an untouched day.
   *
   * Atomic per line: the `reserved_qty + n <= qty` guard means two concurrent
   * checkouts for the last cake cannot both succeed. Returns the product ids
   * that could not be reserved (caller rejects the order).
   *
   * `requireTracked`: a line whose size has no count is refused rather than
   * treated as unlimited (in-store today only sells what the kitchen counted).
   */
  async reserveForOrderLines(
    lines: StockLine[],
    businessDate: string,
    tx: Tx = this.prisma,
    opts: { requireTracked?: (line: StockLine) => boolean } = {},
  ): Promise<string[]> {
    const date = parseBusinessDate(businessDate);
    const failed: string[] = [];

    for (const line of lines) {
      const qty = Math.max(0, Math.round(line.qty));
      if (qty === 0) continue;
      const variant = stockVariant(line.variantLabel);

      const fallback = await this.fallbackQty(line.productId, variant);
      if (
        fallback === null &&
        !(await this.hasRow(tx, line.productId, variant, date))
      ) {
        // Not stock-tracked: unlimited for ordinary orders.
        if (opts.requireTracked?.(line)) failed.push(line.productId);
        continue;
      }

      // Seed the day from the product-level count on first touch.
      await tx.$executeRaw`
        INSERT INTO product_stock_days (id, product_id, variant, business_date, qty, reserved_qty, created_at, updated_at)
        VALUES (gen_random_uuid(), ${line.productId}, ${variant}, ${date}::date, ${fallback ?? 0}, 0, NOW(), NOW())
        ON CONFLICT (product_id, variant, business_date) DO NOTHING
      `;

      const updated = await tx.$executeRaw`
        UPDATE product_stock_days
        SET reserved_qty = reserved_qty + ${qty}, updated_at = NOW()
        WHERE product_id = ${line.productId}
          AND variant = ${variant}
          AND business_date = ${date}::date
          AND reserved_qty + ${qty} <= qty
      `;
      if (updated === 0) failed.push(line.productId);
    }
    return failed;
  }

  /**
   * Gives stock back — a cancelled or refunded order. Clamped at zero so a
   * double release cannot drive the reservation negative.
   */
  async releaseForOrderLines(
    lines: StockLine[],
    businessDate: string,
    tx: Tx = this.prisma,
  ): Promise<void> {
    const date = parseBusinessDate(businessDate);
    for (const line of lines) {
      const qty = Math.max(0, Math.round(line.qty));
      if (qty === 0) continue;
      const variant = stockVariant(line.variantLabel);
      await tx.$executeRaw`
        UPDATE product_stock_days
        SET reserved_qty = GREATEST(0, reserved_qty - ${qty}), updated_at = NOW()
        WHERE product_id = ${line.productId}
          AND variant = ${variant}
          AND business_date = ${date}::date
      `;
    }
  }

  /**
   * Consumes reserved stock when an order is paid: both `qty` and
   * `reserved_qty` come down, so the day's remaining count stays correct and
   * the item is not double-counted against a later order.
   */
  async consumeForOrderLines(
    lines: StockLine[],
    businessDate: string,
    tx: Tx = this.prisma,
  ): Promise<void> {
    const date = parseBusinessDate(businessDate);
    for (const line of lines) {
      const qty = Math.max(0, Math.round(line.qty));
      if (qty === 0) continue;
      const variant = stockVariant(line.variantLabel);
      await tx.$executeRaw`
        UPDATE product_stock_days
        SET qty = GREATEST(0, qty - ${qty}),
            reserved_qty = GREATEST(0, reserved_qty - ${qty}),
            updated_at = NOW()
        WHERE product_id = ${line.productId}
          AND variant = ${variant}
          AND business_date = ${date}::date
      `;
    }
  }

  /**
   * An in-store SalesPlay sale consumes physical stock immediately — unlike
   * an online order it was never reserved first, so only `qty` moves (not
   * `reserved_qty`). Seeds the day from the product-level fallback on first
   * touch, same as `reserveForOrderLines`, so a cake sold in-store before the
   * kitchen has touched the day grid still shows up as sold, not lost.
   * Clamped at zero: a receipt that arrives after the kitchen already zeroed
   * the day (e.g. backfill/reconcile replay) cannot drive stock negative.
   */
  async decrementForPosSale(
    lines: StockLine[],
    businessDate: string,
    tx: Tx = this.prisma,
  ): Promise<void> {
    const date = parseBusinessDate(businessDate);
    for (const line of lines) {
      const qty = Math.max(0, Math.round(line.qty));
      if (qty === 0) continue;
      const variant = stockVariant(line.variantLabel);

      const fallback = await this.fallbackQty(line.productId, variant);
      if (
        fallback === null &&
        !(await this.hasRow(tx, line.productId, variant, date))
      ) {
        // Not stock-tracked — nothing to decrement unless the kitchen
        // already set an explicit count for this day.
        continue;
      }

      await tx.$executeRaw`
        INSERT INTO product_stock_days (id, product_id, variant, business_date, qty, reserved_qty, created_at, updated_at)
        VALUES (gen_random_uuid(), ${line.productId}, ${variant}, ${date}::date, ${fallback ?? 0}, 0, NOW(), NOW())
        ON CONFLICT (product_id, variant, business_date) DO NOTHING
      `;

      await tx.$executeRaw`
        UPDATE product_stock_days
        SET qty = GREATEST(0, qty - ${qty}), updated_at = NOW()
        WHERE product_id = ${line.productId}
          AND variant = ${variant}
          AND business_date = ${date}::date
      `;
    }
  }

  /**
   * A till sale that was fully refunded the same day puts its cakes back on
   * the shelf. Only rows the kitchen counted are touched.
   */
  async restockForPosRefund(
    lines: StockLine[],
    businessDate: string,
    tx: Tx = this.prisma,
  ): Promise<void> {
    const date = parseBusinessDate(businessDate);
    for (const line of lines) {
      const qty = Math.max(0, Math.round(line.qty));
      if (qty === 0) continue;
      const variant = stockVariant(line.variantLabel);
      await tx.$executeRaw`
        UPDATE product_stock_days
        SET qty = qty + ${qty}, updated_at = NOW()
        WHERE product_id = ${line.productId}
          AND variant = ${variant}
          AND business_date = ${date}::date
      `;
    }
  }

  /**
   * Kitchen's end-of-day physical recount (Phase 3 nightly reconcile).
   * `varianceQty` = actual − system qty: negative means fewer cakes were
   * found than the ledger expects (shrinkage/miscount/unlogged giveaway),
   * positive means more (e.g. a POS sale that never made it to the webhook).
   * Does not touch `qty` itself — reconcile is a report, not a correction;
   * an operator adjusts the day count separately via `setQty` if needed.
   */
  async setActualQty(
    productId: string,
    variant: string,
    businessDate: string,
    actualQty: number,
  ): Promise<DayStock> {
    const safeActual = Math.max(0, Math.round(actualQty));
    const date = parseBusinessDate(businessDate);
    const fallback = await this.fallbackQty(productId, variant);
    const row = await this.prisma.productStockDay.upsert({
      where: {
        productId_variant_businessDate: {
          productId,
          variant,
          businessDate: date,
        },
      },
      create: {
        productId,
        variant,
        businessDate: date,
        qty: fallback ?? 0,
        actualQty: safeActual,
        reconciledAt: new Date(),
      },
      update: { actualQty: safeActual, reconciledAt: new Date() },
    });
    return toDayStock(productId, variant, businessDate, row);
  }
}
