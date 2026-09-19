import { checkoutSubscriptionIdsSafeToCancel } from './bento-checkout-cleanup.util';

describe('checkoutSubscriptionIdsSafeToCancel', () => {
  it('allows cleanup of attempts that never got a payment intent', () => {
    expect(
      checkoutSubscriptionIdsSafeToCancel(
        [{ id: 'sub-no-intent', paymentIntentId: null }],
        [],
      ),
    ).toEqual(['sub-no-intent']);
  });

  it('allows cleanup of explicitly failed bento payment intents', () => {
    expect(
      checkoutSubscriptionIdsSafeToCancel(
        [{ id: 'sub-failed', paymentIntentId: 'pi-failed' }],
        [
          {
            id: 'pi-failed',
            purpose: 'bento_subscription',
            status: 'FAILED',
          },
        ],
      ),
    ).toEqual(['sub-failed']);
  });

  it('preserves bento attempts whose payment can still succeed', () => {
    const subscriptions = [
      { id: 'sub-pending', paymentIntentId: 'pi-pending' },
      { id: 'sub-processing', paymentIntentId: 'pi-processing' },
      { id: 'sub-succeeded', paymentIntentId: 'pi-succeeded' },
    ];

    expect(
      checkoutSubscriptionIdsSafeToCancel(subscriptions, [
        {
          id: 'pi-pending',
          purpose: 'bento_subscription',
          status: 'PENDING',
        },
        {
          id: 'pi-processing',
          purpose: 'bento_subscription',
          status: 'PROCESSING',
        },
        {
          id: 'pi-succeeded',
          purpose: 'bento_subscription',
          status: 'SUCCEEDED',
        },
      ]),
    ).toEqual([]);
  });

  it('preserves unknown and non-bento payment intents', () => {
    const subscriptions = [
      { id: 'sub-missing-intent', paymentIntentId: 'pi-missing' },
      { id: 'sub-shop-intent', paymentIntentId: 'pi-shop' },
    ];

    expect(
      checkoutSubscriptionIdsSafeToCancel(subscriptions, [
        {
          id: 'pi-shop',
          purpose: 'shop_order',
          status: 'FAILED',
        },
      ]),
    ).toEqual([]);
  });
});
