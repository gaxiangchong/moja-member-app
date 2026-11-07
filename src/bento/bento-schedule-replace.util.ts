import { BentoDeliveryStatus } from '@prisma/client';

import { isPickupDateLocked } from './bento-pickup-lock.util';
import { formatDateOnly } from './bento-weekly.util';

export type ScheduleReplaceDelivery = {
  id: string;
  deliveryDate: Date;
  status: BentoDeliveryStatus;
};

/**
 * Dates that may be re-submitted without hitting lead-time / closed-day /
 * operations-end gates. Cancelled (SKIPPED) days are not exempt — they were
 * freed by close-operations (or similar) and must pass the live date rules
 * again, otherwise a client could "re-save" a cancelled post-cutoff day.
 */
export function scheduleGateExemptDates(
  deliveries: ReadonlyArray<Pick<ScheduleReplaceDelivery, 'deliveryDate' | 'status'>>,
): Set<string> {
  return new Set(
    deliveries
      .filter((d) => d.status !== BentoDeliveryStatus.SKIPPED)
      .map((d) => formatDateOnly(d.deliveryDate)),
  );
}

/**
 * Delivered meals, and locked still-scheduled pickups, must not be deleted or
 * overwritten. SKIPPED rows are reclaimable: close-operations marks them
 * skipped to free the credit, and a later save that includes that date must
 * be able to recreate the pickup (unique on subscription+date).
 */
export function isImmutableScheduleDelivery(
  delivery: Pick<ScheduleReplaceDelivery, 'deliveryDate' | 'status'>,
  unlockForAdmin: boolean,
): boolean {
  if (delivery.status === BentoDeliveryStatus.DELIVERED) return true;
  if (delivery.status === BentoDeliveryStatus.SKIPPED) return false;
  if (delivery.status !== BentoDeliveryStatus.SCHEDULED) return true;
  return (
    !unlockForAdmin && isPickupDateLocked(formatDateOnly(delivery.deliveryDate))
  );
}

/** SKIPPED rows whose dates appear in the incoming schedule, to delete before recreate. */
export function skippedDeliveryIdsToReclaim(
  deliveries: ReadonlyArray<ScheduleReplaceDelivery>,
  nextDates: ReadonlySet<string>,
): string[] {
  return deliveries
    .filter(
      (d) =>
        d.status === BentoDeliveryStatus.SKIPPED &&
        nextDates.has(formatDateOnly(d.deliveryDate)),
    )
    .map((d) => d.id);
}
