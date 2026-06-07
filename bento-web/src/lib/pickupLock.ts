/** Malaysia (UTC+8): pickup orders lock at 17:00 on the day before pickup. */
const PICKUP_LOCK_HOUR_UTC = 9; // 17:00 MYT

/** True when pickup on `deliveryDateIso` can no longer be changed. */
export function isPickupDateLocked(
  deliveryDateIso: string,
  ref = new Date(),
): boolean {
  const [y, m, d] = deliveryDateIso.split('-').map(Number);
  const deadlineUtc = Date.UTC(y!, m! - 1, d! - 1, PICKUP_LOCK_HOUR_UTC, 0, 0, 0);
  return ref.getTime() >= deadlineUtc;
}

export const PICKUP_LOCK_POLICY =
  'Orders lock at 5:00 PM the day before each pickup. After that, the next day\'s meal is confirmed.';
