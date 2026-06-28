import { BENTO_MENU } from './bento-menu.constants';
import type {
  BentoMenuConfig,
  BentoWeekdayCode,
} from './bento-menu.service';

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Bento service launch date. The weekly menu never displays a week earlier than
 * the week containing this date, so before launch the menu shows the launch
 * week (22–28 Jun 2026) instead of the current calendar week.
 */
export const BENTO_SERVICE_START_ISO = '2026-06-22';

/** Monday (UTC) of the week containing `ref`, as YYYY-MM-DD. */
export function weekStartMondayIso(ref = new Date()): string {
  const d = new Date(
    Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()),
  );
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return formatDateOnly(d);
}

export function formatDateOnly(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

export function parseDateOnly(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) throw new Error(`Invalid date: ${iso}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function addDaysUtc(d: Date, days: number): Date {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

type WeeklyMenuMeal = {
  title: string;
  /** @deprecated Generic set blurb; prefer dishDesc fields. */
  description: string;
  dish: string;
  dishVeg: string;
  dishZh: string;
  dishVegZh: string;
  dishDesc: string;
  dishDescZh: string;
  dishVegDesc: string;
  dishVegDescZh: string;
  image: string;
};

/**
 * Monday (UTC) of the first week shown to members: the current week, but never
 * earlier than the launch week. Used as the anchor for the multi-week menu.
 */
export function resolveBaseWeekStartIso(ref = new Date()): string {
  const launchWeekStart = weekStartMondayIso(
    parseDateOnly(BENTO_SERVICE_START_ISO),
  );
  const currentWeekStart = weekStartMondayIso(ref);
  return currentWeekStart < launchWeekStart ? launchWeekStart : currentWeekStart;
}

/** Number of consecutive weeks shown in the member app and editable in admin. */
export const BENTO_DISPLAY_WEEKS = 4;

/**
 * Monday ISO dates for the `count` consecutive weeks shown to members, starting
 * at the base week (week 1, week 2, …).
 */
export function displayWeekStartIsos(
  count = BENTO_DISPLAY_WEEKS,
  ref = new Date(),
): string[] {
  const base = parseDateOnly(resolveBaseWeekStartIso(ref));
  return Array.from({ length: count }, (_, i) =>
    formatDateOnly(addDaysUtc(base, i * 7)),
  );
}

/**
 * Builds a single week's menu (Mon–Sun) from the admin-managed config. When
 * `weekStartIso` is omitted it defaults to the base (current) week, never
 * earlier than the launch week. Callers pass the config from
 * `BentoMenuService.getConfig()`/`getWeekConfig()` which always returns all 7
 * days.
 */
export function buildWeeklyMenu(
  config?: BentoMenuConfig,
  minScheduleLeadDays = 2,
  weekStartIso?: string,
) {
  const weekStart = weekStartIso ?? resolveBaseWeekStartIso();
  const start = parseDateOnly(weekStart);
  const days: Array<{
    date: string;
    weekday: string;
    isSunday: boolean;
    closed: boolean;
    lunch: WeeklyMenuMeal;
    dinner: WeeklyMenuMeal;
  }> = [];

  const byDay = new Map<BentoWeekdayCode, BentoMenuConfig['weekdays'][number]>(
    (config?.weekdays ?? []).map((d) => [d.weekday, d]),
  );

  for (let i = 0; i < 7; i++) {
    const d = addDaysUtc(start, i);
    const iso = formatDateOnly(d);
    const wd = d.getUTCDay();
    const code = (WEEKDAY_NAMES[wd] ?? '') as BentoWeekdayCode;
    const cfg = byDay.get(code);
    const isSunday = wd === 0;
    const closed = cfg?.closed ?? false;
    days.push({
      date: iso,
      weekday: WEEKDAY_NAMES[wd] ?? '',
      isSunday,
      closed,
      lunch: {
        title: BENTO_MENU.lunch.title,
        description: '',
        dish: cfg?.lunch.regular ?? '',
        dishVeg: cfg?.lunch.veg ?? '',
        dishZh: cfg?.lunch.regularZh ?? '',
        dishVegZh: cfg?.lunch.vegZh ?? '',
        dishDesc: cfg?.lunch.regularDesc ?? '',
        dishDescZh: cfg?.lunch.regularDescZh ?? '',
        dishVegDesc: cfg?.lunch.vegDesc ?? '',
        dishVegDescZh: cfg?.lunch.vegDescZh ?? '',
        image: cfg?.lunch.image ?? '',
      },
      dinner: {
        title: BENTO_MENU.dinner.title,
        description: '',
        dish: cfg?.dinner.regular ?? '',
        dishVeg: cfg?.dinner.veg ?? '',
        dishZh: cfg?.dinner.regularZh ?? '',
        dishVegZh: cfg?.dinner.vegZh ?? '',
        dishDesc: cfg?.dinner.regularDesc ?? '',
        dishDescZh: cfg?.dinner.regularDescZh ?? '',
        dishVegDesc: cfg?.dinner.vegDesc ?? '',
        dishVegDescZh: cfg?.dinner.vegDescZh ?? '',
        image: cfg?.dinner.image ?? '',
      },
    });
  }

  return {
    weekStart,
    weekEnd: formatDateOnly(addDaysUtc(start, 6)),
    minScheduleLeadDays,
    days,
  };
}
