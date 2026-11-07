export type BentoCheckoutCleanupSubscription = {
  id: string;
  paymentIntentId: string | null;
};

export type BentoCheckoutCleanupPaymentIntent = {
  id: string;
  purpose: string;
  status: string;
};

/**
 * Return prior checkout attempts that are safe to hide before creating a new
 * attempt. A non-terminal payment can still succeed through Xendit, so keep it
 * visible/reconcilable instead of cancelling the member's paid plan.
 */
export function checkoutSubscriptionIdsSafeToCancel(
  subscriptions: BentoCheckoutCleanupSubscription[],
  paymentIntents: BentoCheckoutCleanupPaymentIntent[],
): string[] {
  const intentsById = new Map(
    paymentIntents.map((intent) => [intent.id, intent]),
  );

  return subscriptions
    .filter((subscription) => {
      if (!subscription.paymentIntentId) return true;

      const intent = intentsById.get(subscription.paymentIntentId);
      return (
        intent?.purpose === 'bento_subscription' && intent.status === 'FAILED'
      );
    })
    .map((subscription) => subscription.id);
}
