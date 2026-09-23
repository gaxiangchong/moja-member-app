import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { OrderFulfilmentType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ORDER_STATUS } from './order-status';
import { parseBusinessDate } from './product-stock.service';
import {
  DEFAULT_PICKUP_RULES,
  evaluatePickupDay,
  evaluateStoreNow,
  normalizePickupRules,
  PickupRulesError,
  type PickupDayQuote,
  type ShopPickupRules,
} from './pickup-rules';

const SETTINGS_KEY = 'shop_pickup_rules';

type PlaceInput = {
  fulfilmentType: 'IN_STORE' | 'PICKUP' | 'DELIVERY';
  scheduledDate?: string | null;
  scheduledSlot?: string | null;
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

  async quoteDay(date: string, now = new Date()): Promise<PickupDayQuote> {
    const rules = await this.getRules();
    const bookedBySlot = await this.countBooked(date);
    return evaluatePickupDay({ rules, date, now, bookedBySlot });
  }

  /**
   * Rejects a checkout that misses lead time, cut-off, capacity, hours, or
   * a closed day. Capacity takes a transaction lock so two checkouts cannot
   * both claim the last place in a slot.
   */
  async assertCanPlace(
    input: PlaceInput,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const now = input.now ?? new Date();
    if (input.fulfilmentType === 'DELIVERY') {
      throw new BadRequestException({
        code: 'DELIVERY_UNAVAILABLE',
        message: "We don't offer delivery yet. Choose self pickup or in store.",
      });
    }

    const rules = await this.getRules();
    if (input.fulfilmentType === 'IN_STORE') {
      const store = evaluateStoreNow(rules, now);
      if (!store.open) {
        throw new BadRequestException({
          code: 'STORE_CLOSED',
          message: store.reason ?? 'The store is closed.',
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

    const preview = evaluatePickupDay({ rules, date, now });
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
        fulfilmentType: OrderFulfilmentType.PICKUP,
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
