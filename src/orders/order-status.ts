/**
 * Canonical lifecycle for `customer_orders.status`.
 *
 * The column stays a VARCHAR rather than a Postgres enum because several
 * reports query it from raw SQL; these constants are the single source of
 * truth instead. Existing values (`pending_payment`, `placed`, `completed`)
 * keep their spelling so historical rows, reports and the admin UI are
 * unaffected — `preparing`, `ready`, `cancelled` and `refunded` are new.
 *
 *   pending_payment ──pay──> placed ──kitchen──> preparing ──> ready
 *                    │                                          │
 *                    │                              collect / deliver
 *                    ↓                                          ↓
 *                cancelled <──── (before preparing) ────    completed
 *                                                               │
 *                                                        refund ↓
 *                                                           refunded
 */
export const ORDER_STATUS = {
  PENDING_PAYMENT: 'pending_payment',
  PLACED: 'placed',
  PREPARING: 'preparing',
  READY: 'ready',
  /** Terminal success: collected at the counter, or delivered to the door. */
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export const ALL_ORDER_STATUSES: OrderStatus[] = Object.values(ORDER_STATUS);

/**
 * Paid and still being worked on — the kitchen queue, and the member's
 * "active orders" list. Note this is three states, not just `placed`:
 * anything filtering on `status = 'placed'` to mean "open" must use this.
 */
export const OPEN_ORDER_STATUSES: OrderStatus[] = [
  ORDER_STATUS.PLACED,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY,
];

/** Statuses whose money should NOT count toward revenue. */
export const NON_REVENUE_ORDER_STATUSES: OrderStatus[] = [
  ORDER_STATUS.PENDING_PAYMENT,
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.REFUNDED,
];

/** The customer has paid (whether or not the order is finished). */
export const PAID_ORDER_STATUSES: OrderStatus[] = [
  ORDER_STATUS.PLACED,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY,
  ORDER_STATUS.COMPLETED,
  ORDER_STATUS.REFUNDED,
];

/** Nothing more will happen to the order. */
export const TERMINAL_ORDER_STATUSES: OrderStatus[] = [
  ORDER_STATUS.COMPLETED,
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.REFUNDED,
];

/**
 * Allowed transitions. Kitchen staff may skip `preparing` and go straight to
 * `ready` (a cake already in the display case), and may hand an order over
 * without marking it ready first, so `placed → completed` is permitted.
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [ORDER_STATUS.PENDING_PAYMENT]: [ORDER_STATUS.PLACED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.PLACED]: [
    ORDER_STATUS.PREPARING,
    ORDER_STATUS.READY,
    ORDER_STATUS.COMPLETED,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.PREPARING]: [
    ORDER_STATUS.READY,
    ORDER_STATUS.COMPLETED,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.READY]: [ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.COMPLETED]: [ORDER_STATUS.REFUNDED],
  [ORDER_STATUS.CANCELLED]: [ORDER_STATUS.REFUNDED],
  [ORDER_STATUS.REFUNDED]: [],
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === 'string' &&
    (ALL_ORDER_STATUSES as string[]).includes(value)
  );
}

export function canTransitionOrder(from: string, to: OrderStatus): boolean {
  if (!isOrderStatus(from)) return false;
  return TRANSITIONS[from].includes(to);
}

/**
 * A member may cancel their own order only before the kitchen starts work.
 * After that it goes through support (admin refund).
 */
export function isMemberCancellable(status: string): boolean {
  return status === ORDER_STATUS.PLACED;
}

/** Member-facing progress step, for the order tracking UI. */
export function orderProgressStep(status: string): 0 | 1 | 2 | 3 {
  switch (status) {
    case ORDER_STATUS.PLACED:
      return 0;
    case ORDER_STATUS.PREPARING:
      return 1;
    case ORDER_STATUS.READY:
      return 2;
    case ORDER_STATUS.COMPLETED:
      return 3;
    default:
      return 0;
  }
}
