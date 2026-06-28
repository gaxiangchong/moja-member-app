import type {
  BentoDietVariant,
  BentoRiceType,
  BentoSubscription,
} from './types';

export type PackCategory =
  | 'regular'
  | 'vegetarian'
  | 'regularBrown'
  | 'vegetarianBrown';

export type PickupDayPackSummary = {
  date: string;
  totalPacks: number;
  lunchCount: number;
  dinnerCount: number;
  regular: number;
  vegetarian: number;
  regularBrown: number;
  vegetarianBrown: number;
  withDrink: number;
};

export function categorizePack(
  variant: BentoDietVariant,
  riceType: BentoRiceType,
): PackCategory {
  const veg = variant === 'VEG';
  const brown = riceType === 'BROWN';
  if (veg && brown) return 'vegetarianBrown';
  if (veg) return 'vegetarian';
  if (brown) return 'regularBrown';
  return 'regular';
}

function hasDrink(sub: BentoSubscription): boolean {
  return Boolean(
    sub.includeDrinkAddon || sub.package.includeFreeSoupAndDrinks,
  );
}

export function buildUpcomingPickupSummaries(
  subscriptions: BentoSubscription[],
  todayIso: string,
): PickupDayPackSummary[] {
  const byDate = new Map<string, PickupDayPackSummary>();

  for (const sub of subscriptions) {
    const drink = hasDrink(sub);
    for (const delivery of sub.deliveries) {
      if (delivery.deliveryDate < todayIso) continue;
      if (delivery.status === 'SKIPPED') continue;

      const addMeal = (
        meal: 'lunch' | 'dinner',
        variant: BentoDietVariant,
        qty: number,
      ) => {
        if (qty <= 0) return;
        const category = categorizePack(variant, sub.riceType);
        const row = byDate.get(delivery.deliveryDate) ?? {
          date: delivery.deliveryDate,
          totalPacks: 0,
          lunchCount: 0,
          dinnerCount: 0,
          regular: 0,
          vegetarian: 0,
          regularBrown: 0,
          vegetarianBrown: 0,
          withDrink: 0,
        };
        row.totalPacks += qty;
        if (meal === 'lunch') row.lunchCount += qty;
        else row.dinnerCount += qty;
        row[category] += qty;
        if (drink) row.withDrink += qty;
        byDate.set(delivery.deliveryDate, row);
      };

      const lunchQty = delivery.lunchQty ?? (delivery.includesLunch ? 1 : 0);
      const dinnerQty = delivery.dinnerQty ?? (delivery.includesDinner ? 1 : 0);
      addMeal('lunch', sub.lunchVariant, lunchQty);
      addMeal('dinner', sub.dinnerVariant, dinnerQty);
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function countForCategory(
  summary: PickupDayPackSummary,
  category: PackCategory,
): number {
  return summary[category];
}
