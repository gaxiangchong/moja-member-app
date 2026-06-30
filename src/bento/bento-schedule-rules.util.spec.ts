import type { BentoMenuConfig } from './bento-menu.service';
import type { BentoSettings } from './bento-settings.service';
import {
  buildScheduleRulesInput,
  isSchedulablePickupDate,
  resolveMinSchedulableDate,
} from './bento-schedule-rules.util';
import { formatDateOnly, parseDateOnly } from './bento-weekly.util';

const MENU_ALL_OPEN: BentoMenuConfig = {
  weekdays: [
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
    'Sun',
  ].map((weekday) => ({
    weekday: weekday as BentoMenuConfig['weekdays'][number]['weekday'],
    closed: false,
    lunch: { regular: '', veg: '', regularZh: '', vegZh: '' },
    dinner: { regular: '', veg: '', regularZh: '', vegZh: '' },
  })),
};

const MENU_SUN_CLOSED: BentoMenuConfig = {
  weekdays: MENU_ALL_OPEN.weekdays.map((d) =>
    d.weekday === 'Sun' ? { ...d, closed: true } : d,
  ),
};

describe('bento-schedule-rules.util', () => {
  it('uses the later of lead days and service launch date', () => {
    const ref = parseDateOnly('2026-06-05');
    const settings: BentoSettings = {
      dailyCapacityPacks: 50,
      minScheduleLeadDays: 2,
      earliestPickupDate: '2026-06-09',
    };
    expect(formatDateOnly(resolveMinSchedulableDate(settings, ref))).toBe(
      '2026-06-09',
    );
  });

  it('allows tomorrow before the 6pm Malaysia cutoff (1-day lead, default)', () => {
    // No scheduleCutoffHour set → default 18 (6pm).
    const settings: BentoSettings = {
      dailyCapacityPacks: 50,
      minScheduleLeadDays: 1,
    };
    // 2026-06-10 17:30 MYT (= 09:30 UTC) — before 6pm → tomorrow bookable.
    const ref = new Date('2026-06-10T09:30:00Z');
    expect(formatDateOnly(resolveMinSchedulableDate(settings, ref))).toBe(
      '2026-06-11',
    );
  });

  it('pushes earliest to the day after once past the 6pm cutoff', () => {
    const settings: BentoSettings = {
      dailyCapacityPacks: 50,
      minScheduleLeadDays: 1,
      scheduleCutoffHour: 18,
    };
    // 2026-06-10 18:30 MYT (= 10:30 UTC) — past 6pm → day after tomorrow.
    const ref = new Date('2026-06-10T10:30:00Z');
    expect(formatDateOnly(resolveMinSchedulableDate(settings, ref))).toBe(
      '2026-06-12',
    );
  });

  it('uses Malaysia local day, not UTC, for the lead baseline', () => {
    const settings: BentoSettings = {
      dailyCapacityPacks: 50,
      minScheduleLeadDays: 1,
      scheduleCutoffHour: 18,
    };
    // 2026-06-10 17:00 UTC = 2026-06-11 01:00 MYT → local day is the 11th.
    const ref = new Date('2026-06-10T17:00:00Z');
    expect(formatDateOnly(resolveMinSchedulableDate(settings, ref))).toBe(
      '2026-06-12',
    );
  });

  it('respects admin closed weekdays from menu config', () => {
    const settings: BentoSettings = { dailyCapacityPacks: 50 };
    const rules = buildScheduleRulesInput(
      settings,
      MENU_SUN_CLOSED,
      parseDateOnly('2026-06-01'),
    );
    expect(isSchedulablePickupDate(parseDateOnly('2026-06-07'), rules)).toBe(
      false,
    );
    expect(isSchedulablePickupDate(parseDateOnly('2026-06-08'), rules)).toBe(
      true,
    );
  });

  it('blocks one-off closed dates from settings', () => {
    const settings: BentoSettings = {
      dailyCapacityPacks: 50,
      closedDates: ['2026-06-10'],
    };
    const rules = buildScheduleRulesInput(
      settings,
      MENU_ALL_OPEN,
      parseDateOnly('2026-06-01'),
    );
    expect(isSchedulablePickupDate(parseDateOnly('2026-06-10'), rules)).toBe(
      false,
    );
  });
});
