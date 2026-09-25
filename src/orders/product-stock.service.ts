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
 * The stock day an order holds.
 *
 * Scheduled pickup and delivery store that calendar date. In-store orders
 * leave `scheduledDate` null and hold the shop day they were placed — the
 * same day payment consumes. A later cancel has to use this day. Using
 * "today" after midnight restores a different row and leaves the original
 * day's cake unsellable, or inflates the next day's count.
 */
export function stockBusinessDateForOrder(order: {
  scheduledDate: Date | null;
  placedAt: Date;
}): string {
  if (order.scheduledDate) {
    return order.scheduledDate.toISOString().slice(0, 10);
  }
  return shopCalendarYmd(order.placedAt);
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
          });
        } else {
          out.push({
            productId,
            businessDate,
            qty: fallback ?? 0,
            reservedQty: 0,
            sellableQty: fallback ?? 0,
            explicit: false,
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
   * Drops an unpaid checkout hold. Only `reserved_qty` moves; `qty` stays.
   * A paid order has already been consumed, so cancelling that must call
   * `restoreConsumedForOrderLines` instead — releasing the reservation again
   * does not put the cake back on sale.
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
   * Puts a paid order's quantity back when it is cancelled before handover.
   * Payment already consumed the reservation (`qty` and `reserved_qty` both
   * down), so this adds `qty` back and leaves `reserved_qty` alone.
   */
  async restoreConsumedForOrderLines(
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
        SET qty = qty + ${qty}, updated_at = NOW()
        WHERE product_id = ${line.productId} AND business_date = ${date}::date
      `;
    }
  }

  /**
   * Converts a checkout reservation into a sale when payment succeeds.
   * Both `qty` and `reserved_qty` come down, so the day's remaining count
   * stays correct and the item is not held against a later order.
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
}
