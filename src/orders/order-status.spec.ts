import {
  canTransitionOrder,
  isMemberCancellable,
  isOrderStatus,
  NON_REVENUE_ORDER_STATUSES,
  OPEN_ORDER_STATUSES,
  ORDER_STATUS,
  orderProgressStep,
} from './order-status';

describe('order status sets', () => {
  it('treats preparing and ready as open, not just placed', () => {
    // Regression guard: filtering on `status = 'placed'` alone used to be the
    // "open orders" query and would now hide orders the kitchen is working on.
    expect(OPEN_ORDER_STATUSES).toEqual([
      ORDER_STATUS.PLACED,
      ORDER_STATUS.PREPARING,
      ORDER_STATUS.READY,
    ]);
  });

  it('excludes unpaid, cancelled and refunded orders from revenue', () => {
    expect(NON_REVENUE_ORDER_STATUSES).toContain(ORDER_STATUS.PENDING_PAYMENT);
    expect(NON_REVENUE_ORDER_STATUSES).toContain(ORDER_STATUS.CANCELLED);
    expect(NON_REVENUE_ORDER_STATUSES).toContain(ORDER_STATUS.REFUNDED);
    expect(NON_REVENUE_ORDER_STATUSES).not.toContain(ORDER_STATUS.COMPLETED);
  });

  it('recognises only known statuses', () => {
    expect(isOrderStatus('preparing')).toBe(true);
    expect(isOrderStatus('in_the_oven')).toBe(false);
    expect(isOrderStatus(null)).toBe(false);
  });
});

describe('canTransitionOrder', () => {
  it('walks the happy path', () => {
    expect(
      canTransitionOrder(ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PLACED),
    ).toBe(true);
    expect(
      canTransitionOrder(ORDER_STATUS.PLACED, ORDER_STATUS.PREPARING),
    ).toBe(true);
    expect(canTransitionOrder(ORDER_STATUS.PREPARING, ORDER_STATUS.READY)).toBe(
      true,
    );
    expect(canTransitionOrder(ORDER_STATUS.READY, ORDER_STATUS.COMPLETED)).toBe(
      true,
    );
  });

  it('lets the counter skip steps for a cake already in the case', () => {
    expect(canTransitionOrder(ORDER_STATUS.PLACED, ORDER_STATUS.READY)).toBe(
      true,
    );
    expect(
      canTransitionOrder(ORDER_STATUS.PLACED, ORDER_STATUS.COMPLETED),
    ).toBe(true);
  });

  it('never moves backwards or out of a terminal state', () => {
    expect(canTransitionOrder(ORDER_STATUS.READY, ORDER_STATUS.PREPARING)).toBe(
      false,
    );
    expect(
      canTransitionOrder(ORDER_STATUS.COMPLETED, ORDER_STATUS.PLACED),
    ).toBe(false);
    expect(canTransitionOrder(ORDER_STATUS.REFUNDED, ORDER_STATUS.PLACED)).toBe(
      false,
    );
  });

  it('allows refunding a completed order but not re-completing it', () => {
    expect(
      canTransitionOrder(ORDER_STATUS.COMPLETED, ORDER_STATUS.REFUNDED),
    ).toBe(true);
    expect(
      canTransitionOrder(ORDER_STATUS.REFUNDED, ORDER_STATUS.COMPLETED),
    ).toBe(false);
  });

  it('rejects an unknown source status', () => {
    expect(canTransitionOrder('whatever', ORDER_STATUS.COMPLETED)).toBe(false);
  });
});

describe('isMemberCancellable', () => {
  it('allows self-cancel only before the kitchen starts', () => {
    expect(isMemberCancellable(ORDER_STATUS.PLACED)).toBe(true);
    expect(isMemberCancellable(ORDER_STATUS.PREPARING)).toBe(false);
    expect(isMemberCancellable(ORDER_STATUS.READY)).toBe(false);
  });
});

describe('orderProgressStep', () => {
  it('maps the lifecycle onto the four-step tracker', () => {
    expect(orderProgressStep(ORDER_STATUS.PLACED)).toBe(0);
    expect(orderProgressStep(ORDER_STATUS.PREPARING)).toBe(1);
    expect(orderProgressStep(ORDER_STATUS.READY)).toBe(2);
    expect(orderProgressStep(ORDER_STATUS.COMPLETED)).toBe(3);
  });

  it('falls back to the first step for cancelled or unknown orders', () => {
    expect(orderProgressStep(ORDER_STATUS.CANCELLED)).toBe(0);
    expect(orderProgressStep('nonsense')).toBe(0);
  });
});
