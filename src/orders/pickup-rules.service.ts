import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { OrderFulfilmentType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ORDER_STATUS } from './order-status';
import { parseBusinessDate } from './product-stock.service';
import {
  addDaysYmd,
  DEFAULT_PICKUP_RULES,
  evaluatePickupDay,
  evaluateInStoreNow,
  formatClock,
  needsPreorder,
  normalizePickupRules,
  PickupRulesError,
  zonedParts,
  type PickupDayQuote,
  type ShopPickupRules,
} from './pickup-rules';

const SETTINGS_KEY = 'shop_pickup_rules';

/**
 * The two sides of the shop page's availability split, as the member app reads
 * them. Everything here comes from the admin's Pickup Rules, so changing the
 * notice from 2 days to 3 changes the badges with no deploy.
 */
export type ShopAvailabilityRules = {
  /** yyyy-mm-dd in the shop timezone. */
  today: string;
  timeZone: string;
  preorder: {
    days: number;
    categories: string[];
    earliestDate: string;
  };
  inStore: {
    enabled: boolean;
    categories: string[];
    openNow: boolean;
    /** Why in-store is shut, for the empty state. Null while it is open. */
    reason: string | null;
    /** "3:40 PM" while open, else null. */
    readyFrom: string | null;
  };
};

type PlaceInput = {
  fulfilmentType: 'IN_STORE' | 'PICKUP' | 'DELIVERY';
  scheduledDate?: string | null;
  scheduledSlot?: string | null;
  /** Product categories in the order; some need days of notice. */
  categories?: readonly string[];
  now?: Date;
};

/**
 * Pickup windows stored in `app_settings`, enforced when a shop order is created.
 */
@Injectable()
export class PickupRulesService {
  private readonly logger = new Logger(PickupRulesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getRules(): Promise<ShopPickupRules> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: SETTINGS_KEY },
    });
    if (!row) return structuredClone(DEFAULT_PICKUP_RULES);
    try {
      return normalizePickupRules(row.value);
    } catch (err) {
      this.logger.error(
        `shop_pickup_rules is invalid and was ignored: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return structuredClone(DEFAULT_PICKUP_RULES);
    }
  }

  async setRules(input: unknown): Promise<ShopPickupRules> {
    let next: ShopPickupRules;
    try {
      next = normalizePickupRules(input);
    } catch (err) {
      throw new BadRequestException({
        code: 'PICKUP_RULES_INVALID',
        message:
          err instanceof PickupRulesError
            ? err.message
            : 'Pickup rules are invalid.',
      });
    }
    await this.prisma.appSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: {
        key: SETTINGS_KEY,
        value: next as unknown as Prisma.InputJsonValue,
      },
      update: { value: next as unknown as Prisma.InputJsonValue },
    });
    return next;
  }

  /**
   * What the shop page needs to split the catalog into "in store today" and
   * "pre-order": which categories fall on each side, whether in-store is open
   * right now, and the earliest date a pre-order can be collected.
   *
   * Public and cartless — the member app calls it once per visit, before
   * anything is in the basket. The counts and badges it draws are display only;
   * placing the order re-checks hours, notice and stock.
   */
  async availabilityRules(now = new Date()): Promise<ShopAvailabilityRules> {
    const rules = await this.getRules();
    const inStoreNow = evaluateInStoreNow(rules, now);
    const today = zonedParts(now, rules.timeZone).ymd;
    return {
      today,
      timeZone: rules.timeZone,
      preorder: {
        days: rules.preorderDays,
        categories: [...rules.preorderCategories],
        // The same floor `assertCanPlace` enforces, so the badge cannot promise
        // a date the checkout would then refuse.
        earliestDate: addDaysYmd(today, rules.preorderDays),
      },
      inStore: {
        enabled: rules.inStore.enabled,
        categories: [...rules.inStore.categories],
        openNow: inStoreNow.open,
        reason: inStoreNow.reason,
        readyFrom: inStoreNow.readyAt ? formatClock(inStoreNow.readyAt) : null,
      },
    };
  }

  /** `categories`: the product categories in the cart, for the pre-order notice. */
  async quoteDay(
    date: string,
    categories: readonly string[] = [],
    now = new Date(),
  ): Promise<PickupDayQuote> {
    const rules = await this.getRules();
    const bookedBySlot = await this.countBooked(date);
    return evaluatePickupDay({
      rules,
      date,
      now,
      bookedBySlot,
      preorder: needsPreorder(rules, categories),
    });
  }

  /**
   * Rejects a checkout that misses lead time, pre-order notice, cut-off,
   * capacity, hours, or a closed day. Capacity takes a transaction lock so two checkouts cannot
   * both claim the last place in a slot.
   */
  async assertCanPlace(
    input: PlaceInput,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const now = input.now ?? new Date();
    const rules = await this.getRules();
    if (input.fulfilmentType === 'IN_STORE') {
      // Collected today from the shelf: no slot and no pre-order notice. Stock
      // per size is checked when it is reserved.
      const window = evaluateInStoreNow(rules, now);
      if (!window.open) {
        throw new BadRequestException({
          code: 'IN_STORE_CLOSED',
          message: window.reason ?? 'In-store orders are closed.',
        });
      }
      return;
    }

    const date = input.scheduledDate?.trim() ?? '';
    const slotStart = input.scheduledSlot?.trim() ?? '';
    if (!date || !slotStart) {
      throw new BadRequestException({
        code: 'PICKUP_SLOT_REQUIRED',
        message: 'Select a pickup date and time.',
      });
    }

    const preview = evaluatePickupDay({
      rules,
      date,
      now,
      preorder: needsPreorder(rules, input.categories ?? []),
    });
    if (preview.closed) {
      throw new BadRequestException({
        code: 'PICKUP_DATE_CLOSED',
        message: preview.closedReason ?? 'That pickup date is not available.',
      });
    }
    const slotRule = rules.slots.find((slot) => slot.start === slotStart);
    const offered = preview.slots.find((slot) => slot.start === slotStart);
    if (!slotRule || !offered) {
      throw new BadRequestException({
        code: 'PICKUP_SLOT_UNAVAILABLE',
        message: 'That pickup time is not offered on this day.',
      });
    }
    if (!offered.available) {
      throw new BadRequestException({
        code: 'PICKUP_SLOT_UNAVAILABLE',
        message: offered.reason ?? 'That pickup time is not available.',
      });
    }

    if (slotRule.capacity == null) return;

    const lockKey = `shop-pickup:${date}:${slotStart}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`;
    const booked = await this.countBooked(date, tx);
    const taken = booked[slotStart] ?? 0;
    if (taken >= slotRule.capacity) {
      throw new BadRequestException({
        code: 'PICKUP_SLOT_FULL',
        message: 'This slot is full. Please choose another time.',
      });
    }
  }

  private async countBooked(
    date: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Record<string, number>> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return {};
    const rows = await tx.customerOrder.groupBy({
      by: ['scheduledSlot'],
      where: {
        // A courier collecting a delivery takes the same kitchen slot as a customer.
        fulfilmentType: {
          in: [OrderFulfilmentType.PICKUP, OrderFulfilmentType.DELIVERY],
        },
        scheduledDate: parseBusinessDate(date),
        scheduledSlot: { not: null },
        status: {
          notIn: [ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED],
        },
      },
      _count: { _all: true },
    });
    const booked: Record<string, number> = {};
    for (const row of rows) {
      if (row.scheduledSlot) booked[row.scheduledSlot] = row._count._all;
    }
    return booked;
  }
}
