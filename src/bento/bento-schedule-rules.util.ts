import type { BentoMenuConfig, BentoWeekdayCode } from './bento-menu.service';
import type { BentoSettings } from './bento-settings.service';
import { BENTO_MIN_SCHEDULE_LEAD_DAYS } from './bento-schedule.constants';
import { addDaysUtc, formatDateOnly, parseDateOnly } from './bento-weekly.util';

const WEEKDAY_CODE_TO_UTC: Record<BentoWeekdayCode, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type BentoScheduleRulesPayload = {
  minScheduleLeadDays: number;
  earliestPickupDate: string | null;
  earliestSchedulableDate: string;
  /** UTC weekday indices (0 = Sun … 6 = Sat) with no pickup. */
  closedWeekdays: number[];
  /** One-off closed calendar dates (YYYY-MM-DD). */
  closedDates: string[];
};

export type BentoScheduleRulesInput = {
  minSchedulableDate: Date;
  closedWeekdayUtc: ReadonlySet<number>;
  closedDates: ReadonlySet<string>;
};

export function normalizeIsoDateOnly(
  raw: string | null | undefined,
): string | null {
  const trimmed = raw?.trim();
  if (!trimmed || !ISO_DATE_RE.test(trimmed)) return null;
  try {
    return formatDateOnly(parseDateOnly(trimmed));
  } catch {
    return null;
  }
}

export function normalizeClosedDates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const iso = normalizeIsoDateOnly(item);
    if (iso && !out.includes(iso)) out.push(iso);
  }
  return out.sort();
}

export function closedWeekdaysFromMenu(menu: BentoMenuConfig): number[] {
  const closed = new Set<number>();
  for (const row of menu.weekdays) {
    if (row.closed) closed.add(WEEKDAY_CODE_TO_UTC[row.weekday]);
  }
  return [...closed].sort((a, b) => a - b);
}

export function resolveMinScheduleLeadDays(settings: BentoSettings): number {
  const raw = settings.minScheduleLeadDays;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return Math.min(Math.floor(raw), 30);
  }
  return BENTO_MIN_SCHEDULE_LEAD_DAYS;
}

export function startOfUtcDay(ref = new Date()): Date {
  return new Date(
    Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()),
  );
}

/** Earliest calendar day a member may schedule: max(today + lead, service launch). */
export function resolveMinSchedulableDate(
  settings: BentoSettings,
  ref = new Date(),
): Date {
  const today = startOfUtcDay(ref);
  const leadDays = resolveMinScheduleLeadDays(settings);
  const fromLead = addDaysUtc(today, leadDays);
  const launchIso = normalizeIsoDateOnly(settings.earliestPickupDate ?? null);
  if (!launchIso) return fromLead;
  const launch = parseDateOnly(launchIso);
  return fromLead > launch ? fromLead : launch;
}

export function buildScheduleRulesInput(
  settings: BentoSettings,
  menu: BentoMenuConfig,
  ref = new Date(),
): BentoScheduleRulesInput {
  return {
    minSchedulableDate: resolveMinSchedulableDate(settings, ref),
    closedWeekdayUtc: new Set(closedWeekdaysFromMenu(menu)),
    closedDates: new Set(normalizeClosedDates(settings.closedDates)),
  };
}

export function buildScheduleRulesPayload(
  settings: BentoSettings,
  menu: BentoMenuConfig,
  ref = new Date(),
): BentoScheduleRulesPayload {
  const input = buildScheduleRulesInput(settings, menu, ref);
  return {
    minScheduleLeadDays: resolveMinScheduleLeadDays(settings),
    earliestPickupDate: normalizeIsoDateOnly(settings.earliestPickupDate ?? null),
    earliestSchedulableDate: formatDateOnly(input.minSchedulableDate),
    closedWeekdays: [...input.closedWeekdayUtc].sort((a, b) => a - b),
    closedDates: [...input.closedDates].sort(),
  };
}

export function isSchedulablePickupDate(
  date: Date,
  rules: BentoScheduleRulesInput,
): boolean {
  if (date < rules.minSchedulableDate) return false;
  const iso = formatDateOnly(date);
  if (rules.closedDates.has(iso)) return false;
  if (rules.closedWeekdayUtc.has(date.getUTCDay())) return false;
  return true;
}

export function schedulablePickupReason(
  date: Date,
  rules: BentoScheduleRulesInput,
): 'too_soon' | 'weekday_closed' | 'date_closed' | null {
  if (date < rules.minSchedulableDate) return 'too_soon';
  const iso = formatDateOnly(date);
  if (rules.closedDates.has(iso)) return 'date_closed';
  if (rules.closedWeekdayUtc.has(date.getUTCDay())) return 'weekday_closed';
  return null;
}
