import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { BentoDeliveryStatus, BentoSubscriptionStatus } from '@prisma/client';
import { buildKitchenPickupId } from '../customers/kitchen-pickup-id.util';
import { PrismaService } from '../prisma/prisma.service';
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
  packageLabel: string;
  riceType: string;
};

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

@Injectable()
export class BentoOrdersReportService {
  constructor(private readonly prisma: PrismaService) {}

  /** Default export window: Monday this week through 8 weeks ahead. */
  defaultRange(): { from: string; to: string } {
    const from = weekStartMondayIso();
    const to = formatDateOnly(addDaysUtc(parseDateOnly(from), 7 * 8 - 1));
    return { from, to };
  }

  async getCounts(fromIso: string, toIso: string): Promise<{
    from: string;
    to: string;
    daily: BentoDailyOrderCount[];
    weekly: BentoWeeklyOrderCount[];
    kitchen: BentoKitchenPackRow[];
  }> {
    const from = parseDateOnly(fromIso);
    const to = parseDateOnly(toIso);
    if (from > to) {
      return { from: fromIso, to: toIso, daily: [], weekly: [], kitchen: [] };
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
        },
      },
      select: {
        deliveryDate: true,
        includesLunch: true,
        includesDinner: true,
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
      const pickupId = buildKitchenPickupId(customer.email, customer.phoneE164);
      const customerName = customer.displayName?.trim() || '—';
      const email = customer.email?.trim() || '—';
      const packageLabel = row.subscription.package.label;
      const riceType =
        row.subscription.riceType === 'BROWN' ? 'Brown rice' : 'White rice';

      const pushKitchen = (meal: 'Lunch' | 'Dinner', diet: string) => {
        kitchen.push({
          date: iso,
          weekday,
          pickupId,
          customerName,
          email,
          phoneE164: customer.phoneE164,
          meal,
          diet,
          packageLabel,
          riceType,
        });
      };

      if (row.includesLunch) {
        cur.lunch++;
        pushKitchen(
          'Lunch',
          row.subscription.lunchVariant === 'VEG' ? 'Vegetarian' : 'Regular',
        );
      }
      if (row.includesDinner) {
        cur.dinner++;
        pushKitchen(
          'Dinner',
          row.subscription.dinnerVariant === 'VEG' ? 'Vegetarian' : 'Regular',
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

    return { from: fromIso, to: toIso, daily, weekly, kitchen };
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
      { width: 12 },
      { width: 24 },
      { width: 12 },
    ];

    const buf = await wb.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(buf),
      filename: `bento-meal-orders_${report.from}_${report.to}.xlsx`,
    };
  }
}
