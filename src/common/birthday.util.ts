import { shopCalendarYmd } from '../bento/bento-shop-date.util';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Malaysia has no DST: local midnight is always 16:00 UTC the day before. */
const MYT_OFFSET_HOURS = 8;

/**
 * Days (0..365) until the customer's next birthday, computed in UTC.
 * Returns null when no birthday is recorded. 0 = birthday is today.
 */
export function daysUntilBirthdayUtc(birthday: Date | null): number | null {
  if (!birthday) return null;
  const now = new Date();
  const m = birthday.getUTCMonth();
  const d = birthday.getUTCDate();
  const y = now.getUTCFullYear();
  let next = Date.UTC(y, m, d);
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  if (next < todayUtc) {
    next = Date.UTC(y + 1, m, d);
  }
  return Math.round((next - todayUtc) / (24 * 60 * 60 * 1000));
}

/**
 * The member's next birthday on or after today, where "today" is the Malaysian
 * calendar date — the shop's business day — not the server's UTC date. A member
 * whose birthday is today is still in their window until tonight (MYT), even
 * when the server's UTC date has not caught up.
 *
 * The stored birthday is a date-only column, so only its month and day count;
 * the year is irrelevant.
 */
export function nextBirthday(
  birthday: Date,
  now: Date = new Date(),
): { year: number; month: number; day: number; daysUntil: number } {
  const [ty, tm, td] = shopCalendarYmd(now)
    .split('-')
    .map((n) => Number(n));
  const todayMs = Date.UTC(ty, tm - 1, td);
  const month = birthday.getUTCMonth();
  const day = birthday.getUTCDate();
  let year = ty;
  if (Date.UTC(year, month, day) < todayMs) year += 1;
  return {
    year,
    month,
    day,
    daysUntil: Math.round((Date.UTC(year, month, day) - todayMs) / DAY_MS),
  };
}

/**
 * When a birthday voucher stops being usable: the end of the Malaysian day that
 * is `validDaysAfter` days after the member's next birthday. The voucher is
 * usable from the moment it appears (up to 30 days before) until then.
 */
export function birthdayVoucherExpiry(
  birthday: Date,
  validDaysAfter: number,
  now: Date = new Date(),
): Date {
  const next = nextBirthday(birthday, now);
  const days = validDaysAfter > 0 ? validDaysAfter : 7;
  // 00:00 MYT on the day after the last valid day, minus one second.
  return new Date(
    Date.UTC(next.year, next.month, next.day + days + 1, -MYT_OFFSET_HOURS) -
      1000,
  );
}
