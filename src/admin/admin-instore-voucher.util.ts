/**
 * Shared validity gates for staff in-store voucher redemption (#44).
 * Must stay aligned with online checkout checks in
 * `RewardsWorkflowService.validateAndLockVoucher` (validFrom) and
 * `PaymentsService.resolveCustomerVoucherDiscount` (expiresAt).
 */

export function isVoucherExpired(
  expiresAt: Date | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  return !!expiresAt && expiresAt.getTime() <= nowMs;
}

/** Birthday (and other) campaign vouchers store a future `metadata.validFrom`. */
export function isVoucherNotYetValid(
  metadata: unknown,
  nowMs: number = Date.now(),
): boolean {
  const validFromRaw =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as { validFrom?: unknown }).validFrom
      : undefined;
  if (typeof validFromRaw !== 'string' || !validFromRaw.trim()) return false;
  const validFrom = new Date(validFromRaw);
  return !Number.isNaN(validFrom.getTime()) && validFrom.getTime() > nowMs;
}
