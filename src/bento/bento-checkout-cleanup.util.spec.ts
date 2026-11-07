import { safePendingBentoCheckoutIdsToCancel } from './bento-checkout-cleanup.util';

describe('safePendingBentoCheckoutIdsToCancel', () => {
  it('only cancels attempts without a provider intent or with a failed intent', () => {
    expect(
      safePendingBentoCheckoutIdsToCancel([
        { id: 'no-intent', paymentIntentId: null, paymentIntentStatus: null },
        {
          id: 'failed-intent',
          paymentIntentId: 'intent-failed',
          paymentIntentStatus: 'FAILED',
        },
        {
          id: 'pending-intent',
          paymentIntentId: 'intent-pending',
          paymentIntentStatus: 'PENDING',
        },
        {
          id: 'processing-intent',
          paymentIntentId: 'intent-processing',
          paymentIntentStatus: 'PROCESSING',
        },
        {
          id: 'unknown-intent',
          paymentIntentId: 'intent-unknown',
          paymentIntentStatus: null,
        },
      ]),
    ).toEqual(['no-intent', 'failed-intent']);
  });
});
