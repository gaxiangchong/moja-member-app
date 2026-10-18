/**
 * Early-order discount: a member who orders whole cakes at least N days before
 * the collection day gets a percentage off those cakes. Admin-controlled, off
 * until switched on. The server always works the amount out itself; the
 * member app only mirrors it for display.
 */

/** The only category the discount covers: cakes the kitchen bakes to order. */
export const EARLY_ORDER_CATEGORY = 'whole_cakes';

export type EarlyOrderDiscountSettings = {
  enabled: boolean;
  /** Whole percent off the cakes, 1–50. */
  percent: number;
  /** The collection day must be at least this many days after the order day. */
  minDaysAhead: number;
};

export const DEFAULT_EARLY_ORDER_DISCOUNT: EarlyOrderDiscountSettings = {
  enabled: false,
  percent: 5,
  minDaysAhead: 2,
};

export const EARLY_ORDER_LIMITS = {
  minPercent: 1,
  maxPercent: 50,
  minDays: 1,
  maxDays: 30,
} as const;

export class EarlyOrderDiscountSettingsError extends Error {}

function toInt(raw: unknown): number | null {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  return typeof n === 'number' && Number.isInteger(n) ? n : null;
}

/** Validates admin input; throws with a message the admin can act on. */
export function normalizeEarlyOrderDiscount(
  input: unknown,
): EarlyOrderDiscountSettings {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<
    string,
    unknown
  >;
  const percent = toInt(raw.percent);
  if (
    percent == null ||
    percent < EARLY_ORDER_LIMITS.minPercent ||
    percent > EARLY_ORDER_LIMITS.maxPercent
  ) {
    throw new EarlyOrderDiscountSettingsError(
      `The discount must be a whole percent between ${EARLY_ORDER_LIMITS.minPercent} and ${EARLY_ORDER_LIMITS.maxPercent}.`,
    );
  }
  const days = toInt(raw.minDaysAhead);
  if (
    days == null ||
    days < EARLY_ORDER_LIMITS.minDays ||
    days > EARLY_ORDER_LIMITS.maxDays
  ) {
    throw new EarlyOrderDiscountSettingsError(
      `Days ahead must be a whole number between ${EARLY_ORDER_LIMITS.minDays} and ${EARLY_ORDER_LIMITS.maxDays}.`,
    );
  }
  return { enabled: raw.enabled === true, percent, minDaysAhead: days };
}

/** Whole days from `fromYmd` to `toYmd` (both yyyy-mm-dd shop dates). */
export function daysBetween(fromYmd: string, toYmd: string): number {
  const from = Date.parse(`${fromYmd}T00:00:00Z`);
  const to = Date.parse(`${toYmd}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

export type EarlyOrderLine = {
  /** unitPriceCents × qty */
  amountCents: number;
  isWholeCake: boolean;
};

/**
 * The discount in sen, or 0 when the order does not qualify.
 *
 * It is taken from the cakes' share of the order *after* any voucher, so the
 * two never discount the same ringgit twice. Orders with no collection day
 * (parcels) cannot be "ordered ahead" and never qualify.
 */
export function earlyOrderDiscountCents(input: {
  settings: EarlyOrderDiscountSettings;
  lines: EarlyOrderLine[];
  /** Collection day, yyyy-mm-dd; null for parcels and in-store orders. */
  scheduledDate: string | null | undefined;
  /** The shop's today, yyyy-mm-dd. */
  today: string;
  /** Discount already given by a voucher or points reward. */
  otherDiscountCents: number;
}): number {
  const { settings } = input;
  if (!settings.enabled || !input.scheduledDate) return 0;
  if (daysBetween(input.today, input.scheduledDate) < settings.minDaysAhead) {
    return 0;
  }
  const subtotal = input.lines.reduce((s, l) => s + l.amountCents, 0);
  const cakes = input.lines
    .filter((l) => l.isWholeCake)
    .reduce((s, l) => s + l.amountCents, 0);
  if (cakes <= 0 || subtotal <= 0) return 0;
  const other = Math.min(Math.max(0, input.otherDiscountCents), subtotal);
  // The voucher is spread over the order; the cakes carry their share of it.
  const cakesAfterVoucher = cakes - Math.round((other * cakes) / subtotal);
  const discount = Math.floor((cakesAfterVoucher * settings.percent) / 100);
  return Math.max(0, Math.min(discount, subtotal - other));
}
