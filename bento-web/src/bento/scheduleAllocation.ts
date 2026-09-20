import type { BentoSubscription } from './types';

export type ScheduleSelection = {
  date: string;
  lunchQty: number;
  dinnerQty: number;
};

export type SubscriptionSchedule = {
  subscriptionId: string;
  slots: Array<{
    date: string;
    includeLunch: boolean;
    includeDinner: boolean;
    lunchQty: number;
    dinnerQty: number;
  }>;
};

type Meal = 'lunch' | 'dinner';
type MealQuantities = { lunchQty: number; dinnerQty: number };

function existingQuantity(
  delivery: BentoSubscription['deliveries'][number],
  meal: Meal,
): number {
  if (meal === 'lunch') {
    return delivery.lunchQty ?? (delivery.includesLunch ? 1 : 0);
  }
  return delivery.dinnerQty ?? (delivery.includesDinner ? 1 : 0);
}

function addQuantity(
  allocation: Map<string, MealQuantities>,
  date: string,
  meal: Meal,
  quantity: number,
): void {
  const row = allocation.get(date) ?? { lunchQty: 0, dinnerQty: 0 };
  if (meal === 'lunch') row.lunchQty += quantity;
  else row.dinnerQty += quantity;
  allocation.set(date, row);
}

function canAssignDate(subscription: BentoSubscription, date: string): boolean {
  const scheduling = subscription.scheduling;
  if (!scheduling) return true;
  return date >= scheduling.earliestDate && date <= scheduling.windowEndDate;
}

/** Total meal credits on a plan — lunch and dinner share one flexible pool. */
function totalCredits(subscription: BentoSubscription): number {
  return subscription.lunchCredits + subscription.dinnerCredits;
}

/**
 * Split the combined calendar selection back into subscription-specific
 * payloads. Existing pickup ownership is retained wherever the selected date
 * still exists; only newly selected/released meals are distributed among plans
 * with remaining pooled credits.
 *
 * Credits are a single lunch/dinner pool (matching server-side scheduling), so
 * a plan with lunchCredits=15/dinnerCredits=15 can take 30 lunches.
 */
export function allocateScheduleSelections(
  subscriptions: BentoSubscription[],
  selections: ScheduleSelection[],
): SubscriptionSchedule[] {
  const allocations = subscriptions.map(() => new Map<string, MealQuantities>());
  const used = subscriptions.map(() => 0);

  const remainingLunch = new Map(
    selections
      .filter((selection) => selection.lunchQty > 0)
      .map((selection) => [selection.date, selection.lunchQty]),
  );
  const remainingDinner = new Map(
    selections
      .filter((selection) => selection.dinnerQty > 0)
      .map((selection) => [selection.date, selection.dinnerQty]),
  );

  // Preserve the subscription that already owns each selected pickup. This
  // prevents an edit of a merged calendar from silently moving deliveries
  // between unrelated plans.
  subscriptions.forEach((subscription, subscriptionIndex) => {
    for (const delivery of subscription.deliveries) {
      for (const meal of ['lunch', 'dinner'] as const) {
        const remaining =
          meal === 'lunch' ? remainingLunch : remainingDinner;
        const desired = remaining.get(delivery.deliveryDate) ?? 0;
        if (desired <= 0) continue;
        const keep = Math.min(existingQuantity(delivery, meal), desired);
        if (keep <= 0) continue;
        const capacityLeft = totalCredits(subscription) - used[subscriptionIndex]!;
        const assigned = Math.min(keep, capacityLeft);
        if (assigned <= 0) continue;
        addQuantity(
          allocations[subscriptionIndex]!,
          delivery.deliveryDate,
          meal,
          assigned,
        );
        used[subscriptionIndex]! += assigned;
        remaining.set(delivery.deliveryDate, desired - assigned);
      }
    }
  });

  // Distribute leftover meal units round-robin into plans with spare pooled
  // credits and a date window that covers the pickup day.
  let nextSubscription = 0;
  const leftoverUnits: Array<{ date: string; meal: Meal }> = [];
  for (const [date, quantity] of [...remainingLunch.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    for (let unit = 0; unit < quantity; unit++) {
      leftoverUnits.push({ date, meal: 'lunch' });
    }
  }
  for (const [date, quantity] of [...remainingDinner.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    for (let unit = 0; unit < quantity; unit++) {
      leftoverUnits.push({ date, meal: 'dinner' });
    }
  }

  for (const unit of leftoverUnits) {
    let target = -1;
    for (let offset = 0; offset < subscriptions.length; offset++) {
      const candidate = (nextSubscription + offset) % subscriptions.length;
      if (
        used[candidate]! < totalCredits(subscriptions[candidate]!) &&
        canAssignDate(subscriptions[candidate]!, unit.date)
      ) {
        target = candidate;
        break;
      }
    }
    if (target < 0) {
      throw new Error(
        `Selected ${unit.meal} pickups exceed available meal credits.`,
      );
    }
    addQuantity(allocations[target]!, unit.date, unit.meal, 1);
    used[target]! += 1;
    nextSubscription = (target + 1) % subscriptions.length;
  }

  return subscriptions.map((subscription, index) => ({
    subscriptionId: subscription.id,
    slots: [...allocations[index]!.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, quantities]) => ({
        date,
        includeLunch: quantities.lunchQty > 0,
        includeDinner: quantities.dinnerQty > 0,
        ...quantities,
      })),
  }));
}
