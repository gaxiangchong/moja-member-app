import type { BentoSubscription } from './types';

export function countScheduledMeals(subscriptions: BentoSubscription[]) {
  let lunch = 0;
  let dinner = 0;
  for (const sub of subscriptions) {
    for (const d of sub.deliveries) {
      lunch += d.lunchQty ?? (d.includesLunch ? 1 : 0);
      dinner += d.dinnerQty ?? (d.includesDinner ? 1 : 0);
    }
  }
  return { lunch, dinner };
}

/** Total meal credits across plans — a single pool spendable on lunch or dinner. */
export function totalMealCredits(subscriptions: BentoSubscription[]): number {
  return subscriptions.reduce((s, sub) => s + sub.lunchCredits + sub.dinnerCredits, 0);
}

export function allCreditsScheduled(subscriptions: BentoSubscription[]): boolean {
  const scheduled = countScheduledMeals(subscriptions);
  return scheduled.lunch + scheduled.dinner >= totalMealCredits(subscriptions);
}

/** Meals left to schedule (pooled — lunch and dinner combined). */
export function unscheduledMealCount(
  totalCredits: number,
  lunchScheduled: number,
  dinnerScheduled: number,
): number {
  return Math.max(0, totalCredits - lunchScheduled - dinnerScheduled);
}
