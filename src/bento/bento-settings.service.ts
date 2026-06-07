import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

export type BentoSettings = {
  /** Max lunch + dinner packs that can be scheduled per calendar day (all customers). */
  dailyCapacityPacks: number;
  /** When true, block all new bento purchases regardless of capacity math. */
  blockNewOrders?: boolean;
};

export const DEFAULT_BENTO_DAILY_CAPACITY_PACKS = 50;

const DEFAULT_SETTINGS: BentoSettings = {
  dailyCapacityPacks: DEFAULT_BENTO_DAILY_CAPACITY_PACKS,
  blockNewOrders: false,
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
    return { dailyCapacityPacks, blockNewOrders };
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
