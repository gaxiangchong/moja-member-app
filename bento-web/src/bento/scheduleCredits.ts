import type { BentoSubscription } from './types';

export function countScheduledMeals(subscriptions: BentoSubscription[]) {
  let lunch = 0;
  let dinner = 0;
  for (const sub of subscriptions) {
    for (const d of sub.deliveries) {
      if (d.includesLunch) lunch += 1;
      if (d.includesDinner) dinner += 1;
    }
  }
  return { lunch, dinner };
}

export function allCreditsScheduled(
  subscriptions: BentoSubscription[],
  allowLunch: boolean,
  allowDinner: boolean,
): boolean {
  const totalLunch = subscriptions.reduce((s, sub) => s + sub.lunchCredits, 0);
  const totalDinner = subscriptions.reduce((s, sub) => s + sub.dinnerCredits, 0);
  const scheduled = countScheduledMeals(subscriptions);
  return (
    (!allowLunch || scheduled.lunch >= totalLunch) &&
    (!allowDinner || scheduled.dinner >= totalDinner)
  );
}

export function unscheduledCreditSummary(
  totalLunch: number,
  totalDinner: number,
  lunchScheduled: number,
  dinnerScheduled: number,
  allowLunch: boolean,
  allowDinner: boolean,
): string[] {
  const parts: string[] = [];
  const lunchLeft = totalLunch - lunchScheduled;
  const dinnerLeft = totalDinner - dinnerScheduled;
  if (allowLunch && lunchLeft > 0) {
    parts.push(`${lunchLeft} lunch${lunchLeft === 1 ? '' : 'es'}`);
  }
  if (allowDinner && dinnerLeft > 0) {
    parts.push(`${dinnerLeft} dinner${dinnerLeft === 1 ? '' : 's'}`);
  }
  return parts;
}
