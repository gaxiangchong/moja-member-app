/** First assignable 6-digit kitchen pickup code (inclusive). */
export const KITCHEN_PICKUP_CODE_MIN = 100_000;

/** Last assignable 6-digit kitchen pickup code (inclusive). */
export const KITCHEN_PICKUP_CODE_MAX = 999_999;

const KITCHEN_PICKUP_CODE_RE = /^[0-9]{6}$/;

export function formatKitchenPickupCode(value: number): string {
  if (!Number.isInteger(value) || value < KITCHEN_PICKUP_CODE_MIN || value > KITCHEN_PICKUP_CODE_MAX) {
    throw new Error('KITCHEN_PICKUP_CODE_OUT_OF_RANGE');
  }
  return String(value).padStart(6, '0');
}

export function isKitchenPickupCode(value: string | null | undefined): value is string {
  return typeof value === 'string' && KITCHEN_PICKUP_CODE_RE.test(value);
}

/** QR / scan payload shown to staff (ops parses `BENTO:<code>`). */
export function kitchenPickupQrPayload(code: string): string {
  return `BENTO:${code}`;
}

/**
 * Normalizes manual entry or scan text to a 6-digit kitchen pickup code.
 * Accepts `BENTO:123456`, bare `123456`, or embedded payloads from QR.
 */
export function parseKitchenPickupCodeInput(raw: string): string | null {
  const trimmed = raw.trim();
  const labeled = trimmed.match(/^BENTO:\s*([0-9]{6})$/i);
  if (labeled) return labeled[1];
  if (KITCHEN_PICKUP_CODE_RE.test(trimmed)) return trimmed;
  const embedded = trimmed.match(/BENTO:\s*([0-9]{6})/i);
  if (embedded) return embedded[1];
  return null;
}
