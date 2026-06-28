/**
 * Public pickup / order number (sequential). Must match member app `orderRef`.
 * QR may encode `ORDER:<number>`; legacy payloads may still carry a UUID.
 */
export function formatOrderPickupLabel(orderNumber: number): string {
  return String(orderNumber);
}
