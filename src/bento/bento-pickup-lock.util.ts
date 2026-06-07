import { parseDateOnly } from './bento-weekly.util';

/** Malaysia (UTC+8): pickup orders lock at 17:00 on the day before pickup. */
const PICKUP_LOCK_HOUR_UTC = 9; // 17:00 MYT

/** True when pickup on `deliveryDateIso` can no longer be changed. */
export function isPickupDateLocked(
  deliveryDateIso: string,
  ref = new Date(),
): boolean {
  const pickup = parseDateOnly(deliveryDateIso);
  const deadline = new Date(
    Date.UTC(
      pickup.getUTCFullYear(),
      pickup.getUTCMonth(),
      pickup.getUTCDate() - 1,
      PICKUP_LOCK_HOUR_UTC,
      0,
      0,
      0,
    ),
  );
  return ref.getTime() >= deadline.getTime();
}

export function pickupLockMessage(deliveryDateIso: string): string {
  return `Pickup for ${deliveryDateIso} is confirmed. Changes must be made before 5:00 PM the day before.`;
}
