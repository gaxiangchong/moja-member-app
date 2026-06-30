import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

import { normalizeClosedDates, normalizeIsoDateOnly } from './bento-schedule-rules.util';

export type BentoSettings = {
  /** Max lunch + dinner packs that can be scheduled per calendar day (all customers). */
  dailyCapacityPacks: number;
  /** When true, block all new bento purchases regardless of capacity math. */
  blockNewOrders?: boolean;
  /** Service launch — no pickups before this calendar date (YYYY-MM-DD). */
  earliestPickupDate?: string | null;
  /** Days after today before the first pickup may be scheduled. */
  minScheduleLeadDays?: number;
  /**
   * Daily order cutoff hour (0–23, kitchen-local time). Past this hour the
   * nearest lead day is no longer bookable. Default 18 (6pm).
   */
  scheduleCutoffHour?: number;
  /** Extra closed dates (public holidays, etc.) — YYYY-MM-DD. */
  closedDates?: string[];
};

export const DEFAULT_BENTO_DAILY_CAPACITY_PACKS = 50;

const DEFAULT_SETTINGS: BentoSettings = {
  dailyCapacityPacks: DEFAULT_BENTO_DAILY_CAPACITY_PACKS,
  blockNewOrders: false,
  earliestPickupDate: null,
  minScheduleLeadDays: 1,
  scheduleCutoffHour: 18,
  closedDates: [],
};

@Injectable()
export class BentoSettingsService {
  constructor(private readonly config: ConfigService) {}

  private filePath(): string {
    return resolve(process.cwd(), 'data', 'bento-settings.json');
  }

  private normalize(input: unknown): BentoSettings {
    const raw = (input ?? {}) as Partial<BentoSettings>;
    const fromFile = Number(raw.dailyCapacityPacks);
    const dailyCapacityPacks =
      Number.isFinite(fromFile) && fromFile > 0
        ? Math.min(Math.floor(fromFile), 10_000)
        : DEFAULT_SETTINGS.dailyCapacityPacks;
    const blockNewOrders =
      typeof raw.blockNewOrders === 'boolean'
        ? raw.blockNewOrders
        : DEFAULT_SETTINGS.blockNewOrders ?? false;
    const earliestPickupDate = normalizeIsoDateOnly(raw.earliestPickupDate);
    const leadRaw = Number(raw.minScheduleLeadDays);
    const minScheduleLeadDays =
      Number.isFinite(leadRaw) && leadRaw >= 0
        ? Math.min(Math.floor(leadRaw), 30)
        : DEFAULT_SETTINGS.minScheduleLeadDays ?? 1;
    const cutoffRaw = Number(raw.scheduleCutoffHour);
    const scheduleCutoffHour =
      Number.isFinite(cutoffRaw) && cutoffRaw >= 0 && cutoffRaw <= 23
        ? Math.floor(cutoffRaw)
        : DEFAULT_SETTINGS.scheduleCutoffHour ?? 18;
    const closedDates = normalizeClosedDates(raw.closedDates);
    return {
      dailyCapacityPacks,
      blockNewOrders,
      earliestPickupDate,
      minScheduleLeadDays,
      scheduleCutoffHour,
      closedDates,
    };
  }

  getSettings(): BentoSettings {
    const p = this.filePath();
    if (!existsSync(p)) return { ...DEFAULT_SETTINGS };
    try {
      return this.normalize(JSON.parse(readFileSync(p, 'utf-8')));
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  setSettings(input: unknown): BentoSettings {
    const next = this.normalize(input);
    mkdirSync(resolve(process.cwd(), 'data'), { recursive: true });
    writeFileSync(this.filePath(), JSON.stringify(next, null, 2), 'utf-8');
    return next;
  }

  /** Env `BENTO_DAILY_CAPACITY_PACKS` overrides the file when set to a positive integer. */
  getDailyCapacityPacks(): number {
    const envRaw = this.config.get<string>('BENTO_DAILY_CAPACITY_PACKS')?.trim();
    if (envRaw) {
      const n = Number(envRaw);
      if (Number.isFinite(n) && n > 0) {
        return Math.min(Math.floor(n), 10_000);
      }
    }
    return this.getSettings().dailyCapacityPacks;
  }

  getBlockNewOrders(): boolean {
    return this.getSettings().blockNewOrders ?? false;
  }
}
