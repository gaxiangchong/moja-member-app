import type { EarlyOrderDiscountInfo } from '../../api';

/**
 * Mirrors `earlyOrderDiscountCents` in src/orders/early-order-discount.ts so
 * checkout shows the same amount the server will charge. Keep the two in step.
 */

/** Whole days from `fromYmd` to `toYmd` (both yyyy-mm-dd). */
export function daysBetween(fromYmd: string, toYmd: string): number {
  const from = Date.parse(`${fromYmd}T00:00:00Z`);
  const to = Date.parse(`${toYmd}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

export function earlyOrderDiscountCents(input: {
  settings: EarlyOrderDiscountInfo | null;
  lines: { amountCents: number; isWholeCake: boolean }[];
  scheduledDate: string | null | undefined;
  today: string;
  otherDiscountCents: number;
}): number {
  const { settings } = input;
  if (!settings?.enabled || !input.scheduledDate) return 0;
  if (daysBetween(input.today, input.scheduledDate) < settings.minDaysAhead) return 0;
  const subtotal = input.lines.reduce((s, l) => s + l.amountCents, 0);
  const cakes = input.lines.filter((l) => l.isWholeCake).reduce((s, l) => s + l.amountCents, 0);
  if (cakes <= 0 || subtotal <= 0) return 0;
  const other = Math.min(Math.max(0, input.otherDiscountCents), subtotal);
  const cakesAfterVoucher = cakes - Math.round((other * cakes) / subtotal);
  const discount = Math.floor((cakesAfterVoucher * settings.percent) / 100);
  return Math.max(0, Math.min(discount, subtotal - other));
}
