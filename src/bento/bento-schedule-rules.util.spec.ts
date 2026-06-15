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
