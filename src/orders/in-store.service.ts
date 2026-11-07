import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { evaluateInStoreNow, formatClock, formatYmd } from './pickup-rules';
import { PickupRulesService } from './pickup-rules.service';
import {
  ProductStockService,
  stockKey,
  stockVariant,
  type StockLine,
} from './product-stock.service';

/** Must match ops-queue-web `IN_STORE_EXPEDITE_HEAD`. */
export const IN_STORE_SUMMARY_HEAD = 'In store · prepare now';

export type InStoreLineCheck = {
  productId: string;
  variantLabel: string | null;
  qty: number;
  /** Left on today's shelf; null when the kitchen has not counted this size. */
  left: number | null;
  ok: boolean;
};

export type InStoreQuote = {
  available: boolean;
  /** Why it cannot be ordered, for the checkout to show. */
  reason: string | null;
  today: string;
  /** "3:40 PM" when it can be ordered. */
  readyFrom: string | null;
  /** "Sun 8 Nov" when it is collected on a later day, else null. */
  collectOn: string | null;
  /** Only the lines that are sold from today's kitchen count. */
  lines: InStoreLineCheck[];
};

/**
 * "In-store today": buy from the cakes the kitchen has on the shelf, collected
 * today or, once the shop has shut, on the next open day. A size can only be
 * ordered when the kitchen has a count for it and enough are left after till
 * sales (SalesPlay) and other online orders.
 */
@Injectable()
export class InStoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pickupRules: PickupRulesService,
    private readonly productStock: ProductStockService,
  ) {}

  /** Category of each product in the cart, read from the catalog. */
  async categoriesOf(productIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(productIds)];
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.shopProduct.findMany({
      where: { id: { in: ids } },
      select: { id: true, category: true },
    });
    return new Map(rows.map((r) => [r.id, r.category]));
  }

  /**
   * Which lines must come from today's count: those in an in-store category.
   * Used both for the quote and to refuse uncounted sizes when reserving.
   */
  async countedLinePredicate(
    lines: StockLine[],
  ): Promise<(line: StockLine) => boolean> {
    const rules = await this.pickupRules.getRules();
    const categories = await this.categoriesOf(lines.map((l) => l.productId));
    return (line) =>
      rules.inStore.categories.includes(categories.get(line.productId) ?? '');
  }

  /**
   * When an order placed now is collected, and what staff and the member see
   * on it. Same-day orders lead with the line the ops queue looks for to flag
   * "prepare now". A later collection reads like a pickup, so the queue files
   * it under that day: `scheduledDate` is set for those only.
   */
  async collection(
    now = new Date(),
  ): Promise<{ scheduledDate: string | null; summaryLines: string[] }> {
    const window = evaluateInStoreNow(await this.pickupRules.getRules(), now);
    if (window.collectDate && window.collectDate !== window.today) {
      return {
        scheduledDate: window.collectDate,
        summaryLines: [
          'Self pickup',
          `Date: ${window.collectDate}`,
          `Time: ${window.readyAt}`,
          'From shelf stock',
        ],
      };
    }
    return {
      scheduledDate: null,
      summaryLines: [
        IN_STORE_SUMMARY_HEAD,
        window.readyAt
          ? `Collect today from ${formatClock(window.readyAt)}`
          : 'Collect today',
      ],
    };
  }

  /** Can this cart be ordered for in-store collection right now? */
  async quote(lines: StockLine[], now = new Date()): Promise<InStoreQuote> {
    const rules = await this.pickupRules.getRules();
    const window = evaluateInStoreNow(rules, now);
    const isCounted = await this.countedLinePredicate(lines);

    // The same size can appear on two lines (different add-ons): sum them.
    const needed = new Map<string, StockLine>();
    for (const line of lines.filter(isCounted)) {
      const variantLabel = stockVariant(line.variantLabel);
      const key = stockKey(line.productId, variantLabel);
      const cur = needed.get(key);
      if (cur) cur.qty += line.qty;
      else
        needed.set(key, {
          productId: line.productId,
          variantLabel,
          qty: line.qty,
        });
    }

    const checks: InStoreLineCheck[] = [];
    for (const line of needed.values()) {
      const variant = stockVariant(line.variantLabel);
      const left = await this.productStock.getSellableQty(
        line.productId,
        window.today,
        variant,
      );
      checks.push({
        productId: line.productId,
        variantLabel: variant || null,
        qty: line.qty,
        left,
        ok: left !== null && left >= line.qty,
      });
    }

    let reason = window.reason;
    if (window.open) {
      const short = checks.find((c) => !c.ok);
      if (lines.length === 0) reason = 'Your cart is empty.';
      else if (short) reason = await this.shortReason(short);
    }
    return {
      available: reason === null,
      reason,
      today: window.today,
      readyFrom:
        reason === null && window.readyAt ? formatClock(window.readyAt) : null,
      collectOn:
        reason === null &&
        window.collectDate &&
        window.collectDate !== window.today
          ? formatYmd(window.collectDate)
          : null,
      lines: checks,
    };
  }

  private async shortReason(line: InStoreLineCheck): Promise<string> {
    const product = await this.prisma.shopProduct.findUnique({
      where: { id: line.productId },
      select: { name: true },
    });
    const name = `${product?.name ?? line.productId}${line.variantLabel ? ` (${line.variantLabel})` : ''}`;
    if (line.left === null || line.left === 0) {
      return `${name} isn't on the shelf right now. Pre-order it for another day.`;
    }
    return `Only ${line.left} ${name} left on the shelf.`;
  }
}
