import type { BentoScheduleRulesInput } from './bento-schedule-rules.util';
import { isSchedulablePickupDate } from './bento-schedule-rules.util';
import { addDaysUtc, formatDateOnly } from './bento-weekly.util';

function isSchedulablePickupDay(
  d: Date,
  rules: BentoScheduleRulesInput,
): boolean {
  return isSchedulablePickupDate(d, rules);
}

export type PurchaseCapacityEvaluation = {
  canPurchase: boolean;
  requiredPacks: number;
  availablePacksInWindow: number;
  windowDays: number;
  windowStartDate: string;
  windowEndDate: string;
  nextAvailableDate: string | null;
  daysUntilAvailable: number | null;
  dailyCapacityPacks: number;
  ordersPaused: boolean;
};

/** Sum remaining pack slots on schedulable days within a calendar window. */
export function sumRemainingInWindow(
  windowStart: Date,
  durationDays: number,
  remainingByDate: Map<string, number>,
  rules: BentoScheduleRulesInput,
): number {
  let sum = 0;
  for (let i = 0; i < durationDays; i++) {
    const d = addDaysUtc(windowStart, i);
    if (!isSchedulablePickupDay(d, rules)) continue;
    sum += remainingByDate.get(formatDateOnly(d)) ?? 0;
  }
  return sum;
}

/**
 * Checks whether `requiredPacks` can be scheduled inside some `durationDays`
 * window. Returns the earliest window start (today's default window or later).
 */
export function evaluatePurchaseCapacity(input: {
  durationDays: number;
  requiredPacks: number;
  dailyCapacityPacks: number;
  remainingByDate: Map<string, number>;
  scheduleRules: BentoScheduleRulesInput;
  ordersPaused?: boolean;
  maxSearchDays?: number;
  ref?: Date;
}): PurchaseCapacityEvaluation {
  const {
    durationDays,
    requiredPacks,
    dailyCapacityPacks,
    remainingByDate,
    scheduleRules,
    ordersPaused = false,
    maxSearchDays = 180,
    ref = new Date(),
  } = input;

  const minSchedulable = scheduleRules.minSchedulableDate;
  const defaultStart = minSchedulable;
  const defaultEnd = addDaysUtc(defaultStart, durationDays - 1);
  const availableNow = sumRemainingInWindow(
    defaultStart,
    durationDays,
    remainingByDate,
    scheduleRules,
  );

  if (ordersPaused) {
    return {
      canPurchase: false,
      requiredPacks,
      availablePacksInWindow: availableNow,
      windowDays: durationDays,
      windowStartDate: formatDateOnly(defaultStart),
      windowEndDate: formatDateOnly(defaultEnd),
      nextAvailableDate: null,
      daysUntilAvailable: null,
      dailyCapacityPacks,
      ordersPaused: true,
    };
  }

  let nextAvailableDate: string | null = null;
  let daysUntilAvailable: number | null = null;

  for (let offset = 0; offset <= maxSearchDays; offset++) {
    const windowStart = addDaysUtc(minSchedulable, offset);
    const available = sumRemainingInWindow(
      windowStart,
      durationDays,
      remainingByDate,
      scheduleRules,
    );
    if (available >= requiredPacks) {
      nextAvailableDate = formatDateOnly(windowStart);
      daysUntilAvailable = offset;
      break;
    }
  }

  return {
    canPurchase: availableNow >= requiredPacks,
    requiredPacks,
    availablePacksInWindow: availableNow,
    windowDays: durationDays,
    windowStartDate: formatDateOnly(defaultStart),
    windowEndDate: formatDateOnly(defaultEnd),
    nextAvailableDate,
    daysUntilAvailable,
    dailyCapacityPacks,
    ordersPaused: false,
  };
}

/** Build remaining slots per day from scheduled counts. */
export function buildRemainingByDate(
  from: Date,
  to: Date,
  dailyCapacityPacks: number,
  scheduledByDate: Map<string, number>,
): Map<string, number> {
  const remaining = new Map<string, number>();
  let cur = from;
  while (cur <= to) {
    const iso = formatDateOnly(cur);
    const scheduled = scheduledByDate.get(iso) ?? 0;
    remaining.set(iso, Math.max(0, dailyCapacityPacks - scheduled));
    cur = addDaysUtc(cur, 1);
  }
  return remaining;
}
