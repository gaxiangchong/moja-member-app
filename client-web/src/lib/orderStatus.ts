/**
 * Client-side mirror of the API's order lifecycle (`src/orders/order-status.ts`).
 * Keep the two in sync — the API is authoritative.
 */
export const ORDER_STATUS = {
  PENDING_PAYMENT: 'pending_payment',
  PLACED: 'placed',
  PREPARING: 'preparing',
  READY: 'ready',
  /** Collected at the counter, or delivered. */
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

/** Paid and still in progress — shown under "Active" in the Orders tab. */
export const OPEN_ORDER_STATUSES: string[] = [
  ORDER_STATUS.PLACED,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY,
];

export function isOpenOrderStatus(status: string | null | undefined): boolean {
  return OPEN_ORDER_STATUSES.includes(status ?? ORDER_STATUS.PLACED);
}

/** Finished, shown under "History". */
export function isHistoryOrderStatus(
  status: string | null | undefined,
): boolean {
  return (
    status === ORDER_STATUS.COMPLETED ||
    status === ORDER_STATUS.CANCELLED ||
    status === ORDER_STATUS.REFUNDED
  );
}

/** Zero-based position in the placed → preparing → ready → collected timeline. */
export function orderProgressStep(status: string | null | undefined): number {
  switch (status) {
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

export function orderStatusLabel(
  status: string | null | undefined,
  fulfilmentType?: string | null,
): string {
  const delivery = fulfilmentType === 'DELIVERY';
  switch (status) {
    case ORDER_STATUS.PENDING_PAYMENT:
      return 'Awaiting payment';
    case ORDER_STATUS.PLACED:
      return 'Order received';
    case ORDER_STATUS.PREPARING:
      return 'Preparing';
    case ORDER_STATUS.READY:
      return delivery ? 'Ready — rider on the way' : 'Ready for pickup';
    case ORDER_STATUS.COMPLETED:
      return delivery ? 'Delivered' : 'Collected';
    case ORDER_STATUS.CANCELLED:
      return 'Cancelled';
    case ORDER_STATUS.REFUNDED:
      return 'Refunded';
    default:
      return status ?? '';
  }
}
