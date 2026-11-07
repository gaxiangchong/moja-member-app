import { formatDateOnly } from './bento-weekly.util';

/**
 * Meals that will exist after a schedule replace: preserved (delivered /
 * skipped / locked) rows plus newly proposed rows on non-immutable dates.
 *
 * Callers must not trust `proposedRows` alone — the replace path keeps
 * immutable deliveries even when the client omits them from the payload.
 */
export function totalMealsAfterScheduleReplace(input: {
  preservedDeliveries: Array<{ lunchQty: number; dinnerQty: number }>;
  proposedRows: Array<{
    deliveryDate: Date;
    lunchQty: number;
    dinnerQty: number;
  }>;
  immutableDates: ReadonlySet<string>;
}): number {
  const preserved = input.preservedDeliveries.reduce(
    (sum, d) => sum + d.lunchQty + d.dinnerQty,
    0,
  );
  const added = input.proposedRows
    .filter((r) => !input.immutableDates.has(formatDateOnly(r.deliveryDate)))
    .reduce((sum, r) => sum + r.lunchQty + r.dinnerQty, 0);
  return preserved + added;
}
