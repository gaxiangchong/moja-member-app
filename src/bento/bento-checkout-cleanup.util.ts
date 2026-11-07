export type PendingBentoCheckoutAttempt = {
  id: string;
  paymentIntentId: string | null;
  paymentIntentStatus: string | null;
};

const TERMINAL_UNPAID_PAYMENT_STATUSES = new Set(['FAILED']);

export function safePendingBentoCheckoutIdsToCancel(
  attempts: PendingBentoCheckoutAttempt[],
): string[] {
  return attempts
    .filter(
      (attempt) =>
        !attempt.paymentIntentId ||
        TERMINAL_UNPAID_PAYMENT_STATUSES.has(
          attempt.paymentIntentStatus?.toUpperCase() ?? '',
        ),
    )
    .map((attempt) => attempt.id);
}
