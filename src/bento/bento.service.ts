import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  BentoDeliveryStatus,
  BentoMealOption,
  BentoPackageCode,
  BentoSubscriptionStatus,
  type BentoPackage,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { BentoMenuService } from './bento-menu.service';
import { BentoSettingsService } from './bento-settings.service';
import { BentoFeaturesService } from './bento-features.service';
import { packsInDeliveryRow } from './bento-capacity.util';
import {
  buildRemainingByDate,
  evaluatePurchaseCapacity,
  type PurchaseCapacityEvaluation,
} from './bento-purchase-capacity.util';
import {
  isPickupDateLocked,
  pickupLockMessage,
} from './bento-pickup-lock.util';
import {
  quoteBentoCheckout,
  splitMealCredits,
  type BentoQuoteResult,
} from './bento-pricing.service';
import { BENTO_MENU } from './bento-menu.constants';
import { BENTO_MIN_SCHEDULE_LEAD_DAYS } from './bento-schedule.constants';
import {
  addDaysUtc,
  buildWeeklyMenu,
  formatDateOnly,
  parseDateOnly as parseDateOnlyUtil,
  weekStartMondayIso,
} from './bento-weekly.util';
import type {
  BentoCheckoutDto,
  BentoQuoteDto,
  BentoScheduleDto,
  BentoScheduleSlotDto,
  BentoWeeklyOptInDto,
} from './dto/bento-subscription.dto';

export { BENTO_MENU };

const PACKAGE_SEED: Array<{
  code: BentoPackageCode;
  label: string;
  durationDays: number;
  mealCredits: number;
  pricePerMealCents: number;
  fixedCheckoutCents?: number;
  includeFreeSoupAndDrinks?: boolean;
  isActive?: boolean;
}> = [
  {
    code: BentoPackageCode.NEWCOMER_3,
    label: 'Trial pack — 3 lunches',
    durationDays: 14,
    mealCredits: 3,
    pricePerMealCents: 1300,
    fixedCheckoutCents: 3900,
  },
  {
    code: BentoPackageCode.ONE_TIME,
    label: '1 meal',
    durationDays: 7,
    mealCredits: 1,
    pricePerMealCents: 1800,
    isActive: false,
  },
  {
    code: BentoPackageCode.DAYS_7,
    label: '10 meals',
    durationDays: 30,
    mealCredits: 10,
    pricePerMealCents: 1600,
  },
  {
    code: BentoPackageCode.DAYS_15,
    label: '20 meals',
    durationDays: 45,
    mealCredits: 20,
    pricePerMealCents: 1500,
  },
  {
    code: BentoPackageCode.DAYS_30,
    label: '30 meals',
    durationDays: 60,
    mealCredits: 30,
    pricePerMealCents: 1300,
  },
  {
    code: BentoPackageCode.DAYS_60,
    label: '60 meals',
    durationDays: 60,
    mealCredits: 60,
    pricePerMealCents: 1300,
    includeFreeSoupAndDrinks: true,
    isActive: false,
  },
];

@Injectable()
export class BentoService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly bentoMenu: BentoMenuService,
    private readonly bentoSettings: BentoSettingsService,
    private readonly bentoFeatures: BentoFeaturesService,
  ) {}

  async onModuleInit() {
    await this.seedPackages();
  }

  async seedPackages(): Promise<void> {
    for (const pkg of PACKAGE_SEED) {
      await this.prisma.bentoPackage.upsert({
        where: { code: pkg.code },
        create: {
          code: pkg.code,
          label: pkg.label,
          durationDays: pkg.durationDays,
          mealCredits: pkg.mealCredits,
          pricePerMealCents: pkg.pricePerMealCents,
          fixedCheckoutCents: pkg.fixedCheckoutCents ?? null,
          includeFreeSoupAndDrinks: pkg.includeFreeSoupAndDrinks ?? false,
          isActive: pkg.isActive ?? true,
        },
        update: {
          label: pkg.label,
          durationDays: pkg.durationDays,
          mealCredits: pkg.mealCredits,
          pricePerMealCents: pkg.pricePerMealCents,
          fixedCheckoutCents: pkg.fixedCheckoutCents ?? null,
          includeFreeSoupAndDrinks: pkg.includeFreeSoupAndDrinks ?? false,
          isActive: pkg.isActive ?? true,
        },
      });
    }
  }

  async isNewcomerEligible(customerId: string): Promise<boolean> {
    const [priorPurchases, priorTrial] = await Promise.all([
      this.prisma.bentoSubscription.count({
        where: {
          customerId,
          status: {
            in: [
              BentoSubscriptionStatus.ACTIVE,
              BentoSubscriptionStatus.COMPLETED,
            ],
          },
        },
      }),
      this.prisma.bentoSubscription.count({
        where: {
          customerId,
          package: { code: BentoPackageCode.NEWCOMER_3 },
          status: {
            in: [
              BentoSubscriptionStatus.PENDING_PAYMENT,
              BentoSubscriptionStatus.ACTIVE,
              BentoSubscriptionStatus.COMPLETED,
            ],
          },
        },
      }),
    ]);
    return priorPurchases === 0 && priorTrial === 0;
  }

  async listPackages(customerId: string | null) {
    const rows = await this.prisma.bentoPackage.findMany({
      where: { isActive: true },
      orderBy: { mealCredits: 'asc' },
    });
    const newcomerEligible =
      customerId != null ? await this.isNewcomerEligible(customerId) : false;
    const packages = rows
      .filter(
        (p) =>
          p.code !== BentoPackageCode.NEWCOMER_3 || newcomerEligible,
      )
      .map((p) => this.mapPackage(p))
      .sort((a, b) => {
        if (a.isNewcomer) return -1;
        if (b.isNewcomer) return 1;
        return a.mealCredits - b.mealCredits;
      });

    return {
      newcomerEligible,
      packages,
      features: {
        drinksAndSoupEnabled: this.bentoFeatures.drinksAndSoupEnabled(),
      },
    };
  }

  getMenu() {
    if (this.bentoFeatures.drinksAndSoupEnabled()) {
      return BENTO_MENU;
    }
    return {
      lunch: BENTO_MENU.lunch,
      dinner: {
        ...BENTO_MENU.dinner,
        description: 'Main dish, side, and rice.',
      },
      rice: BENTO_MENU.rice,
    };
  }

  getWeeklyMenu() {
    return buildWeeklyMenu(this.bentoMenu.getConfig());
  }

  async getScheduleCapacity(fromIso?: string, toIso?: string) {
    const from = fromIso ? parseDateOnly(fromIso) : earliestSchedulableDate();
    const to = toIso ? parseDateOnly(toIso) : addDaysUtc(from, 120);
    if (to < from) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: '"to" must be on or after "from".',
      });
    }

    const capacity = this.bentoSettings.getDailyCapacityPacks();
    const deliveries = await this.prisma.bentoDeliveryDay.findMany({
      where: {
        deliveryDate: { gte: from, lte: to },
        status: BentoDeliveryStatus.SCHEDULED,
        subscription: {
          status: {
            in: [
              BentoSubscriptionStatus.ACTIVE,
              BentoSubscriptionStatus.COMPLETED,
            ],
          },
        },
      },
      select: {
        deliveryDate: true,
        includesLunch: true,
        includesDinner: true,
      },
    });

    const scheduledByDate = new Map<string, number>();
    for (const d of deliveries) {
      const iso = formatDateOnly(d.deliveryDate);
      scheduledByDate.set(
        iso,
        (scheduledByDate.get(iso) ?? 0) + packsInDeliveryRow(d),
      );
    }

    const days: Array<{
      date: string;
      scheduledPacks: number;
      remainingPacks: number;
      isFull: boolean;
    }> = [];
    let cur = from;
    while (cur <= to) {
      const iso = formatDateOnly(cur);
      const scheduledPacks = scheduledByDate.get(iso) ?? 0;
      days.push({
        date: iso,
        scheduledPacks,
        remainingPacks: Math.max(0, capacity - scheduledPacks),
        isFull: scheduledPacks >= capacity,
      });
      cur = addDaysUtc(cur, 1);
    }

    return { dailyCapacityPacks: capacity, days };
  }

  async evaluatePurchaseCapacityForPackage(
    durationDays: number,
    requiredPacks: number,
  ): Promise<PurchaseCapacityEvaluation> {
    const dailyCapacityPacks = this.bentoSettings.getDailyCapacityPacks();
    const ordersPaused = this.bentoSettings.getBlockNewOrders();
    const minStart = earliestSchedulableDate();
    const searchEnd = addDaysUtc(minStart, durationDays + 180);
    const scheduledByDate = await this.loadScheduledPacksByDate(
      minStart,
      searchEnd,
    );
    const remainingByDate = buildRemainingByDate(
      minStart,
      searchEnd,
      dailyCapacityPacks,
      scheduledByDate,
    );
    return evaluatePurchaseCapacity({
      durationDays,
      requiredPacks,
      dailyCapacityPacks,
      remainingByDate,
      ordersPaused,
    });
  }

  private async loadScheduledPacksByDate(
    from: Date,
    to: Date,
  ): Promise<Map<string, number>> {
    const deliveries = await this.prisma.bentoDeliveryDay.findMany({
      where: {
        deliveryDate: { gte: from, lte: to },
        status: BentoDeliveryStatus.SCHEDULED,
        subscription: {
          status: {
            in: [
              BentoSubscriptionStatus.ACTIVE,
              BentoSubscriptionStatus.COMPLETED,
            ],
          },
        },
      },
      select: {
        deliveryDate: true,
        includesLunch: true,
        includesDinner: true,
      },
    });
    const scheduledByDate = new Map<string, number>();
    for (const d of deliveries) {
      const iso = formatDateOnly(d.deliveryDate);
      scheduledByDate.set(
        iso,
        (scheduledByDate.get(iso) ?? 0) + packsInDeliveryRow(d),
      );
    }
    return scheduledByDate;
  }

  private purchaseCapacityMessage(
    evaluation: PurchaseCapacityEvaluation,
  ): string {
    if (evaluation.ordersPaused) {
      return 'New meal plans are temporarily unavailable. Please check back later.';
    }
    const { requiredPacks, availablePacksInWindow, windowDays } = evaluation;
    let msg =
      `We can't accept this order right now — only ${availablePacksInWindow} of ${requiredPacks} meal slots are free in the next ${windowDays}-day scheduling window.`;
    if (evaluation.nextAvailableDate) {
      const dayHint =
        evaluation.daysUntilAvailable != null && evaluation.daysUntilAvailable > 0
          ? ` (about ${evaluation.daysUntilAvailable} day${evaluation.daysUntilAvailable === 1 ? '' : 's'} from now)`
          : '';
      msg += ` Please come back from ${evaluation.nextAvailableDate}${dayHint} when more dates open up.`;
    } else {
      msg += ' Please try again later.';
    }
    return msg;
  }

  private async assertCanPurchase(
    pkg: BentoPackage,
    requiredPacks: number,
  ): Promise<PurchaseCapacityEvaluation> {
    const evaluation = await this.evaluatePurchaseCapacityForPackage(
      pkg.durationDays,
      requiredPacks,
    );
    if (!evaluation.canPurchase) {
      throw new BadRequestException({
        code: evaluation.ordersPaused
          ? 'BENTO_ORDERS_PAUSED'
          : 'BENTO_CAPACITY_EXHAUSTED',
        message: this.purchaseCapacityMessage(evaluation),
        purchaseAvailability: evaluation,
      });
    }
    return evaluation;
  }

  async getWeeklyOptInStatus(customerId: string) {
    const weekStart = parseDateOnly(weekStartMondayIso());
    const row = await this.prisma.bentoWeeklyOptIn.findUnique({
      where: {
        customerId_weekStart: { customerId, weekStart },
      },
    });
    const awaitingSchedule = await this.prisma.bentoSubscription.findFirst({
      where: {
        customerId,
        status: BentoSubscriptionStatus.ACTIVE,
        deliveries: { none: {} },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      weekStart: weekStartMondayIso(),
      optedIn: row?.optedIn ?? null,
      /** Show weekly menu only after purchase, when scheduling is pending. */
      showPrompt: row == null && awaitingSchedule != null,
      menu: buildWeeklyMenu(this.bentoMenu.getConfig()),
      minScheduleLeadDays: BENTO_MIN_SCHEDULE_LEAD_DAYS,
      pendingSubscriptionId: awaitingSchedule?.id ?? null,
    };
  }

  async setWeeklyOptIn(customerId: string, dto: BentoWeeklyOptInDto) {
    const weekStart = parseDateOnly(weekStartMondayIso());
    await this.prisma.bentoWeeklyOptIn.upsert({
      where: {
        customerId_weekStart: { customerId, weekStart },
      },
      create: {
        customerId,
        weekStart,
        optedIn: dto.optedIn,
      },
      update: { optedIn: dto.optedIn },
    });
    return {
      weekStart: formatDateOnly(weekStart),
      optedIn: dto.optedIn,
      showPrompt: false,
    };
  }

  async quote(
    customerId: string,
    dto: BentoQuoteDto,
  ): Promise<
    BentoQuoteResult & {
      package: ReturnType<typeof this.mapPackage>;
      purchaseAvailability: PurchaseCapacityEvaluation;
    }
  > {
    const pkg = await this.resolvePackage(dto.packageCode);
    await this.validateCheckoutInput(customerId, pkg, dto);
    const drinksAndSoupEnabled = this.bentoFeatures.drinksAndSoupEnabled();
    const includeDrinkAddon = drinksAndSoupEnabled ? dto.includeDrinkAddon : false;
    const quote = quoteBentoCheckout({
      packageCode: pkg.code,
      mealCredits: pkg.mealCredits,
      pricePerMealCents: pkg.pricePerMealCents,
      fixedCheckoutCents: pkg.fixedCheckoutCents,
      includeFreeSoupAndDrinks: pkg.includeFreeSoupAndDrinks,
      mealOption: dto.mealOption,
      riceType: dto.riceType,
      includeDrinkAddon,
      drinksAndSoupEnabled,
    });
    const sets = Math.min(10, Math.max(1, dto.sets ?? 1));
    const requiredPacks = (quote.lunchCredits + quote.dinnerCredits) * sets;
    const purchaseAvailability = await this.evaluatePurchaseCapacityForPackage(
      pkg.durationDays,
      requiredPacks,
    );
    return { ...quote, package: this.mapPackage(pkg), purchaseAvailability };
  }

  async checkout(customerId: string, dto: BentoCheckoutDto) {
    const pkg = await this.resolvePackage(dto.packageCode);
    await this.validateCheckoutInput(customerId, pkg, dto);
    const drinksAndSoupEnabled = this.bentoFeatures.drinksAndSoupEnabled();
    const includeDrinkAddon = drinksAndSoupEnabled ? dto.includeDrinkAddon : false;
    const quote = quoteBentoCheckout({
      packageCode: pkg.code,
      mealCredits: pkg.mealCredits,
      pricePerMealCents: pkg.pricePerMealCents,
      fixedCheckoutCents: pkg.fixedCheckoutCents,
      includeFreeSoupAndDrinks: pkg.includeFreeSoupAndDrinks,
      mealOption: dto.mealOption,
      riceType: dto.riceType,
      includeDrinkAddon,
      drinksAndSoupEnabled,
    });
    const sets = Math.min(10, Math.max(1, dto.sets ?? 1));
    const requiredPacks = (quote.lunchCredits + quote.dinnerCredits) * sets;
    await this.assertCanPurchase(pkg, requiredPacks);

    if (quote.totalCents < 100) {
      throw new BadRequestException({
        code: 'BENTO_MIN_AMOUNT',
        message: 'Minimum order is RM1.00.',
      });
    }

    const subscription = await this.prisma.bentoSubscription.create({
      data: {
        customerId,
        packageId: pkg.id,
        mealOption: dto.mealOption,
        lunchVariant: dto.lunchVariant,
        dinnerVariant: dto.dinnerVariant,
        riceType: dto.riceType,
        includeDrinkAddon:
          drinksAndSoupEnabled &&
          (pkg.includeFreeSoupAndDrinks || includeDrinkAddon),
        mealCreditsTotal: pkg.mealCredits,
        lunchCredits: quote.lunchCredits,
        dinnerCredits: quote.dinnerCredits,
        totalCents: quote.totalCents,
        status: BentoSubscriptionStatus.PENDING_PAYMENT,
      },
      include: { package: true },
    });

    return this.payments.createBentoSubscriptionCheckout(
      customerId,
      subscription.id,
      quote.totalCents,
      dto.channelCode,
    );
  }

  async scheduleDeliveries(
    customerId: string,
    subscriptionId: string,
    dto: BentoScheduleDto,
  ) {
    const sub = await this.prisma.bentoSubscription.findFirst({
      where: { id: subscriptionId, customerId },
      include: { package: true, deliveries: true },
    });
    if (!sub) {
      throw new NotFoundException({
        code: 'BENTO_SUBSCRIPTION_NOT_FOUND',
        message: 'Subscription not found',
      });
    }
    if (sub.status !== BentoSubscriptionStatus.ACTIVE) {
      throw new BadRequestException({
        code: 'BENTO_NOT_ACTIVE',
        message: 'Pay for your plan before scheduling pickup days.',
      });
    }

    const rows = this.validateScheduleSlots(
      sub.package,
      sub.mealOption,
      sub.lunchCredits,
      sub.dinnerCredits,
      dto.slots,
    );

    await this.assertDailyCapacity(subscriptionId, rows);

    this.assertLockedDeliveriesUnchanged(sub.deliveries, rows);

    const lockedScheduledIds = sub.deliveries
      .filter(
        (d) =>
          d.status === BentoDeliveryStatus.SCHEDULED &&
          isPickupDateLocked(formatDateOnly(d.deliveryDate)),
      )
      .map((d) => d.id);

    const immutableDeliveries = sub.deliveries.filter(
      (d) =>
        d.status !== BentoDeliveryStatus.SCHEDULED ||
        isPickupDateLocked(formatDateOnly(d.deliveryDate)),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.bentoDeliveryDay.deleteMany({
        where: {
          subscriptionId,
          status: BentoDeliveryStatus.SCHEDULED,
          ...(lockedScheduledIds.length > 0
            ? { id: { notIn: lockedScheduledIds } }
            : {}),
        },
      });

      const immutableByDate = new Map<
        string,
        { includesLunch: boolean; includesDinner: boolean }
      >();
      for (const delivery of immutableDeliveries) {
        const iso = formatDateOnly(delivery.deliveryDate);
        const existing = immutableByDate.get(iso) ?? {
          includesLunch: false,
          includesDinner: false,
        };
        existing.includesLunch ||= delivery.includesLunch;
        existing.includesDinner ||= delivery.includesDinner;
        immutableByDate.set(iso, existing);
      }

      for (const row of rows) {
        const iso = formatDateOnly(row.deliveryDate);
        const immutable = immutableByDate.get(iso);
        if (
          immutable &&
          (!row.includesLunch || immutable.includesLunch) &&
          (!row.includesDinner || immutable.includesDinner)
        ) {
          continue;
        }

        await tx.bentoDeliveryDay.create({
          data: {
            subscriptionId,
            deliveryDate: row.deliveryDate,
            includesLunch: row.includesLunch,
            includesDinner: row.includesDinner,
          },
        });
      }

      const allDeliveries = await tx.bentoDeliveryDay.findMany({
        where: { subscriptionId },
        orderBy: { deliveryDate: 'asc' },
      });

      await tx.bentoSubscription.update({
        where: { id: subscriptionId },
        data: {
          startDate: allDeliveries[0]?.deliveryDate ?? null,
          endDate: allDeliveries[allDeliveries.length - 1]?.deliveryDate ?? null,
        },
      });
    });

    return this.getSubscription(customerId, subscriptionId);
  }

  async listMySubscriptions(customerId: string) {
    const rows = await this.prisma.bentoSubscription.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        package: true,
        deliveries: { orderBy: { deliveryDate: 'asc' } },
      },
    });
    return rows.map((s) => this.mapSubscription(s));
  }

  async getSubscription(customerId: string, id: string) {
    const row = await this.prisma.bentoSubscription.findFirst({
      where: { id, customerId },
      include: {
        package: true,
        deliveries: { orderBy: { deliveryDate: 'asc' } },
      },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'BENTO_SUBSCRIPTION_NOT_FOUND',
        message: 'Subscription not found',
      });
    }
    return this.mapSubscription(row);
  }

  private async resolvePackage(code: BentoPackageCode): Promise<BentoPackage> {
    const pkg = await this.prisma.bentoPackage.findUnique({ where: { code } });
    if (!pkg || !pkg.isActive) {
      throw new BadRequestException({
        code: 'BENTO_PACKAGE_NOT_FOUND',
        message: 'Package not found',
      });
    }
    return pkg;
  }

  private assertLockedDeliveriesUnchanged(
    deliveries: Array<{
      deliveryDate: Date;
      includesLunch: boolean;
      includesDinner: boolean;
      status: BentoDeliveryStatus;
    }>,
    rows: Array<{
      deliveryDate: Date;
      includesLunch: boolean;
      includesDinner: boolean;
    }>,
  ): void {
    for (const delivery of deliveries) {
      if (delivery.status !== BentoDeliveryStatus.SCHEDULED) continue;
      const iso = formatDateOnly(delivery.deliveryDate);
      if (!isPickupDateLocked(iso)) continue;

      const row = rows.find((r) => formatDateOnly(r.deliveryDate) === iso);
      if (
        !row ||
        row.includesLunch !== delivery.includesLunch ||
        row.includesDinner !== delivery.includesDinner
      ) {
        throw new BadRequestException({
          code: 'BENTO_PICKUP_LOCKED',
          message: pickupLockMessage(iso),
        });
      }
    }
  }

  private async validateCheckoutInput(
    customerId: string,
    pkg: BentoPackage,
    dto: BentoQuoteDto,
  ): Promise<void> {
    if (pkg.code === BentoPackageCode.NEWCOMER_3) {
      if (dto.mealOption !== BentoMealOption.LUNCH) {
        throw new BadRequestException({
          code: 'BENTO_NEWCOMER_LUNCH_ONLY',
          message: 'Trial pack is lunch-only. Add-ons (brown rice, vegetarian) are still available.',
        });
      }
      await this.assertNewcomerEligible(customerId);
    }
  }

  private async assertNewcomerEligible(customerId: string): Promise<void> {
    if (!(await this.isNewcomerEligible(customerId))) {
      throw new BadRequestException({
        code: 'BENTO_NEWCOMER_INELIGIBLE',
        message: 'Trial pack is a one-time offer for first-time bento customers on this account.',
      });
    }
  }

  private validateScheduleSlots(
    pkg: BentoPackage,
    mealOption: BentoMealOption,
    lunchCredits: number,
    dinnerCredits: number,
    slots: BentoScheduleSlotDto[],
  ): Array<{
    deliveryDate: Date;
    includesLunch: boolean;
    includesDinner: boolean;
  }> {
    const earliest = earliestSchedulableDate();
    const windowEnd = addDaysUtc(earliest, pkg.durationDays - 1);

    const byDate = new Map<
      string,
      { includesLunch: boolean; includesDinner: boolean }
    >();

    for (const slot of slots) {
      if (!slot.includeLunch && !slot.includeDinner) continue;

      const d = parseDateOnly(slot.date);

      if (d < earliest) {
        throw new BadRequestException({
          code: 'BENTO_SCHEDULE_TOO_SOON',
          message: `Pickup must be at least ${BENTO_MIN_SCHEDULE_LEAD_DAYS} days in advance (${formatDateOnly(earliest)} or later).`,
        });
      }
      if (d > windowEnd) {
        throw new BadRequestException({
          code: 'BENTO_DATE_OUT_OF_WINDOW',
          message: `Pickup date ${slot.date} is outside your scheduling window.`,
        });
      }
      if (d.getUTCDay() === 0) {
        throw new BadRequestException({
          code: 'BENTO_SUNDAY_NOT_ALLOWED',
          message: 'Sunday pickups are not available.',
        });
      }

      if (mealOption === BentoMealOption.LUNCH && slot.includeDinner) {
        throw new BadRequestException({
          code: 'BENTO_LUNCH_ONLY',
          message: 'Your plan includes lunch only — dinner cannot be scheduled.',
        });
      }
      if (mealOption === BentoMealOption.DINNER && slot.includeLunch) {
        throw new BadRequestException({
          code: 'BENTO_DINNER_ONLY',
          message: 'Your plan includes dinner only — lunch cannot be scheduled.',
        });
      }

      const prev = byDate.get(slot.date);
      byDate.set(slot.date, {
        includesLunch: (prev?.includesLunch ?? false) || slot.includeLunch,
        includesDinner: (prev?.includesDinner ?? false) || slot.includeDinner,
      });
    }

    if (byDate.size === 0) {
      throw new BadRequestException({
        code: 'BENTO_NO_MEALS',
        message: 'Select at least one lunch or dinner for a pickup day.',
      });
    }

    let lunchUsed = 0;
    let dinnerUsed = 0;
    for (const row of byDate.values()) {
      if (row.includesLunch) lunchUsed++;
      if (row.includesDinner) dinnerUsed++;
    }

    if (lunchUsed > lunchCredits) {
      throw new BadRequestException({
        code: 'BENTO_LUNCH_CREDITS_EXCEEDED',
        message: `You can schedule at most ${lunchCredits} lunch meal(s).`,
      });
    }
    if (dinnerUsed > dinnerCredits) {
      throw new BadRequestException({
        code: 'BENTO_DINNER_CREDITS_EXCEEDED',
        message: `You can schedule at most ${dinnerCredits} dinner meal(s).`,
      });
    }

    const totalMeals = lunchUsed + dinnerUsed;
    if (pkg.code === BentoPackageCode.ONE_TIME && totalMeals !== 1) {
      throw new BadRequestException({
        code: 'BENTO_ONE_TIME_SINGLE_MEAL',
        message: 'One-meal plan allows exactly one lunch or dinner.',
      });
    }

    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([iso, flags]) => ({
        deliveryDate: parseDateOnly(iso),
        includesLunch: flags.includesLunch,
        includesDinner: flags.includesDinner,
      }));
  }

  private async assertDailyCapacity(
    subscriptionId: string,
    rows: Array<{
      deliveryDate: Date;
      includesLunch: boolean;
      includesDinner: boolean;
    }>,
  ): Promise<void> {
    const capacity = this.bentoSettings.getDailyCapacityPacks();
    const packsByDate = new Map<string, number>();
    for (const row of rows) {
      const iso = formatDateOnly(row.deliveryDate);
      packsByDate.set(
        iso,
        (packsByDate.get(iso) ?? 0) + packsInDeliveryRow(row),
      );
    }

    for (const [iso, subPacks] of packsByDate) {
      const others = await this.countScheduledPacksOnDate(iso, subscriptionId);
      const total = others + subPacks;
      if (total > capacity) {
        const remaining = Math.max(0, capacity - others);
        throw new BadRequestException({
          code: 'BENTO_DAY_CAPACITY_FULL',
          message:
            remaining > 0
              ? `${iso} only has ${remaining} pack slot(s) left (${capacity} per day). Reduce meals on that day or choose another date.`
              : `${iso} is fully booked (${capacity} packs per day). Please choose another date.`,
          date: iso,
          dailyCapacityPacks: capacity,
          scheduledPacks: others,
          remainingPacks: remaining,
        });
      }
    }
  }

  private async countScheduledPacksOnDate(
    iso: string,
    excludeSubscriptionId: string,
  ): Promise<number> {
    const deliveries = await this.prisma.bentoDeliveryDay.findMany({
      where: {
        deliveryDate: parseDateOnly(iso),
        status: BentoDeliveryStatus.SCHEDULED,
        subscription: {
          id: { not: excludeSubscriptionId },
          status: {
            in: [
              BentoSubscriptionStatus.ACTIVE,
              BentoSubscriptionStatus.COMPLETED,
            ],
          },
        },
      },
      select: { includesLunch: true, includesDinner: true },
    });
    return deliveries.reduce((sum, d) => sum + packsInDeliveryRow(d), 0);
  }

  private mapPackage(p: BentoPackage) {
    const split = splitMealCredits(p.mealCredits, BentoMealOption.BOTH);
    const drinksAndSoupEnabled = this.bentoFeatures.drinksAndSoupEnabled();
    const includeFreeSoupAndDrinks =
      drinksAndSoupEnabled && p.includeFreeSoupAndDrinks;
    return {
      id: p.id,
      code: p.code,
      label: p.label,
      durationDays: p.durationDays,
      mealCredits: p.mealCredits,
      pricePerMealCents: p.pricePerMealCents,
      pricePerMealRm: p.pricePerMealCents / 100,
      fixedCheckoutCents: p.fixedCheckoutCents,
      isNewcomer: p.code === BentoPackageCode.NEWCOMER_3,
      newcomerLunchOnly: p.code === BentoPackageCode.NEWCOMER_3,
      includeFreeSoupAndDrinks,
      perksLabel: includeFreeSoupAndDrinks
        ? 'Free soup + free drinks included'
        : null,
    };
  }

  private mapSubscription(
    s: {
      id: string;
      mealOption: string;
      lunchVariant: string;
      dinnerVariant: string;
      riceType: string;
      includeDrinkAddon: boolean;
      mealCreditsTotal: number;
      lunchCredits: number;
      dinnerCredits: number;
      startDate: Date | null;
      endDate: Date | null;
      totalCents: number;
      status: string;
      createdAt: Date;
      package: BentoPackage;
      deliveries: Array<{
        id: string;
        deliveryDate: Date;
        includesLunch: boolean;
        includesDinner: boolean;
        status: string;
      }>;
    },
  ) {
    const needsSchedule =
      s.status === BentoSubscriptionStatus.ACTIVE && s.deliveries.length === 0;

    const earliest = earliestSchedulableDate();
    const windowEnd = addDaysUtc(earliest, s.package.durationDays - 1);
    const mealOpt = s.mealOption as BentoMealOption;

    return {
      id: s.id,
      mealOption: s.mealOption,
      lunchVariant: s.lunchVariant,
      dinnerVariant: s.dinnerVariant,
      riceType: s.riceType,
      includeDrinkAddon: s.includeDrinkAddon,
      mealCreditsTotal: s.mealCreditsTotal,
      lunchCredits: s.lunchCredits,
      dinnerCredits: s.dinnerCredits,
      startDate: s.startDate ? formatDateOnly(s.startDate) : null,
      endDate: s.endDate ? formatDateOnly(s.endDate) : null,
      totalCents: s.totalCents,
      totalRm: s.totalCents / 100,
      status: s.status,
      needsSchedule,
      scheduling: {
        minLeadDays: BENTO_MIN_SCHEDULE_LEAD_DAYS,
        earliestDate: formatDateOnly(earliest),
        windowEndDate: formatDateOnly(windowEnd),
        allowLunch: mealOpt !== BentoMealOption.DINNER,
        allowDinner: mealOpt !== BentoMealOption.LUNCH,
        lunchScheduled: s.deliveries.filter((d) => d.includesLunch).length,
        dinnerScheduled: s.deliveries.filter((d) => d.includesDinner).length,
      },
      createdAt: s.createdAt.toISOString(),
      package: this.mapPackage(s.package),
      deliveries: s.deliveries.map((d) => ({
        id: d.id,
        deliveryDate: formatDateOnly(d.deliveryDate),
        includesLunch: d.includesLunch,
        includesDinner: d.includesDinner,
        status: d.status,
      })),
    };
  }
}

function parseDateOnly(iso: string): Date {
  try {
    return parseDateOnlyUtil(iso);
  } catch {
    throw new BadRequestException({
      code: 'INVALID_DATE',
      message: `Invalid date: ${iso}`,
    });
  }
}

function earliestSchedulableDate(ref = new Date()): Date {
  const today = new Date(
    Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()),
  );
  return addDaysUtc(today, BENTO_MIN_SCHEDULE_LEAD_DAYS);
}
