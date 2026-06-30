import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { BentoDeliveryStatus, BentoSubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportingSettingsService } from '../admin/reporting-settings.service';
import {
  addDaysUtc,
  formatDateOnly,
  parseDateOnly,
  weekStartMondayIso,
} from './bento-weekly.util';

export type BentoDailyOrderCount = {
  date: string;
  weekday: string;
  lunchSets: number;
  dinnerSets: number;
  totalSets: number;
};

export type BentoWeeklyOrderCount = {
  weekStart: string;
  weekEnd: string;
  lunchSets: number;
  dinnerSets: number;
  totalSets: number;
};

export type BentoKitchenPackRow = {
  date: string;
  weekday: string;
  pickupId: string;
  customerName: string;
  email: string;
  phoneE164: string;
  meal: 'Lunch' | 'Dinner';
  diet: string;
  /** Number of packs of this meal for this customer on this day (>=1). */
  qty: number;
  packageLabel: string;
  riceType: string;
};

/**
 * A member who has bought an active plan but has not scheduled any pickup days
 * yet — the admin's "to chase" list for a WhatsApp reminder.
 */
export type BentoAwaitingScheduleRow = {
  subscriptionId: string;
  customerName: string;
  email: string;
  phoneE164: string;
  pickupId: string;
  packageLabel: string;
  mealOption: string;
  mealCredits: number;
  purchasedAt: string;
};

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

@Injectable()
export class BentoOrdersReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportingSettings: ReportingSettingsService,
  ) {}

  /** Default export window: Monday this week through 8 weeks ahead. */
  defaultRange(): { from: string; to: string } {
    const from = weekStartMondayIso();
    const to = formatDateOnly(addDaysUtc(parseDateOnly(from), 7 * 8 - 1));
    return { from, to };
  }

  /**
   * Active subscriptions that have no scheduled pickup days yet. Matches the
   * member-app definition of "awaiting schedule" (ACTIVE + deliveries none).
   */
  async getAwaitingSchedule(): Promise<BentoAwaitingScheduleRow[]> {
    const subs = await this.prisma.bentoSubscription.findMany({
      where: {
        status: BentoSubscriptionStatus.ACTIVE,
        deliveries: { none: {} },
        // Exclude pre-launch test orders (sales reporting start date).
        ...this.reportingSettings.createdAtCutoffWhere(),
      },
      select: {
        id: true,
        mealOption: true,
        mealCreditsTotal: true,
        createdAt: true,
        customer: {
          select: {
            displayName: true,
            email: true,
            phoneE164: true,
            kitchenPickupCode: true,
          },
        },
        package: { select: { label: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const mealOptionLabel: Record<string, string> = {
      LUNCH: 'Lunch',
      DINNER: 'Dinner',
      BOTH: 'Lunch + Dinner',
    };

    return subs.map((s) => ({
      subscriptionId: s.id,
      customerName: s.customer.displayName?.trim() || '—',
      email: s.customer.email?.trim() || '—',
      phoneE164: s.customer.phoneE164,
      pickupId: s.customer.kitchenPickupCode?.trim() || '—',
      packageLabel: s.package.label,
      mealOption: mealOptionLabel[s.mealOption] ?? s.mealOption,
      mealCredits: s.mealCreditsTotal,
      purchasedAt: formatDateOnly(s.createdAt),
    }));
  }

  async getCounts(fromIso: string, toIso: string): Promise<{
    from: string;
    to: string;
    daily: BentoDailyOrderCount[];
    weekly: BentoWeeklyOrderCount[];
    kitchen: BentoKitchenPackRow[];
    awaitingSchedule: BentoAwaitingScheduleRow[];
  }> {
    const from = parseDateOnly(fromIso);
    const to = parseDateOnly(toIso);
    const awaitingSchedule = await this.getAwaitingSchedule();
    if (from > to) {
      return {
        from: fromIso,
        to: toIso,
        daily: [],
        weekly: [],
        kitchen: [],
        awaitingSchedule,
      };
    }

    const rows = await this.prisma.bentoDeliveryDay.findMany({
      where: {
        deliveryDate: { gte: from, lte: to },
        status: {
          in: [BentoDeliveryStatus.SCHEDULED, BentoDeliveryStatus.DELIVERED],
        },
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
        subscription: {
          select: {
            mealOption: true,
            lunchVariant: true,
            dinnerVariant: true,
            riceType: true,
            customer: {
              select: {
                displayName: true,
                email: true,
                phoneE164: true,
                kitchenPickupCode: true,
              },
            },
            package: {
              select: { label: true },
            },
          },
        },
      },
      orderBy: [{ deliveryDate: 'asc' }],
    });

    const dailyMap = new Map<string, { lunch: number; dinner: number }>();
    const kitchen: BentoKitchenPackRow[] = [];

    for (const row of rows) {
      const iso = formatDateOnly(row.deliveryDate);
      const weekday = WEEKDAY_NAMES[row.deliveryDate.getUTCDay()] ?? '';
      const cur = dailyMap.get(iso) ?? { lunch: 0, dinner: 0 };
      const customer = row.subscription.customer;
      const pickupId = customer.kitchenPickupCode?.trim() || '—';
      const customerName = customer.displayName?.trim() || '—';
      const email = customer.email?.trim() || '—';
      const packageLabel = row.subscription.package.label;
      const riceType =
        row.subscription.riceType === 'BROWN' ? 'Brown rice' : 'White rice';

      const lunchQty = row.lunchQty || (row.includesLunch ? 1 : 0);
      const dinnerQty = row.dinnerQty || (row.includesDinner ? 1 : 0);

      const pushKitchen = (meal: 'Lunch' | 'Dinner', diet: string, qty: number) => {
        kitchen.push({
          date: iso,
          weekday,
          pickupId,
          customerName,
          email,
          phoneE164: customer.phoneE164,
          meal,
          diet,
          qty,
          packageLabel,
          riceType,
        });
      };

      if (lunchQty > 0) {
        cur.lunch += lunchQty;
        pushKitchen(
          'Lunch',
          row.subscription.lunchVariant === 'VEG' ? 'Vegetarian' : 'Regular',
          lunchQty,
        );
      }
      if (dinnerQty > 0) {
        cur.dinner += dinnerQty;
        pushKitchen(
          'Dinner',
          row.subscription.dinnerVariant === 'VEG' ? 'Vegetarian' : 'Regular',
          dinnerQty,
        );
      }
      dailyMap.set(iso, cur);
    }

    const daily: BentoDailyOrderCount[] = [];
    let cur = from;
    while (cur <= to) {
      const iso = formatDateOnly(cur);
      const counts = dailyMap.get(iso) ?? { lunch: 0, dinner: 0 };
      daily.push({
        date: iso,
        weekday: WEEKDAY_NAMES[cur.getUTCDay()] ?? '',
        lunchSets: counts.lunch,
        dinnerSets: counts.dinner,
        totalSets: counts.lunch + counts.dinner,
      });
      cur = addDaysUtc(cur, 1);
    }

    const weeklyMap = new Map<
      string,
      { lunch: number; dinner: number; weekEnd: string }
    >();
    for (const day of daily) {
      const weekStart = weekStartMondayIso(parseDateOnly(day.date));
      const weekEnd = formatDateOnly(addDaysUtc(parseDateOnly(weekStart), 6));
      const curW = weeklyMap.get(weekStart) ?? {
        lunch: 0,
        dinner: 0,
        weekEnd,
      };
      curW.lunch += day.lunchSets;
      curW.dinner += day.dinnerSets;
      weeklyMap.set(weekStart, curW);
    }

    const weekly: BentoWeeklyOrderCount[] = [...weeklyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, counts]) => ({
        weekStart,
        weekEnd: counts.weekEnd,
        lunchSets: counts.lunch,
        dinnerSets: counts.dinner,
        totalSets: counts.lunch + counts.dinner,
      }));

    return { from: fromIso, to: toIso, daily, weekly, kitchen, awaitingSchedule };
  }

  async exportXlsx(
    fromIso: string,
    toIso: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const report = await this.getCounts(fromIso, toIso);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Moja Admin';
    wb.created = new Date();

    const dailySheet = wb.addWorksheet('Daily');
    dailySheet.addRow([
      'Date',
      'Weekday',
      'Lunch sets',
      'Dinner sets',
      'Total sets',
    ]);
    for (const row of report.daily) {
      dailySheet.addRow([
        row.date,
        row.weekday,
        row.lunchSets,
        row.dinnerSets,
        row.totalSets,
      ]);
    }
    dailySheet.getRow(1).font = { bold: true };
    dailySheet.columns = [
      { width: 14 },
      { width: 10 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
    ];

    const weeklySheet = wb.addWorksheet('Weekly');
    weeklySheet.addRow([
      'Week start',
      'Week end',
      'Lunch sets',
      'Dinner sets',
      'Total sets',
    ]);
    for (const row of report.weekly) {
      weeklySheet.addRow([
        row.weekStart,
        row.weekEnd,
        row.lunchSets,
        row.dinnerSets,
        row.totalSets,
      ]);
    }
    weeklySheet.getRow(1).font = { bold: true };
    weeklySheet.columns = [
      { width: 14 },
      { width: 14 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
    ];

    const kitchenSheet = wb.addWorksheet('Kitchen pack list');
    kitchenSheet.addRow([
      'Date',
      'Weekday',
      'Pickup ID',
      'Customer name',
      'Email',
      'Phone',
      'Meal',
      'Qty',
      'Diet',
      'Package',
      'Rice',
    ]);
    for (const row of report.kitchen) {
      kitchenSheet.addRow([
        row.date,
        row.weekday,
        row.pickupId,
        row.customerName,
        row.email,
        row.phoneE164,
        row.meal,
        row.qty,
        row.diet,
        row.packageLabel,
        row.riceType,
      ]);
    }
    kitchenSheet.getRow(1).font = { bold: true };
    kitchenSheet.columns = [
      { width: 14 },
      { width: 10 },
      { width: 12 },
      { width: 22 },
      { width: 28 },
      { width: 16 },
      { width: 10 },
      { width: 6 },
      { width: 12 },
      { width: 24 },
      { width: 12 },
    ];

    const awaitingSheet = wb.addWorksheet('Awaiting scheduling');
    awaitingSheet.addRow([
      'Customer name',
      'Phone',
      'Pickup ID',
      'Package',
      'Meals',
      'Meal credits',
      'Purchased on',
      'Email',
    ]);
    for (const row of report.awaitingSchedule) {
      awaitingSheet.addRow([
        row.customerName,
        row.phoneE164,
        row.pickupId,
        row.packageLabel,
        row.mealOption,
        row.mealCredits,
        row.purchasedAt,
        row.email,
      ]);
    }
    awaitingSheet.getRow(1).font = { bold: true };
    awaitingSheet.columns = [
      { width: 22 },
      { width: 16 },
      { width: 12 },
      { width: 24 },
      { width: 16 },
      { width: 13 },
      { width: 14 },
      { width: 28 },
    ];

    const buf = await wb.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(buf),
      filename: `bento-meal-orders_${report.from}_${report.to}.xlsx`,
    };
  }
}
