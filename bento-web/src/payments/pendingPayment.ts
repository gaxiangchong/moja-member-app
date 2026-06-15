/**
 * In-flight bento e-wallet payment (TNG, ShopeePay, etc.).
 * E-wallets often don't redirect back after "Done" — poll via referenceId instead.
 */

const PENDING_KEY = 'moja_bento_pending_payment';
const TTL_MS = 30 * 60 * 1000;

export type PendingBentoPayment = {
  referenceId: string;
  subscriptionId: string | null;
  savedAt: number;
};

export function savePendingBentoPayment(input: {
  referenceId: string;
  subscriptionId?: string | null;
}): void {
  try {
    const payload: PendingBentoPayment = {
      referenceId: input.referenceId,
      subscriptionId: input.subscriptionId ?? null,
      savedAt: Date.now(),
    };
    localStorage.setItem(PENDING_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function readPendingBentoPayment(): PendingBentoPayment | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingBentoPayment>;
    if (
      !parsed ||
      typeof parsed.referenceId !== 'string' ||
      typeof parsed.savedAt !== 'number'
    ) {
      localStorage.removeItem(PENDING_KEY);
      return null;
    }
    if (Date.now() - parsed.savedAt > TTL_MS) {
      localStorage.removeItem(PENDING_KEY);
      return null;
    }
    return {
      referenceId: parsed.referenceId,
      subscriptionId:
        typeof parsed.subscriptionId === 'string' ? parsed.subscriptionId : null,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function clearPendingBentoPayment(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}
