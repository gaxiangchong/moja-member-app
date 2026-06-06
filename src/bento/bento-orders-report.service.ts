import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { BentoDeliveryStatus, BentoSubscriptionStatus } from '@prisma/client';
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
  }> {
    const from = parseDateOnly(fromIso);
    const to = parseDateOnly(toIso);
    if (from > to) {
      return { from: fromIso, to: toIso, daily: [], weekly: [] };
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
      },
    });

    const dailyMap = new Map<string, { lunch: number; dinner: number }>();
    for (const row of rows) {
      const iso = formatDateOnly(row.deliveryDate);
      const cur = dailyMap.get(iso) ?? { lunch: 0, dinner: 0 };
      if (row.includesLunch) cur.lunch++;
      if (row.includesDinner) cur.dinner++;
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

    return { from: fromIso, to: toIso, daily, weekly };
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

    const buf = await wb.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(buf),
      filename: `bento-meal-orders_${report.from}_${report.to}.xlsx`,
    };
  }
}
