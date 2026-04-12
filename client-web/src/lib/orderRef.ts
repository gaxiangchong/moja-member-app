/**
 * Public pickup / order number (sequential). Must match ops-queue-web `orderRef`.
 */
export function formatOrderPickupLabel(orderNumber: number): string {
  return String(orderNumber);
}
