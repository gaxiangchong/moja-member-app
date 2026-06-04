import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  BentoMealOption,
  BentoPackageCode,
  BentoSubscriptionStatus,
  type BentoPackage,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
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
}> = [
  {
    code: BentoPackageCode.NEWCOMER_3,
    label: 'Newcomer promo — 3 lunches',
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
  },
  {
    code: BentoPackageCode.DAYS_7,
    label: '7 meals',
    durationDays: 14,
    mealCredits: 7,
    pricePerMealCents: 1600,
  },
  {
    code: BentoPackageCode.DAYS_15,
    label: '15 meals',
    durationDays: 21,
    mealCredits: 15,
    pricePerMealCents: 1500,
  },
  {
    code: BentoPackageCode.DAYS_30,
    label: '30 meals',
    durationDays: 35,
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
  },
];

@Injectable()
export class BentoService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
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
        },
        update: {
          label: pkg.label,
          durationDays: pkg.durationDays,
          mealCredits: pkg.mealCredits,
          pricePerMealCents: pkg.pricePerMealCents,
          fixedCheckoutCents: pkg.fixedCheckoutCents ?? null,
          includeFreeSoupAndDrinks: pkg.includeFreeSoupAndDrinks ?? false,
          isActive: true,
        },
      });
    }
  }

  async isNewcomerEligible(customerId: string): Promise<boolean> {
    const prior = await this.prisma.bentoSubscription.count({
      where: {
        customerId,
        status: {
          in: [
            BentoSubscriptionStatus.ACTIVE,
            BentoSubscriptionStatus.COMPLETED,
          ],
        },
      },
    });
    return prior === 0;
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

    return { newcomerEligible, packages };
  }

  getMenu() {
    return BENTO_MENU;
  }

  getWeeklyMenu() {
    return buildWeeklyMenu();
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
      menu: buildWeeklyMenu(),
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
  ): Promise<BentoQuoteResult & { package: ReturnType<typeof this.mapPackage> }> {
    const pkg = await this.resolvePackage(dto.packageCode);
    this.validateCheckoutInput(customerId, pkg, dto);
    const quote = quoteBentoCheckout({
      packageCode: pkg.code,
      mealCredits: pkg.mealCredits,
      pricePerMealCents: pkg.pricePerMealCents,
      fixedCheckoutCents: pkg.fixedCheckoutCents,
      includeFreeSoupAndDrinks: pkg.includeFreeSoupAndDrinks,
      mealOption: dto.mealOption,
      riceType: dto.riceType,
      includeDrinkAddon: dto.includeDrinkAddon,
    });
    return { ...quote, package: this.mapPackage(pkg) };
  }

  async checkout(customerId: string, dto: BentoCheckoutDto) {
    const pkg = await this.resolvePackage(dto.packageCode);
    this.validateCheckoutInput(customerId, pkg, dto);
    const quote = quoteBentoCheckout({
      packageCode: pkg.code,
      mealCredits: pkg.mealCredits,
      pricePerMealCents: pkg.pricePerMealCents,
      fixedCheckoutCents: pkg.fixedCheckoutCents,
      includeFreeSoupAndDrinks: pkg.includeFreeSoupAndDrinks,
      mealOption: dto.mealOption,
      riceType: dto.riceType,
      includeDrinkAddon: dto.includeDrinkAddon,
    });

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
          pkg.includeFreeSoupAndDrinks || dto.includeDrinkAddon,
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
    if (sub.deliveries.length > 0) {
      throw new BadRequestException({
        code: 'BENTO_ALREADY_SCHEDULED',
        message: 'Pickup schedule is already set for this subscription.',
      });
    }

    const rows = this.validateScheduleSlots(
      sub.package,
      sub.mealOption,
      sub.lunchCredits,
      sub.dinnerCredits,
      dto.slots,
    );

    const startDate = rows[0]!.deliveryDate;
    const endDate = rows[rows.length - 1]!.deliveryDate;

    await this.prisma.bentoSubscription.update({
      where: { id: subscriptionId },
      data: {
        startDate,
        endDate,
        deliveries: {
          create: rows.map((r) => ({
            deliveryDate: r.deliveryDate,
            includesLunch: r.includesLunch,
            includesDinner: r.includesDinner,
          })),
        },
      },
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

  private validateCheckoutInput(
    customerId: string,
    pkg: BentoPackage,
    dto: BentoQuoteDto,
  ): void {
    if (pkg.code === BentoPackageCode.NEWCOMER_3) {
      if (dto.mealOption !== BentoMealOption.LUNCH) {
        throw new BadRequestException({
          code: 'BENTO_NEWCOMER_LUNCH_ONLY',
          message: 'Newcomer promo is lunch-only. Add-ons (brown rice, drinks, vegetarian) are still available.',
        });
      }
      void this.assertNewcomerEligible(customerId);
    }
  }

  private async assertNewcomerEligible(customerId: string): Promise<void> {
    if (!(await this.isNewcomerEligible(customerId))) {
      throw new BadRequestException({
        code: 'BENTO_NEWCOMER_INELIGIBLE',
        message: 'Newcomer promo is only for first-time bento purchases on this account.',
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

  private mapPackage(p: BentoPackage) {
    const split = splitMealCredits(p.mealCredits, BentoMealOption.BOTH);
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
      includeFreeSoupAndDrinks: p.includeFreeSoupAndDrinks,
      perksLabel: p.includeFreeSoupAndDrinks
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
