import {
  buildRemainingByDate,
  evaluatePurchaseCapacity,
  sumRemainingInWindow,
} from './bento-purchase-capacity.util';
import { buildScheduleRulesInput } from './bento-schedule-rules.util';
import type { BentoMenuConfig } from './bento-menu.service';
import { addDaysUtc, formatDateOnly, parseDateOnly } from './bento-weekly.util';

const MENU_SUN_CLOSED: BentoMenuConfig = {
  weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((weekday) => ({
    weekday: weekday as BentoMenuConfig['weekdays'][number]['weekday'],
    closed: weekday === 'Sun',
    lunch: { regular: '', veg: '', regularZh: '', vegZh: '' },
    dinner: { regular: '', veg: '', regularZh: '', vegZh: '' },
  })),
};

describe('bento-purchase-capacity.util', () => {
  it('sums remaining packs excluding closed weekdays', () => {
    const start = parseDateOnly('2026-06-03');
    const remaining = new Map<string, number>([
      ['2026-06-03', 5],
      ['2026-06-04', 10],
      ['2026-06-07', 50],
    ]);
    const rules = buildScheduleRulesInput(
      { dailyCapacityPacks: 50 },
      MENU_SUN_CLOSED,
      parseDateOnly('2026-06-01'),
    );
    expect(sumRemainingInWindow(start, 5, remaining, rules)).toBe(15);
  });

  it('detects when current window lacks capacity and finds next window', () => {
    const rules = buildScheduleRulesInput(
      { dailyCapacityPacks: 50, minScheduleLeadDays: 2 },
      MENU_SUN_CLOSED,
      parseDateOnly('2026-06-01'),
    );
    const remaining = new Map<string, number>();
    let cur = rules.minSchedulableDate;
    for (let i = 0; i < 35; i++) {
      remaining.set(formatDateOnly(cur), i < 30 ? 0 : 20);
      cur = addDaysUtc(cur, 1);
    }

    const result = evaluatePurchaseCapacity({
      durationDays: 30,
      requiredPacks: 10,
      dailyCapacityPacks: 50,
      remainingByDate: remaining,
      scheduleRules: rules,
      ref: parseDateOnly('2026-06-01'),
      maxSearchDays: 60,
    });

    expect(result.canPurchase).toBe(false);
    expect(result.availablePacksInWindow).toBeLessThan(10);
    expect(result.nextAvailableDate).not.toBeNull();
    expect(result.daysUntilAvailable).toBeGreaterThan(0);
  });

  it('allows purchase when enough slots in default window', () => {
    const rules = buildScheduleRulesInput(
      { dailyCapacityPacks: 50, minScheduleLeadDays: 2 },
      MENU_SUN_CLOSED,
      parseDateOnly('2026-06-01'),
    );
    const remaining = buildRemainingByDate(
      rules.minSchedulableDate,
      addDaysUtc(rules.minSchedulableDate, 40),
      50,
      new Map(),
    );
    const result = evaluatePurchaseCapacity({
      durationDays: 30,
      requiredPacks: 10,
      dailyCapacityPacks: 50,
      remainingByDate: remaining,
      scheduleRules: rules,
      ref: parseDateOnly('2026-06-01'),
    });
    expect(result.canPurchase).toBe(true);
    expect(result.daysUntilAvailable).toBe(0);
  });
});
