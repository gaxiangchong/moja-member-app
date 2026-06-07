import { BENTO_MIN_SCHEDULE_LEAD_DAYS } from './bento-schedule.constants';
import { addDaysUtc, formatDateOnly } from './bento-weekly.util';

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

function earliestSchedulableDate(ref = new Date()): Date {
  const today = new Date(
    Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()),
  );
  return addDaysUtc(today, BENTO_MIN_SCHEDULE_LEAD_DAYS);
}

function isSchedulablePickupDay(d: Date, minSchedulable: Date): boolean {
  return d.getUTCDay() !== 0 && d >= minSchedulable;
}

/** Sum remaining pack slots on Mon–Sat days within a calendar window. */
export function sumRemainingInWindow(
  windowStart: Date,
  durationDays: number,
  remainingByDate: Map<string, number>,
  minSchedulable: Date,
): number {
  let sum = 0;
  for (let i = 0; i < durationDays; i++) {
    const d = addDaysUtc(windowStart, i);
    if (!isSchedulablePickupDay(d, minSchedulable)) continue;
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
  ordersPaused?: boolean;
  maxSearchDays?: number;
  ref?: Date;
}): PurchaseCapacityEvaluation {
  const {
    durationDays,
    requiredPacks,
    dailyCapacityPacks,
    remainingByDate,
    ordersPaused = false,
    maxSearchDays = 180,
    ref = new Date(),
  } = input;

  const minSchedulable = earliestSchedulableDate(ref);
  const defaultStart = minSchedulable;
  const defaultEnd = addDaysUtc(defaultStart, durationDays - 1);
  const availableNow = sumRemainingInWindow(
    defaultStart,
    durationDays,
    remainingByDate,
    minSchedulable,
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
      minSchedulable,
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
