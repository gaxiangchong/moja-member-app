import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PrismaService } from '../prisma/prisma.service';
import {
  normalizeClosedDates,
  normalizeIsoDateOnly,
} from './bento-schedule-rules.util';

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

/** Row key in the `app_settings` table. */
const SETTINGS_KEY = 'bento_settings';

@Injectable()
export class BentoSettingsService implements OnModuleInit {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private readonly logger = new Logger(BentoSettingsService.name);

  /**
   * In-memory copy so {@link getSettings} can stay synchronous (it is called
   * from many sync code paths). The database is the source of truth; this cache
   * is refreshed on write and lazily re-read after a short TTL so a change made
   * on one app instance propagates to the others within ~TTL.
   */
  private cache: BentoSettings = { ...DEFAULT_SETTINGS };
  private cacheLoadedAt = 0;
  private refreshing = false;
  private static readonly CACHE_TTL_MS = 10_000;

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  private normalize(input: unknown): BentoSettings {
    const raw = (input ?? {}) as Partial<BentoSettings>;
    const fromStore = Number(raw.dailyCapacityPacks);
    const dailyCapacityPacks =
      Number.isFinite(fromStore) && fromStore > 0
        ? Math.min(Math.floor(fromStore), 10_000)
        : DEFAULT_SETTINGS.dailyCapacityPacks;
    const blockNewOrders =
      typeof raw.blockNewOrders === 'boolean'
        ? raw.blockNewOrders
        : (DEFAULT_SETTINGS.blockNewOrders ?? false);
    const earliestPickupDate = normalizeIsoDateOnly(raw.earliestPickupDate);
    const leadRaw = Number(raw.minScheduleLeadDays);
    const minScheduleLeadDays =
      Number.isFinite(leadRaw) && leadRaw >= 0
        ? Math.min(Math.floor(leadRaw), 30)
        : (DEFAULT_SETTINGS.minScheduleLeadDays ?? 1);
    const cutoffRaw = Number(raw.scheduleCutoffHour);
    const scheduleCutoffHour =
      Number.isFinite(cutoffRaw) && cutoffRaw >= 0 && cutoffRaw <= 23
        ? Math.floor(cutoffRaw)
        : (DEFAULT_SETTINGS.scheduleCutoffHour ?? 18);
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

  /** Legacy `data/bento-settings.json`, read once to seed the DB on migration. */
  private readLegacyFile(): BentoSettings | null {
    const p = resolve(process.cwd(), 'data', 'bento-settings.json');
    if (!existsSync(p)) return null;
    try {
      return this.normalize(JSON.parse(readFileSync(p, 'utf-8')));
    } catch {
      return null;
    }
  }

  /** Read the DB row into the cache. Seeds from the legacy file when empty. */
  private async refresh(): Promise<void> {
    try {
      const row = await this.prisma.appSetting.findUnique({
        where: { key: SETTINGS_KEY },
      });
      if (row) {
        this.cache = this.normalize(row.value);
      } else {
        // First run on this database: migrate the local file if present so an
        // existing deployment keeps its configured values, then persist it.
        const legacy = this.readLegacyFile();
        this.cache = legacy ?? { ...DEFAULT_SETTINGS };
        if (legacy) await this.persist(legacy);
      }
      this.cacheLoadedAt = Date.now();
    } catch (err) {
      // Never block startup or a request on a settings read; keep the last
      // known cache (or defaults) and try again on the next tick.
      this.logger.warn(
        `Failed to load bento settings from database: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** Fire-and-forget re-read when the cache is older than the TTL. */
  private maybeRefresh(): void {
    if (this.refreshing) return;
    if (Date.now() - this.cacheLoadedAt < BentoSettingsService.CACHE_TTL_MS) {
      return;
    }
    this.refreshing = true;
    void this.refresh().finally(() => {
      this.refreshing = false;
    });
  }

  private async persist(settings: BentoSettings): Promise<void> {
    const value = settings as unknown as Prisma.InputJsonValue;
    await this.prisma.appSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, value },
      update: { value },
    });
  }

  getSettings(): BentoSettings {
    this.maybeRefresh();
    // Return a copy so callers can't mutate the shared cache.
    return { ...this.cache, closedDates: [...(this.cache.closedDates ?? [])] };
  }

  async setSettings(input: unknown): Promise<BentoSettings> {
    const next = this.normalize(input);
    await this.persist(next);
    // Update the local cache immediately so the writing instance reflects the
    // change without waiting for the next TTL refresh.
    this.cache = next;
    this.cacheLoadedAt = Date.now();
    return next;
  }

  /** Env `BENTO_DAILY_CAPACITY_PACKS` overrides the stored value when set to a positive integer. */
  getDailyCapacityPacks(): number {
    const envRaw = this.config
      .get<string>('BENTO_DAILY_CAPACITY_PACKS')
      ?.trim();
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
