import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { shopCalendarYmd } from '../bento/bento-shop-date.util';
import { PrismaService } from '../prisma/prisma.service';
import { ShopCatalogService } from '../shop-catalog/shop-catalog.service';

export type DayStock = {
  productId: string;
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

/**
 * Per-day kitchen availability.
 *
 * A product is sellable for a date when `qty - reservedQty > 0`. Products with
 * no `product_stock_days` row for that date fall back to the product-level
 * `shop_products.available_qty` (null there = not stock-tracked = unlimited),
 * so nothing has to be back-filled before the kitchen starts using the day
 * grid.
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

  /**
   * Sellable quantity for one product on one date, or `null` when the product
   * is not stock-tracked at all (unlimited).
   */
  async getSellableQty(
    productId: string,
    businessDate: string,
  ): Promise<number | null> {
    const row = await this.prisma.productStockDay.findUnique({
      where: {
        productId_businessDate: {
          productId,
          businessDate: parseBusinessDate(businessDate),
        },
      },
      select: { qty: true, reservedQty: true },
    });
    if (row) return Math.max(0, row.qty - row.reservedQty);
    // No explicit day row — fall back to the product-level count.
    return this.shopCatalog.getAvailableQty(productId);
  }

  /** Sellable quantities for many products on one date, keyed by product id. */
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
      select: { productId: true, qty: true, reservedQty: true },
    });
    for (const r of rows) {
      out.set(r.productId, Math.max(0, r.qty - r.reservedQty));
    }
    for (const id of ids) {
      if (!out.has(id)) out.set(id, await this.shopCatalog.getAvailableQty(id));
    }
    return out;
  }

  /** The kitchen's day grid: one row per product for each date in the range. */
  async listRange(
    productIds: string[],
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
        productId: { in: productIds },
        businessDate: {
          gte: start,
          lte: parseBusinessDate(dates[dates.length - 1]),
        },
      },
    });
    const byKey = new Map(
      rows.map((r) => [
        `${r.productId}|${r.businessDate.toISOString().slice(0, 10)}`,
        r,
      ]),
    );

    const out: DayStock[] = [];
    for (const productId of productIds) {
      const fallback = await this.shopCatalog.getAvailableQty(productId);
      for (const businessDate of dates) {
        const row = byKey.get(`${productId}|${businessDate}`);
        if (row) {
          out.push({
            productId,
            businessDate,
            qty: row.qty,
            reservedQty: row.reservedQty,
            sellableQty: Math.max(0, row.qty - row.reservedQty),
            explicit: true,
            actualQty: row.actualQty,
            varianceQty:
              row.actualQty === null ? null : row.actualQty - row.qty,
          });
        } else {
          out.push({
            productId,
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
    return out;
  }

  /** Kitchen sets the count it can supply for one product on one day. */
  async setQty(
    productId: string,
    businessDate: string,
    qty: number,
  ): Promise<DayStock> {
    const safeQty = Math.max(0, Math.round(qty));
    const date = parseBusinessDate(businessDate);
    const row = await this.prisma.productStockDay.upsert({
      where: { productId_businessDate: { productId, businessDate: date } },
      create: { productId, businessDate: date, qty: safeQty },
      update: { qty: safeQty },
    });
    return {
      productId,
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
   * Reserves stock for a paid order's lines. Creates the day row from the
   * product-level fallback when the kitchen has not set that date yet, so an
   * order never silently oversells an untouched day.
   *
   * Atomic per line: the `reserved_qty + n <= qty` guard means two concurrent
   * checkouts for the last cake cannot both succeed. Returns the product ids
   * that could not be reserved (caller rejects the order).
   */
  async reserveForOrderLines(
    lines: { productId: string; qty: number }[],
    businessDate: string,
    tx: Tx = this.prisma,
  ): Promise<string[]> {
    const date = parseBusinessDate(businessDate);
    const failed: string[] = [];

    for (const line of lines) {
      const qty = Math.max(0, Math.round(line.qty));
      if (qty === 0) continue;

      const fallback = await this.shopCatalog.getAvailableQty(line.productId);
      if (fallback === null) {
        // Not stock-tracked — unlimited, nothing to reserve.
        const existing = await tx.productStockDay.findUnique({
          where: {
            productId_businessDate: {
              productId: line.productId,
              businessDate: date,
            },
          },
          select: { id: true },
        });
        if (!existing) continue;
      }

      // Seed the day from the product-level count on first touch.
      await tx.$executeRaw`
        INSERT INTO product_stock_days (id, product_id, business_date, qty, reserved_qty, created_at, updated_at)
        VALUES (gen_random_uuid(), ${line.productId}, ${date}::date, ${fallback ?? 0}, 0, NOW(), NOW())
        ON CONFLICT (product_id, business_date) DO NOTHING
      `;

      const updated = await tx.$executeRaw`
        UPDATE product_stock_days
        SET reserved_qty = reserved_qty + ${qty}, updated_at = NOW()
        WHERE product_id = ${line.productId}
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
    lines: { productId: string; qty: number }[],
    businessDate: string,
    tx: Tx = this.prisma,
  ): Promise<void> {
    const date = parseBusinessDate(businessDate);
    for (const line of lines) {
      const qty = Math.max(0, Math.round(line.qty));
      if (qty === 0) continue;
      await tx.$executeRaw`
        UPDATE product_stock_days
        SET reserved_qty = GREATEST(0, reserved_qty - ${qty}), updated_at = NOW()
        WHERE product_id = ${line.productId} AND business_date = ${date}::date
      `;
    }
  }

  /**
   * Consumes reserved stock when an order is handed over: both `qty` and
   * `reserved_qty` come down, so the day's remaining count stays correct and
   * the item is not double-counted against a later order.
   */
  async consumeForOrderLines(
    lines: { productId: string; qty: number }[],
    businessDate: string,
    tx: Tx = this.prisma,
  ): Promise<void> {
    const date = parseBusinessDate(businessDate);
    for (const line of lines) {
      const qty = Math.max(0, Math.round(line.qty));
      if (qty === 0) continue;
      await tx.$executeRaw`
        UPDATE product_stock_days
        SET qty = GREATEST(0, qty - ${qty}),
            reserved_qty = GREATEST(0, reserved_qty - ${qty}),
            updated_at = NOW()
        WHERE product_id = ${line.productId} AND business_date = ${date}::date
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
    lines: { productId: string; qty: number }[],
    businessDate: string,
    tx: Tx = this.prisma,
  ): Promise<void> {
    const date = parseBusinessDate(businessDate);
    for (const line of lines) {
      const qty = Math.max(0, Math.round(line.qty));
      if (qty === 0) continue;

      const fallback = await this.shopCatalog.getAvailableQty(line.productId);
      if (fallback === null) {
        // Not stock-tracked — unlimited, nothing to decrement unless the
        // kitchen already set an explicit count for this day.
        const existing = await tx.productStockDay.findUnique({
          where: {
            productId_businessDate: {
              productId: line.productId,
              businessDate: date,
            },
          },
          select: { id: true },
        });
        if (!existing) continue;
      }

      await tx.$executeRaw`
        INSERT INTO product_stock_days (id, product_id, business_date, qty, reserved_qty, created_at, updated_at)
        VALUES (gen_random_uuid(), ${line.productId}, ${date}::date, ${fallback ?? 0}, 0, NOW(), NOW())
        ON CONFLICT (product_id, business_date) DO NOTHING
      `;

      await tx.$executeRaw`
        UPDATE product_stock_days
        SET qty = GREATEST(0, qty - ${qty}), updated_at = NOW()
        WHERE product_id = ${line.productId} AND business_date = ${date}::date
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
    businessDate: string,
    actualQty: number,
  ): Promise<DayStock> {
    const safeActual = Math.max(0, Math.round(actualQty));
    const date = parseBusinessDate(businessDate);
    const fallback = await this.shopCatalog.getAvailableQty(productId);
    const row = await this.prisma.productStockDay.upsert({
      where: { productId_businessDate: { productId, businessDate: date } },
      create: {
        productId,
        businessDate: date,
        qty: fallback ?? 0,
        actualQty: safeActual,
        reconciledAt: new Date(),
      },
      update: { actualQty: safeActual, reconciledAt: new Date() },
    });
    return {
      productId,
      businessDate,
      qty: row.qty,
      reservedQty: row.reservedQty,
      sellableQty: Math.max(0, row.qty - row.reservedQty),
      explicit: true,
      actualQty: row.actualQty,
      varianceQty: row.actualQty === null ? null : row.actualQty - row.qty,
    };
  }
}
