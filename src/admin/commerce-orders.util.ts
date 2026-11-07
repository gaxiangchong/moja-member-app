import { Prisma } from '@prisma/client';
import { ORDER_STATUS, type OrderStatus } from '../orders/order-status';
import {
  addDaysYmd,
  SHOP_TIME_ZONE,
  zonedWallToUtc,
} from '../orders/pickup-rules';

/** The status tabs on the admin Orders screen. */
export const ORDER_TABS = [
  'all',
  'to_make',
  'ready',
  'collected',
  'awaiting_payment',
  'cancelled',
] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

/** Statuses each tab shows; `all` has no filter. */
export const TAB_STATUSES: Record<Exclude<OrderTab, 'all'>, OrderStatus[]> = {
  to_make: [ORDER_STATUS.PLACED, ORDER_STATUS.PREPARING],
  ready: [ORDER_STATUS.READY],
  collected: [ORDER_STATUS.COMPLETED],
  awaiting_payment: [ORDER_STATUS.PENDING_PAYMENT],
  cancelled: [ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED],
};

/** How the order leaves the shop, as the admin filters it. */
export const ORDER_KINDS = [
  'in_store',
  'pickup',
  'delivery',
  'parcel',
] as const;
export type OrderKind = (typeof ORDER_KINDS)[number];

export function kindWhere(kind: OrderKind): Prisma.CustomerOrderWhereInput {
  switch (kind) {
    case 'in_store':
      return { fulfilmentType: 'IN_STORE' };
    case 'pickup':
      return { fulfilmentType: 'PICKUP' };
    case 'parcel':
      return { fulfilmentType: 'DELIVERY', deliveryMethod: 'SHIPPING' };
    case 'delivery':
      return {
        fulfilmentType: 'DELIVERY',
        OR: [{ deliveryMethod: null }, { deliveryMethod: { not: 'SHIPPING' } }],
      };
  }
}

/** The kind of one order, for display. */
export function orderKind(o: {
  fulfilmentType: string;
  deliveryMethod: string | null;
}): OrderKind {
  if (o.fulfilmentType === 'IN_STORE') return 'in_store';
  if (o.fulfilmentType === 'PICKUP') return 'pickup';
  return o.deliveryMethod === 'SHIPPING' ? 'parcel' : 'delivery';
}

/**
 * One search box for order number, customer (name or phone) and product.
 * A number also matches the order number exactly.
 */
export function searchWhere(
  raw: string,
): Prisma.CustomerOrderWhereInput | null {
  const q = raw.trim().replace(/^#/, '');
  if (!q) return null;
  const or: Prisma.CustomerOrderWhereInput[] = [
    { customer: { displayName: { contains: q, mode: 'insensitive' } } },
    { lines: { some: { name: { contains: q, mode: 'insensitive' } } } },
  ];
  const digits = q.replace(/\D/g, '');
  if (/^\d+$/.test(q) && q.length <= 9) {
    or.push({ orderNumber: Number(q) });
  }
  if (digits.length >= 4) {
    // Phones are stored as +60…; match the tail so "0123456789" finds them.
    or.push({
      customer: { phoneE164: { contains: digits.replace(/^0/, '') } },
    });
  }
  return { OR: or };
}

/**
 * Instants for yyyy-mm-dd shop days (both inclusive): an order placed at 7am
 * in Kuala Lumpur belongs to that day, though it is the day before in UTC.
 */
export function shopDayRange(
  from?: string,
  to?: string,
): { gte?: Date; lt?: Date } {
  return {
    ...(from
      ? { gte: zonedWallToUtc(from.slice(0, 10), '00:00', SHOP_TIME_ZONE) }
      : {}),
    ...(to
      ? {
          lt: zonedWallToUtc(
            addDaysYmd(to.slice(0, 10), 1),
            '00:00',
            SHOP_TIME_ZONE,
          ),
        }
      : {}),
  };
}
