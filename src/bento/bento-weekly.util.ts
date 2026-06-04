import { BENTO_MENU } from './bento-menu.constants';

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

export function buildWeeklyMenu() {
  const weekStart = weekStartMondayIso();
  const start = parseDateOnly(weekStart);
  const days: Array<{
    date: string;
    weekday: string;
    isSunday: boolean;
    lunch: { title: string; description: string; dish: string };
    dinner: { title: string; description: string; dish: string };
  }> = [];

  const lunchDishes = [
    'Teriyaki chicken bento',
    'Sambal fish bento',
    'Vegetable curry bento',
    'Beef rendang bento',
    'Honey soy tofu bento',
    'Grilled salmon bento',
  ];
  const dinnerDishes = [
    'Tom yum soup set',
    'Miso salmon soup set',
    'Vegetable broth set',
    'Chicken corn soup set',
    'Laksa-inspired soup set',
    'Mushroom soup set',
  ];

  for (let i = 0; i < 7; i++) {
    const d = addDaysUtc(start, i);
    const iso = formatDateOnly(d);
    const wd = d.getUTCDay();
    days.push({
      date: iso,
      weekday: WEEKDAY_NAMES[wd] ?? '',
      isSunday: wd === 0,
      lunch: {
        title: BENTO_MENU.lunch.title,
        description: BENTO_MENU.lunch.description,
        dish: lunchDishes[i % lunchDishes.length]!,
      },
      dinner: {
        title: BENTO_MENU.dinner.title,
        description: BENTO_MENU.dinner.description,
        dish: dinnerDishes[i % dinnerDishes.length]!,
      },
    });
  }

  return {
    weekStart,
    weekEnd: formatDateOnly(addDaysUtc(start, 6)),
    minScheduleLeadDays: 2,
    days,
  };
}
