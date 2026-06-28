/**
 * Cross-screen state for an in-flight e-wallet payment.
 *
 * E-wallets (TNG, ShopeePay, GCash) in live mode often don't redirect the user
 * back to the merchant app after they tap "Done". We persist enough info here
 * so that whenever the member app regains focus, it can poll
 * GET /payments/intent/:referenceId and surface the success/failure UI even
 * without the redirect.
 */

const PENDING_PAYMENT_KEY = 'moja_pending_payment';
/** Drop entries older than this regardless of payment status. */
const PENDING_PAYMENT_TTL_MS = 30 * 60 * 1000;

export type PendingPaymentPurpose = 'shop_order' | 'wallet_topup';

export interface PendingPayment {
  referenceId: string;
  orderNumber: string | null;
  purpose: PendingPaymentPurpose;
  /** ms epoch when the redirect to the e-wallet started */
  savedAt: number;
}

export function savePendingPayment(input: {
  referenceId: string;
  orderNumber?: string | number | null;
  purpose: PendingPaymentPurpose;
}): void {
  try {
    const payload: PendingPayment = {
      referenceId: input.referenceId,
      orderNumber:
        input.orderNumber == null ? null : String(input.orderNumber),
      purpose: input.purpose,
      savedAt: Date.now(),
    };
    localStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify(payload));
  } catch {
    /* localStorage unavailable (private mode, quota) — degrade silently */
  }
}

export function readPendingPayment(): PendingPayment | null {
  try {
    const raw = localStorage.getItem(PENDING_PAYMENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingPayment>;
    if (
      !parsed ||
      typeof parsed.referenceId !== 'string' ||
      typeof parsed.savedAt !== 'number'
    ) {
      localStorage.removeItem(PENDING_PAYMENT_KEY);
      return null;
    }
    if (Date.now() - parsed.savedAt > PENDING_PAYMENT_TTL_MS) {
      localStorage.removeItem(PENDING_PAYMENT_KEY);
      return null;
    }
    return {
      referenceId: parsed.referenceId,
      orderNumber:
        typeof parsed.orderNumber === 'string' ? parsed.orderNumber : null,
      purpose:
        parsed.purpose === 'wallet_topup' ? 'wallet_topup' : 'shop_order',
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function clearPendingPayment(): void {
  try {
    localStorage.removeItem(PENDING_PAYMENT_KEY);
  } catch {
    /* ignore */
  }
}
