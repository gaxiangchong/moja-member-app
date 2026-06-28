import { Injectable } from '@nestjs/common';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

export type ReportingSettings = {
  /**
   * Sales reporting start date (YYYY-MM-DD) or null. When set, any charge dated
   * before this date is excluded from GMV / sales reports. Non-destructive —
   * no payment rows are deleted; clearing the date restores full history.
   */
  salesStartDate: string | null;
};

const DEFAULT_SETTINGS: ReportingSettings = {
  salesStartDate: null,
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a YYYY-MM-DD string into a UTC-midnight Date, or null if invalid. */
function parseIsoDateUtc(raw: unknown): Date | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!ISO_DATE_RE.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * File-backed store for global reporting preferences. Dependency-light (no
 * Prisma) and kept separate from the bento operations settings. Mirrors the
 * conventions of {@link BentoSettingsService}.
 */
@Injectable()
export class ReportingSettingsService {
  private filePath(): string {
    return resolve(process.cwd(), 'data', 'reporting-settings.json');
  }

  private normalize(input: unknown): ReportingSettings {
    const raw = (input ?? {}) as Partial<ReportingSettings>;
    const parsed = parseIsoDateUtc(raw.salesStartDate);
    return {
      salesStartDate: parsed ? raw.salesStartDate!.trim() : null,
    };
  }

  getSettings(): ReportingSettings {
    const p = this.filePath();
    if (!existsSync(p)) return { ...DEFAULT_SETTINGS };
    try {
      return this.normalize(JSON.parse(readFileSync(p, 'utf-8')));
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  setSettings(input: unknown): ReportingSettings {
    const next = this.normalize(input);
    mkdirSync(resolve(process.cwd(), 'data'), { recursive: true });
    writeFileSync(this.filePath(), JSON.stringify(next, null, 2), 'utf-8');
    return next;
  }

  /** The configured cutoff as a UTC-midnight Date, or null when not set. */
  getSalesStartDate(): Date | null {
    return parseIsoDateUtc(this.getSettings().salesStartDate);
  }

  /**
   * Prisma where-fragment that excludes records created before the sales start
   * date — used to treat pre-launch test orders as invalid/hidden. Returns an
   * empty object (no-op) when no cutoff is configured, so it is always safe to
   * spread into an existing `where`.
   */
  createdAtCutoffWhere(): { createdAt?: { gte: Date } } {
    const cutoff = this.getSalesStartDate();
    return cutoff ? { createdAt: { gte: cutoff } } : {};
  }
}
