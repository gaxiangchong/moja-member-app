import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BentoDeliveryStatus,
  BentoDinnerVariant,
  BentoRiceType,
  BentoSubscriptionStatus,
  Prisma,
} from '@prisma/client';
import { shopCalendarYmd } from '../bento/bento-shop-date.util';
import { parseDateOnly } from '../bento/bento-weekly.util';
import { parseKitchenPickupCodeInput } from '../customers/kitchen-pickup-code.util';
import { PrismaService } from '../prisma/prisma.service';
import { ReportingSettingsService } from '../admin/reporting-settings.service';

function fulfillmentLines(raw: Prisma.JsonValue | null): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === 'string');
  }
  return [];
}

function maskPhone(phone: string | null | undefined): string {
  const p = (phone ?? '').trim();
  if (p.length < 5) return p || '—';
  return `···${p.slice(-4)}`;
}

type BentoPackSummary = {
  totalPacks: number;
  lunchCount: number;
  dinnerCount: number;
  regular: number;
  vegetarian: number;
  regularBrown: number;
  vegetarianBrown: number;
  withDrink: number;
};

function categorizePack(
  variant: BentoDinnerVariant,
  riceType: BentoRiceType,
): keyof Pick<
  BentoPackSummary,
  'regular' | 'vegetarian' | 'regularBrown' | 'vegetarianBrown'
> {
  const veg = variant === 'VEG';
  const brown = riceType === 'BROWN';
  if (veg && brown) return 'vegetarianBrown';
  if (veg) return 'vegetarian';
  if (brown) return 'regularBrown';
  return 'regular';
}

function emptyBentoPackSummary(): BentoPackSummary {
  return {
    totalPacks: 0,
    lunchCount: 0,
    dinnerCount: 0,
    regular: 0,
    vegetarian: 0,
    regularBrown: 0,
    vegetarianBrown: 0,
    withDrink: 0,
  };
}

@Injectable()
export class OpsQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportingSettings: ReportingSettingsService,
  ) {}

  async listOrders() {
    const [pending, history] = await Promise.all([
      this.prisma.customerOrder.findMany({
        where: { status: 'placed' },
        orderBy: { placedAt: 'asc' },
        take: 80,
        include: {
          customer: {
            select: { phoneE164: true, displayName: true },
          },
          lines: { orderBy: { id: 'asc' } },
        },
      }),
      this.prisma.customerOrder.findMany({
        where: { status: 'completed' },
        orderBy: { completedAt: 'desc' },
        take: 80,
        include: {
          customer: {
            select: { phoneE164: true, displayName: true },
          },
          lines: { orderBy: { id: 'asc' } },
        },
      }),
    ]);

    const mapRow = (o: (typeof pending)[number]) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      placedAt: o.placedAt.toISOString(),
      completedAt: o.completedAt?.toISOString() ?? null,
      totalCents: o.totalCents,
      status: o.status,
      fulfillmentSummary: fulfillmentLines(o.fulfillmentSummary),
      customerDisplayName: o.customer.displayName,
      customerPhoneMasked: maskPhone(o.customer.phoneE164),
      lineCount: o.lines.length,
      lines: o.lines.map((l) => ({
        id: l.id,
        productId: l.productId,
        name: l.name,
        variantLabel: l.variantLabel,
        unitPriceCents: l.unitPriceCents,
        qty: l.qty,
      })),
    });

    return {
      pending: pending.map(mapRow),
      history: history.map(mapRow),
    };
  }

  async getOrder(id: string) {
    const o = await this.prisma.customerOrder.findUnique({
      where: { id },
      include: {
        customer: {
          select: { phoneE164: true, displayName: true, id: true },
        },
        lines: { orderBy: { id: 'asc' } },
      },
    });
    if (!o) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found',
      });
    }
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      placedAt: o.placedAt.toISOString(),
      completedAt: o.completedAt?.toISOString() ?? null,
      totalCents: o.totalCents,
      status: o.status,
      fulfillmentSummary: fulfillmentLines(o.fulfillmentSummary),
      customer: {
        id: o.customer.id,
        displayName: o.customer.displayName,
        phoneE164: o.customer.phoneE164,
      },
      lines: o.lines.map((l) => ({
        id: l.id,
        productId: l.productId,
        name: l.name,
        variantLabel: l.variantLabel,
        unitPriceCents: l.unitPriceCents,
        qty: l.qty,
        imageUrl: l.imageUrl,
      })),
    };
  }

  async completeOrder(id: string) {
    const existing = await this.prisma.customerOrder.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found',
      });
    }
    if (existing.status !== 'placed') {
      throw new BadRequestException({
        code: 'ORDER_NOT_ACTIVE',
        message: 'Order is not in the active queue',
      });
    }
    return this.prisma.customerOrder.update({
      where: { id },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
      include: {
        customer: {
          select: { phoneE164: true, displayName: true },
        },
        lines: true,
      },
    });
  }

  async completeOrderByNumber(orderNumber: number) {
    const row = await this.prisma.customerOrder.findUnique({
      where: { orderNumber },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found for this order number',
      });
    }
    return this.completeOrder(row.id);
  }

  private resolveKitchenPickupCode(raw: string): string {
    const code = parseKitchenPickupCodeInput(raw);
    if (!code) {
      throw new BadRequestException({
        code: 'INVALID_PICKUP_CODE',
        message: 'Enter a 6-digit pickup code or scan BENTO:<code>',
      });
    }
    return code;
  }

  private async findCustomerByKitchenPickupCode(code: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { kitchenPickupCode: code },
      select: {
        id: true,
        displayName: true,
        phoneE164: true,
        kitchenPickupCode: true,
      },
    });
    if (!customer?.kitchenPickupCode) {
      throw new NotFoundException({
        code: 'BENTO_MEMBER_NOT_FOUND',
        message: 'No member found for this pickup code',
      });
    }
    return customer;
  }

  private async loadTodayBentoDeliveries(customerId: string, deliveryDateIso: string) {
    const deliveryDate = parseDateOnly(deliveryDateIso);
    return this.prisma.bentoDeliveryDay.findMany({
      where: {
        deliveryDate,
        subscription: {
          customerId,
          status: {
            in: [
              BentoSubscriptionStatus.ACTIVE,
              BentoSubscriptionStatus.COMPLETED,
            ],
          },
          // Exclude pre-launch test orders (sales reporting start date).
          ...this.reportingSettings.createdAtCutoffWhere(),
        },
      },
      select: {
        id: true,
        status: true,
        includesLunch: true,
        includesDinner: true,
        subscription: {
          select: {
            lunchVariant: true,
            dinnerVariant: true,
            riceType: true,
            includeDrinkAddon: true,
            package: {
              select: { includeFreeSoupAndDrinks: true },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
    });
  }

  private summarizeBentoDeliveries(
    rows: Awaited<ReturnType<OpsQueueService['loadTodayBentoDeliveries']>>,
  ): BentoPackSummary {
    const summary = emptyBentoPackSummary();
    for (const row of rows) {
      if (row.status === BentoDeliveryStatus.SKIPPED) continue;
      const sub = row.subscription;
      const hasDrink =
        sub.includeDrinkAddon || sub.package.includeFreeSoupAndDrinks;
      let dayHasMeal = false;

      const addMeal = (meal: 'lunch' | 'dinner', variant: BentoDinnerVariant) => {
        const category = categorizePack(variant, sub.riceType);
        summary.totalPacks += 1;
        dayHasMeal = true;
        if (meal === 'lunch') summary.lunchCount += 1;
        else summary.dinnerCount += 1;
        summary[category] += 1;
      };

      if (row.includesLunch) addMeal('lunch', sub.lunchVariant);
      if (row.includesDinner) addMeal('dinner', sub.dinnerVariant);
      if (dayHasMeal && hasDrink) summary.withDrink += 1;
    }
    return summary;
  }

  async lookupBentoPickup(rawCode: string) {
    const code = this.resolveKitchenPickupCode(rawCode);
    const customer = await this.findCustomerByKitchenPickupCode(code);
    const deliveryDate = shopCalendarYmd();
    const deliveries = await this.loadTodayBentoDeliveries(customer.id, deliveryDate);
    const scheduled = deliveries.filter(
      (d) => d.status === BentoDeliveryStatus.SCHEDULED,
    );
    const delivered = deliveries.filter(
      (d) => d.status === BentoDeliveryStatus.DELIVERED,
    );
    const summary = this.summarizeBentoDeliveries(
      scheduled.length > 0 ? scheduled : delivered,
    );

    return {
      pickupCode: customer.kitchenPickupCode,
      deliveryDate,
      customerDisplayName: customer.displayName,
      customerPhoneMasked: maskPhone(customer.phoneE164),
      summary,
      pendingCount: scheduled.length,
      alreadyCollected: scheduled.length === 0 && delivered.length > 0,
      nothingScheduled: deliveries.length === 0,
      deliveries: deliveries.map((d) => ({
        id: d.id,
        status: d.status,
        includesLunch: d.includesLunch,
        includesDinner: d.includesDinner,
      })),
    };
  }

  async collectBentoPickup(rawCode: string) {
    const code = this.resolveKitchenPickupCode(rawCode);
    const customer = await this.findCustomerByKitchenPickupCode(code);
    const deliveryDate = shopCalendarYmd();
    const deliveryDateValue = parseDateOnly(deliveryDate);
    const pending = await this.prisma.bentoDeliveryDay.findMany({
      where: {
        deliveryDate: deliveryDateValue,
        status: BentoDeliveryStatus.SCHEDULED,
        subscription: {
          customerId: customer.id,
          status: {
            in: [
              BentoSubscriptionStatus.ACTIVE,
              BentoSubscriptionStatus.COMPLETED,
            ],
          },
          // Exclude pre-launch test orders (sales reporting start date).
          ...this.reportingSettings.createdAtCutoffWhere(),
        },
      },
      select: { id: true },
    });

    if (pending.length === 0) {
      const anyToday = await this.prisma.bentoDeliveryDay.count({
        where: {
          deliveryDate: deliveryDateValue,
          subscription: {
            customerId: customer.id,
            // Exclude pre-launch test orders (sales reporting start date).
            ...this.reportingSettings.createdAtCutoffWhere(),
          },
        },
      });
      if (anyToday === 0) {
        throw new BadRequestException({
          code: 'BENTO_NOTHING_SCHEDULED',
          message: 'No bento pickup scheduled for today',
        });
      }
      throw new BadRequestException({
        code: 'BENTO_ALREADY_COLLECTED',
        message: 'Today’s bento packs were already collected',
      });
    }

    await this.prisma.bentoDeliveryDay.updateMany({
      where: { id: { in: pending.map((d) => d.id) } },
      data: { status: BentoDeliveryStatus.DELIVERED },
    });

    return {
      pickupCode: customer.kitchenPickupCode,
      deliveryDate,
      collectedCount: pending.length,
      status: 'collected' as const,
    };
  }
}
