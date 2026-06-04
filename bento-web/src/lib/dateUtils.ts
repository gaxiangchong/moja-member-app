/** UTC date helpers for bento calendar (YYYY-MM-DD). */

export const BENTO_MIN_SCHEDULE_LEAD_DAYS = 2;

export function parseDateOnly(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export function formatDateOnly(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

export function addDaysUtc(d: Date, days: number): Date {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Earliest pickup date (today + lead days). */
export function earliestSchedulableDateIso(leadDays = BENTO_MIN_SCHEDULE_LEAD_DAYS): string {
  return formatDateOnly(addDaysUtc(todayUtc(), leadDays));
}

export function isSunday(iso: string): boolean {
  return parseDateOnly(iso).getUTCDay() === 0;
}

export function isDateSchedulable(iso: string, leadDays = BENTO_MIN_SCHEDULE_LEAD_DAYS): boolean {
  if (isSunday(iso)) return false;
  const min = parseDateOnly(earliestSchedulableDateIso(leadDays));
  return parseDateOnly(iso) >= min;
}

export function nextMondayIso(from = new Date()): string {
  const d = new Date(
    Date.UTC(from.getUTCFullYear(), from.getMonth(), from.getDate()),
  );
  const day = d.getUTCDay();
  const offset = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  if (offset > 0) d.setUTCDate(d.getUTCDate() + offset);
  return formatDateOnly(d);
}

export function windowDates(startIso: string, durationDays: number): string[] {
  const start = parseDateOnly(startIso);
  const out: string[] = [];
  for (let i = 0; i < durationDays; i++) {
    out.push(formatDateOnly(addDaysUtc(start, i)));
  }
  return out;
}

export function weekdayLabel(iso: string): string {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return names[parseDateOnly(iso).getUTCDay()] ?? '';
}

export function schedulableWindowDates(
  earliestIso: string,
  windowEndIso: string,
): string[] {
  const out: string[] = [];
  let cur = parseDateOnly(earliestIso);
  const end = parseDateOnly(windowEndIso);
  while (cur <= end) {
    out.push(formatDateOnly(cur));
    cur = addDaysUtc(cur, 1);
  }
  return out;
}

export function filterMonFri(dates: string[]): string[] {
  return dates.filter((d) => {
    const wd = parseDateOnly(d).getUTCDay();
    return wd >= 1 && wd <= 5;
  });
}

export function filterMonSat(dates: string[]): string[] {
  return dates.filter((d) => parseDateOnly(d).getUTCDay() !== 0);
}

export function availableDatesInWindow(startIso: string, durationDays: number): string[] {
  return windowDates(startIso, durationDays).filter((d) => !isSunday(d));
}
