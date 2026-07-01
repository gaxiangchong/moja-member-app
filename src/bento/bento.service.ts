import {
  BadRequestException,
  Injectable,
  Logger,
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
import { BentoVoucherService } from '../bento-vouchers/bento-voucher.service';
import { BentoMenuService } from './bento-menu.service';
import { BentoSettingsService } from './bento-settings.service';
import { BentoFeaturesService } from './bento-features.service';
import { ReportingSettingsService } from '../admin/reporting-settings.service';
import { packsInDeliveryRow } from './bento-capacity.util';
import {
  buildRemainingByDate,
  evaluatePurchaseCapacity,
  type PurchaseCapacityEvaluation,
} from './bento-purchase-capacity.util';
import {
  buildScheduleRulesInput,
  buildScheduleRulesPayload,
  schedulablePickupReason,
  type BentoScheduleRulesPayload,
} from './bento-schedule-rules.util';
import { resolveMinScheduleLeadDays } from './bento-schedule-rules.util';
import {
  quoteBentoCheckout,
  splitMealCredits,
  resolveSavingsBaseline,
  computePackageListSavings,
  type BentoQuoteResult,
} from './bento-pricing.service';
import { BENTO_MENU } from './bento-menu.constants';
import {
  isPickupDateLocked,
  pickupLockMessage,
} from './bento-pickup-lock.util';
import {
  addDaysUtc,
  buildWeeklyMenu,
  BENTO_DISPLAY_WEEKS,
  displayWeekStartIsos,
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
    pricePerMealCents: 1790,
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
    durationDays: 60,
    mealCredits: 20,
    pricePerMealCents: 1500,
  },
  {
    code: BentoPackageCode.DAYS_30,
    label: '30 meals',
    durationDays: 90,
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
    private readonly reportingSettings: ReportingSettingsService,
    private readonly bentoVouchers: BentoVoucherService,
  ) {}

  private readonly logger = new Logger(BentoService.name);

  /** Per-customer timestamp of the last auto-heal reconcile (throttling). */
  private readonly lastPendingHealAt = new Map<string, number>();
  /** Don't re-reconcile the same customer more than once per this window. */
  private static readonly PENDING_HEAL_THROTTLE_MS = 30_000;
  /** Reconcile at most this many pending plans per pass (bounds Xendit calls). */
  private static readonly PENDING_HEAL_MAX = 5;
  /** Only auto-heal recent attempts; older unpaid plans are treated as dead. */
  private static readonly PENDING_HEAL_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

  async onModuleInit() {
    await this.seedPackages();
  }

  /**
   * Auto-heal: a member whose e-wallet payment succeeded but whose Xendit
   * webhook was missed stays at PENDING_PAYMENT, and the app never offers to
   * schedule it (scheduling only targets ACTIVE plans) — so they "can't book"
   * despite paying. When they open their bento screen we reconcile their recent
   * unpaid plans with Xendit; a genuinely-paid one flips to ACTIVE. Throttled
   * per customer, bounded, parallel, and never allowed to fail the request.
   */
  private async autoHealPendingSubscriptions(
    customerId: string,
  ): Promise<void> {
    const now = Date.now();
    const last = this.lastPendingHealAt.get(customerId) ?? 0;
    if (now - last < BentoService.PENDING_HEAL_THROTTLE_MS) return;
    // Guard against unbounded growth of the throttle map.
    if (this.lastPendingHealAt.size > 5000) this.lastPendingHealAt.clear();
    this.lastPendingHealAt.set(customerId, now);
    try {
      const since = new Date(now - BentoService.PENDING_HEAL_WINDOW_MS);
      const pending = await this.prisma.bentoSubscription.findMany({
        where: {
          customerId,
          status: BentoSubscriptionStatus.PENDING_PAYMENT,
          paymentIntentId: { not: null },
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take: BentoService.PENDING_HEAL_MAX,
        select: { id: true },
      });
      if (pending.length === 0) return;
      await Promise.all(
        pending.map((p) =>
          this.payments.reconcileBentoSubscriptionPayment(p.id),
        ),
      );
    } catch (err) {
      this.logger.warn(
        `Auto-heal of pending bento subscriptions failed for customer ${customerId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async seedPackages(): Promise<void> {
    for (const pkg of PACKAGE_SEED) {
      const existing = await this.prisma.bentoPackage.findUnique({
        where: { code: pkg.code },
      });
      if (existing) {
        // Keep structural fields (validity window + meal credits) in sync with
        // the seed. These are not admin-editable, so reconciling them here lets
        // a change to PACKAGE_SEED take effect on the next boot without a
        // migration, while leaving admin-set label/price/active flags alone.
        const drift: { durationDays?: number; mealCredits?: number } = {};
        if (existing.durationDays !== pkg.durationDays) {
          drift.durationDays = pkg.durationDays;
        }
        if (existing.mealCredits !== pkg.mealCredits) {
          drift.mealCredits = pkg.mealCredits;
        }
        if (Object.keys(drift).length > 0) {
          await this.prisma.bentoPackage.update({
            where: { code: pkg.code },
            data: drift,
          });
        }
        continue;
      }
      await this.prisma.bentoPackage.create({
        data: {
          code: pkg.code,
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
    const baseline = await this.loadSavingsBaseline();
    const newcomerEligible =
      customerId != null ? await this.isNewcomerEligible(customerId) : false;
    const packages = rows
      .filter(
        (p) =>
          p.code !== BentoPackageCode.NEWCOMER_3 || newcomerEligible,
      )
      .map((p) => this.mapPackage(p, baseline))
      .sort((a, b) => {
        if (a.isNewcomer) return -1;
        if (b.isNewcomer) return 1;
        return a.mealCredits - b.mealCredits;
      });

    return {
      newcomerEligible,
      packages,
      savingsBaseline: {
        pricePerMealCents: baseline.pricePerMealCents,
        pricePerMealRm: baseline.pricePerMealCents / 100,
        label: baseline.label,
        packageCode: baseline.packageCode,
      },
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

  /** Build the consecutive weeks (this week, next week, …) the app can scroll. */
  private buildWeeklyMenus(leadDays: number) {
    return displayWeekStartIsos(BENTO_DISPLAY_WEEKS).map((iso) =>
      buildWeeklyMenu(this.bentoMenu.getWeekConfig(iso), leadDays, iso),
    );
  }

  getWeeklyMenu() {
    const settings = this.bentoSettings.getSettings();
    const leadDays = resolveMinScheduleLeadDays(settings);
    const weeks = this.buildWeeklyMenus(leadDays);
    return {
      ...weeks[0],
      weeks,
      scheduleRules: buildScheduleRulesPayload(settings, this.bentoMenu.getConfig()),
    };
  }

  getScheduleRules(): BentoScheduleRulesPayload {
    const settings = this.bentoSettings.getSettings();
    const menu = this.bentoMenu.getConfig();
    return buildScheduleRulesPayload(settings, menu);
  }

  async getScheduleCapacity(fromIso?: string, toIso?: string) {
    const rules = this.scheduleRulesInput();
    const from = fromIso ? parseDateOnly(fromIso) : rules.minSchedulableDate;
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
          // Exclude pre-launch test orders (sales reporting start date).
          ...this.reportingSettings.createdAtCutoffWhere(),
        },
      },
      select: {
        deliveryDate: true,
        includesLunch: true,
        includesDinner: true,
        lunchQty: true,
        dinnerQty: true,
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

    return {
      dailyCapacityPacks: capacity,
      rules: buildScheduleRulesPayload(
        this.bentoSettings.getSettings(),
        this.bentoMenu.getConfig(),
      ),
      days,
    };
  }

  private scheduleRulesInput(ref = new Date()) {
    return buildScheduleRulesInput(
      this.bentoSettings.getSettings(),
      this.bentoMenu.getConfig(),
      ref,
    );
  }

  async evaluatePurchaseCapacityForPackage(
    durationDays: number,
    requiredPacks: number,
  ): Promise<PurchaseCapacityEvaluation> {
    const dailyCapacityPacks = this.bentoSettings.getDailyCapacityPacks();
    const ordersPaused = this.bentoSettings.getBlockNewOrders();
    const scheduleRules = this.scheduleRulesInput();
    const minStart = scheduleRules.minSchedulableDate;
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
      scheduleRules,
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
          // Exclude pre-launch test orders (sales reporting start date).
          ...this.reportingSettings.createdAtCutoffWhere(),
        },
      },
      select: {
        deliveryDate: true,
        includesLunch: true,
        includesDinner: true,
        lunchQty: true,
        dinnerQty: true,
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
    // Flip any paid-but-stuck plans to ACTIVE before we compute what to show.
    await this.autoHealPendingSubscriptions(customerId);
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
        // Ignore pre-launch test orders (sales reporting start date).
        ...this.reportingSettings.createdAtCutoffWhere(),
      },
      orderBy: { createdAt: 'desc' },
    });
    const leadDays = resolveMinScheduleLeadDays(this.bentoSettings.getSettings());
    const weeks = this.buildWeeklyMenus(leadDays);
    return {
      weekStart: weekStartMondayIso(),
      optedIn: row?.optedIn ?? null,
      /** Show weekly menu only after purchase, when scheduling is pending. */
      showPrompt: row == null && awaitingSchedule != null,
      menu: weeks[0],
      weeks,
      minScheduleLeadDays: leadDays,
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
      voucher: { code: string; discountCents: number; newTotalCents: number } | null;
      voucherError: string | null;
    }
  > {
    const pkg = await this.resolvePackage(dto.packageCode);
    await this.validateCheckoutInput(customerId, pkg, dto);
    const drinksAndSoupEnabled = this.bentoFeatures.drinksAndSoupEnabled();
    const includeDrinkAddon = drinksAndSoupEnabled ? dto.includeDrinkAddon : false;
    const baseline = await this.loadSavingsBaseline();
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
      savingsBaselineCents: baseline.pricePerMealCents,
      savingsBaselineLabel: baseline.label,
    });
    const sets = Math.min(10, Math.max(1, dto.sets ?? 1));
    const requiredPacks = (quote.lunchCredits + quote.dinnerCredits) * sets;
    const purchaseAvailability = await this.evaluatePurchaseCapacityForPackage(
      pkg.durationDays,
      requiredPacks,
    );

    // Preview a typed promo code against the grand total (no capacity is held
    // here — that happens at checkout). Surface either the applied discount or a
    // reason string so the UI can show inline feedback.
    const subtotalCents = quote.totalCents * sets;
    let voucher: {
      code: string;
      discountCents: number;
      newTotalCents: number;
    } | null = null;
    let voucherError: string | null = null;
    if (dto.voucherCode && dto.voucherCode.trim()) {
      const packageBlock = this.voucherPackageBlockReason(pkg.code);
      if (packageBlock) {
        voucherError = packageBlock;
      } else {
        const result = await this.bentoVouchers.validateForQuote(
          dto.voucherCode,
          subtotalCents,
        );
        if (result.ok) {
          voucher = {
            code: result.code,
            discountCents: result.discountCents,
            newTotalCents: result.newTotalCents,
          };
        } else {
          voucherError = result.reason;
        }
      }
    }

    return {
      ...quote,
      package: this.mapPackage(pkg, baseline),
      purchaseAvailability,
      voucher,
      voucherError,
    };
  }

  async checkout(customerId: string, dto: BentoCheckoutDto) {
    const pkg = await this.resolvePackage(dto.packageCode);
    await this.validateCheckoutInput(customerId, pkg, dto);
    const drinksAndSoupEnabled = this.bentoFeatures.drinksAndSoupEnabled();
    const includeDrinkAddon = drinksAndSoupEnabled ? dto.includeDrinkAddon : false;
    const baseline = await this.loadSavingsBaseline();
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
      savingsBaselineCents: baseline.pricePerMealCents,
      savingsBaselineLabel: baseline.label,
    });
    const sets = Math.min(10, Math.max(1, dto.sets ?? 1));
    const requiredPacks = (quote.lunchCredits + quote.dinnerCredits) * sets;
    await this.assertCanPurchase(pkg, requiredPacks);

    const subtotalCents = quote.totalCents * sets;
    if (subtotalCents < 100) {
      throw new BadRequestException({
        code: 'BENTO_MIN_AMOUNT',
        message: 'Minimum order is RM1.00.',
      });
    }

    // Reserve the promo code (atomic capacity claim) and apply the discount to
    // the amount we charge. The reservation is released below if anything after
    // it fails, so capacity is never silently consumed by an abandoned checkout.
    let redemption: { redemptionId: string; discountCents: number } | null =
      null;
    if (dto.voucherCode && dto.voucherCode.trim()) {
      const packageBlock = this.voucherPackageBlockReason(pkg.code);
      if (packageBlock) {
        throw new BadRequestException({
          code: 'BENTO_VOUCHER_PACKAGE_NOT_ELIGIBLE',
          message:
            'Promo codes apply to subscription plans only, not single meals.',
        });
      }
      const reserved = await this.bentoVouchers.reserve(
        dto.voucherCode,
        customerId,
        subtotalCents,
      );
      redemption = {
        redemptionId: reserved.redemptionId,
        discountCents: reserved.discountCents,
      };
    }
    const totalCents = subtotalCents - (redemption?.discountCents ?? 0);

    const subscriptionData = {
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
    };

    // Abandoned/failed checkout attempts otherwise pile up as PENDING_PAYMENT
    // rows for this customer+package and clutter their list (and the "blocks
    // scheduling" state). Before recording this new attempt, clear the earlier
    // unpaid ones. Reconcile each with Xendit first so we never cancel an
    // attempt that was actually paid but whose webhook is still in flight — a
    // reconcile flips a paid one to ACTIVE, and the updateMany below only
    // touches rows still PENDING_PAYMENT.
    const priorPending = await this.prisma.bentoSubscription.findMany({
      where: {
        customerId,
        packageId: pkg.id,
        status: BentoSubscriptionStatus.PENDING_PAYMENT,
      },
      select: { id: true },
    });
    for (const prior of priorPending) {
      await this.payments.reconcileBentoSubscriptionPayment(prior.id);
    }
    if (priorPending.length > 0) {
      await this.prisma.bentoSubscription.updateMany({
        where: {
          customerId,
          packageId: pkg.id,
          status: BentoSubscriptionStatus.PENDING_PAYMENT,
        },
        data: { status: BentoSubscriptionStatus.CANCELLED },
      });
    }

    try {
      const subscriptions = await this.prisma.$transaction(async (tx) => {
        const created: Awaited<
          ReturnType<typeof tx.bentoSubscription.create>
        >[] = [];
        for (let i = 0; i < sets; i++) {
          created.push(
            await tx.bentoSubscription.create({
              data: subscriptionData,
              include: { package: true },
            }),
          );
        }
        return created;
      });

      return await this.payments.createBentoSubscriptionCheckout(
        customerId,
        subscriptions.map((s) => s.id),
        totalCents,
        dto.channelCode,
        redemption?.redemptionId,
      );
    } catch (err) {
      // Return the claimed promo-code capacity if subscription creation or the
      // payment-intent call fails after we reserved it.
      if (redemption) {
        await this.bentoVouchers
          .releaseRedemption(redemption.redemptionId)
          .catch(() => {});
      }
      throw err;
    }
  }

  /**
   * Schedule pickup days on behalf of a customer from the admin dashboard.
   * Runs with `adminOverride`, which bypasses the lead-time/cutoff, the
   * package window, closed weekdays/dates, and the daily capacity cap — so
   * staff can resolve "I missed the cutoff" / "it won't let me pick that day"
   * complaints. Credit limits, meal-option, and locked (already-delivered)
   * days are still enforced. Throws NotFoundException if the subscription
   * does not exist.
   */
  async adminScheduleDeliveries(subscriptionId: string, dto: BentoScheduleDto) {
    const sub = await this.prisma.bentoSubscription.findUnique({
      where: { id: subscriptionId },
      select: { customerId: true },
    });
    if (!sub) {
      throw new NotFoundException({
        code: 'BENTO_SUBSCRIPTION_NOT_FOUND',
        message: 'Subscription not found',
      });
    }
    return this.scheduleDeliveries(sub.customerId, subscriptionId, dto, {
      adminOverride: true,
    });
  }

  async scheduleDeliveries(
    customerId: string,
    subscriptionId: string,
    dto: BentoScheduleDto,
    options: { adminOverride?: boolean } = {},
  ) {
    let sub = await this.prisma.bentoSubscription.findFirst({
      where: { id: subscriptionId, customerId },
      include: { package: true, deliveries: true },
    });
    if (!sub) {
      throw new NotFoundException({
        code: 'BENTO_SUBSCRIPTION_NOT_FOUND',
        message: 'Subscription not found',
      });
    }
    // If payment hasn't been recorded yet (e-wallet webhook not arrived),
    // actively reconcile with Xendit before refusing — avoids a false
    // "pay for your plan" right after a successful payment.
    if (sub.status !== BentoSubscriptionStatus.ACTIVE) {
      await this.payments.reconcileBentoSubscriptionPayment(subscriptionId);
      sub =
        (await this.prisma.bentoSubscription.findFirst({
          where: { id: subscriptionId, customerId },
          include: { package: true, deliveries: true },
        })) ?? sub;
    }
    if (sub.status !== BentoSubscriptionStatus.ACTIVE) {
      throw new BadRequestException({
        code: 'BENTO_NOT_ACTIVE',
        message: 'Pay for your plan before scheduling pickup days.',
      });
    }

    // Dates the plan already has a pickup on. Re-submitting one of these must
    // not be rejected by the date gates (too-soon / window / closed) — you
    // can't be "too late" to book a day you already booked, and locked past
    // days are preserved as-is below. Only genuinely new dates are gated.
    const existingDeliveryDates = new Set(
      sub.deliveries.map((d) => formatDateOnly(d.deliveryDate)),
    );

    const rows = this.validateScheduleSlots(
      sub.package,
      sub.mealOption,
      sub.lunchCredits,
      sub.dinnerCredits,
      dto.slots,
      options,
      existingDeliveryDates,
    );

    if (!options.adminOverride) {
      await this.assertDailyCapacity(subscriptionId, rows);
    }

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

      // Locked or already-delivered days are frozen and kept as-is — there is
      // one row per (subscription, date), so we never recreate them.
      const immutableDates = new Set(
        immutableDeliveries.map((d) => formatDateOnly(d.deliveryDate)),
      );

      for (const row of rows) {
        const iso = formatDateOnly(row.deliveryDate);
        if (immutableDates.has(iso)) continue;

        await tx.bentoDeliveryDay.create({
          data: {
            subscriptionId,
            deliveryDate: row.deliveryDate,
            includesLunch: row.includesLunch,
            includesDinner: row.includesDinner,
            lunchQty: row.lunchQty,
            dinnerQty: row.dinnerQty,
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
    // Surface a paid-but-stuck plan as ACTIVE in the member's plan list.
    await this.autoHealPendingSubscriptions(customerId);
    const rows = await this.prisma.bentoSubscription.findMany({
      where: {
        customerId,
        // Hide pre-launch test orders (sales reporting start date).
        ...this.reportingSettings.createdAtCutoffWhere(),
      },
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

  /** Promo codes apply to subscription plans only (not single-meal ONE_TIME). */
  private voucherPackageBlockReason(code: BentoPackageCode): string | null {
    return code === BentoPackageCode.ONE_TIME ? 'PACKAGE_NOT_ELIGIBLE' : null;
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
      lunchQty: number;
      dinnerQty: number;
      status: BentoDeliveryStatus;
    }>,
    rows: Array<{
      deliveryDate: Date;
      includesLunch: boolean;
      includesDinner: boolean;
      lunchQty: number;
      dinnerQty: number;
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
        row.includesDinner !== delivery.includesDinner ||
        row.lunchQty !== delivery.lunchQty ||
        row.dinnerQty !== delivery.dinnerQty
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
    options: { adminOverride?: boolean } = {},
    existingDeliveryDates: ReadonlySet<string> = new Set(),
  ): Array<{
    deliveryDate: Date;
    includesLunch: boolean;
    includesDinner: boolean;
    lunchQty: number;
    dinnerQty: number;
  }> {
    const rules = this.scheduleRulesInput();
    const earliest = rules.minSchedulableDate;
    const windowEnd = addDaysUtc(earliest, pkg.durationDays - 1);

    const byDate = new Map<string, { lunchQty: number; dinnerQty: number }>();

    for (const slot of slots) {
      // Quantity per meal; fall back to the legacy booleans (1 or 0).
      const slotLunch = slot.lunchQty ?? (slot.includeLunch ? 1 : 0);
      const slotDinner = slot.dinnerQty ?? (slot.includeDinner ? 1 : 0);
      if (slotLunch <= 0 && slotDinner <= 0) continue;

      const d = parseDateOnly(slot.date);

      // Admin override skips the time/closed-day gates so staff can fix
      // missed-cutoff and closed-day complaints; credit/meal-option checks
      // below still apply. Dates the plan already has a pickup on are likewise
      // exempt from the date gates — re-saving an existing/past pickup is not a
      // new booking, and locked days are preserved unchanged downstream.
      if (!options.adminOverride && !existingDeliveryDates.has(slot.date)) {
        if (d < earliest) {
          throw new BadRequestException({
            code: 'BENTO_SCHEDULE_TOO_SOON',
            message: `Pickup must be on or after ${formatDateOnly(earliest)}.`,
          });
        }
        if (d > windowEnd) {
          throw new BadRequestException({
            code: 'BENTO_DATE_OUT_OF_WINDOW',
            message: `Pickup date ${slot.date} is outside your scheduling window.`,
          });
        }
        const blockReason = schedulablePickupReason(d, rules);
        if (blockReason === 'weekday_closed') {
          throw new BadRequestException({
            code: 'BENTO_WEEKDAY_CLOSED',
            message: `${slot.date} is not available for pickup.`,
          });
        }
        if (blockReason === 'date_closed') {
          throw new BadRequestException({
            code: 'BENTO_DATE_CLOSED',
            message: `${slot.date} is closed for pickup.`,
          });
        }
        if (blockReason === 'too_soon') {
          throw new BadRequestException({
            code: 'BENTO_SCHEDULE_TOO_SOON',
            message: `Pickup must be on or after ${formatDateOnly(earliest)}.`,
          });
        }
      }

      if (mealOption === BentoMealOption.LUNCH && slotDinner > 0) {
        throw new BadRequestException({
          code: 'BENTO_LUNCH_ONLY',
          message: 'Your plan includes lunch only — dinner cannot be scheduled.',
        });
      }
      if (mealOption === BentoMealOption.DINNER && slotLunch > 0) {
        throw new BadRequestException({
          code: 'BENTO_DINNER_ONLY',
          message: 'Your plan includes dinner only — lunch cannot be scheduled.',
        });
      }

      const prev = byDate.get(slot.date) ?? { lunchQty: 0, dinnerQty: 0 };
      byDate.set(slot.date, {
        lunchQty: prev.lunchQty + slotLunch,
        dinnerQty: prev.dinnerQty + slotDinner,
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
      lunchUsed += row.lunchQty;
      dinnerUsed += row.dinnerQty;
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
      .map(([iso, q]) => ({
        deliveryDate: parseDateOnly(iso),
        includesLunch: q.lunchQty > 0,
        includesDinner: q.dinnerQty > 0,
        lunchQty: q.lunchQty,
        dinnerQty: q.dinnerQty,
      }));
  }

  private async assertDailyCapacity(
    subscriptionId: string,
    rows: Array<{
      deliveryDate: Date;
      includesLunch: boolean;
      includesDinner: boolean;
      lunchQty: number;
      dinnerQty: number;
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
          // Exclude pre-launch test orders (sales reporting start date).
          ...this.reportingSettings.createdAtCutoffWhere(),
        },
      },
      select: {
        includesLunch: true,
        includesDinner: true,
        lunchQty: true,
        dinnerQty: true,
      },
    });
    return deliveries.reduce((sum, d) => sum + packsInDeliveryRow(d), 0);
  }

  private async loadSavingsBaseline() {
    const oneTime = await this.prisma.bentoPackage.findUnique({
      where: { code: BentoPackageCode.ONE_TIME },
      select: {
        code: true,
        label: true,
        pricePerMealCents: true,
      },
    });
    if (oneTime) {
      return {
        pricePerMealCents: oneTime.pricePerMealCents,
        label: oneTime.label,
        packageCode: oneTime.code,
      };
    }
    return resolveSavingsBaseline([]);
  }

  private mapPackage(
    p: BentoPackage,
    baseline?: ReturnType<typeof resolveSavingsBaseline>,
  ) {
    const drinksAndSoupEnabled = this.bentoFeatures.drinksAndSoupEnabled();
    const includeFreeSoupAndDrinks =
      drinksAndSoupEnabled && p.includeFreeSoupAndDrinks;
    const savings = baseline
      ? computePackageListSavings(
          p.code,
          p.pricePerMealCents,
          p.mealCredits,
          baseline.pricePerMealCents,
        )
      : { savingsPerMealCents: 0, totalSavingsCents: 0 };
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
      savingsPerMealCents: savings.savingsPerMealCents,
      totalSavingsCents: savings.totalSavingsCents,
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
        lunchQty: number;
        dinnerQty: number;
        status: string;
      }>;
    },
  ) {
    const needsSchedule =
      s.status === BentoSubscriptionStatus.ACTIVE && s.deliveries.length === 0;

    const rules = this.scheduleRulesInput();
    const earliest = rules.minSchedulableDate;
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
        minLeadDays: resolveMinScheduleLeadDays(this.bentoSettings.getSettings()),
        earliestDate: formatDateOnly(earliest),
        windowEndDate: formatDateOnly(windowEnd),
        scheduleRules: buildScheduleRulesPayload(
          this.bentoSettings.getSettings(),
          this.bentoMenu.getConfig(),
        ),
        allowLunch: mealOpt !== BentoMealOption.DINNER,
        allowDinner: mealOpt !== BentoMealOption.LUNCH,
        lunchScheduled: s.deliveries.reduce((n, d) => n + d.lunchQty, 0),
        dinnerScheduled: s.deliveries.reduce((n, d) => n + d.dinnerQty, 0),
      },
      createdAt: s.createdAt.toISOString(),
      package: this.mapPackage(s.package),
      deliveries: s.deliveries.map((d) => ({
        id: d.id,
        deliveryDate: formatDateOnly(d.deliveryDate),
        includesLunch: d.includesLunch,
        includesDinner: d.includesDinner,
        lunchQty: d.lunchQty,
        dinnerQty: d.dinnerQty,
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
