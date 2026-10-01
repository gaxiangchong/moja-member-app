import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NON_REVENUE_ORDER_STATUSES } from '../orders/order-status';
import { PrismaService } from '../prisma/prisma.service';

export type MemberSavings = {
  /** Everything the member has saved, in sen. */
  totalSavedCents: number;
  /** Discounts on app orders: vouchers and points rewards. */
  onlineSavedCents: number;
  /** Discounts on in-store receipts matched to the member. */
  inStoreSavedCents: number;
  /** App orders that fed the figure. */
  ordersCounted: number;
  /** When they joined — the figure covers everything since. */
  memberSince: string | null;
};

/**
 * How much money a member has saved by being a member.
 *
 * An order does not record its discount, but it records the original price of
 * every line and what was paid, so the discount is the difference. That holds
 * for every order ever placed, not just new ones. Delivery is excluded because
 * it is charged on top of the goods, not part of what was discounted.
 *
 * Only orders that were actually paid and kept count: unpaid, cancelled and
 * refunded orders saved the member nothing.
 */
@Injectable()
export class MemberSavingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSavings(customerId: string): Promise<MemberSavings> {
    const [online, inStore, customer] = await Promise.all([
      this.prisma.$queryRaw<{ saved: bigint; orders: bigint }[]>`
        SELECT
          COALESCE(SUM(GREATEST(0, ls.subtotal - (o.total_cents - o.delivery_fee_cents))), 0) AS "saved",
          COUNT(*) AS "orders"
        FROM customer_orders o
        CROSS JOIN LATERAL (
          SELECT COALESCE(SUM(l.unit_price_cents * l.qty), 0) AS subtotal
          FROM customer_order_lines l
          WHERE l.order_id = o.id
        ) ls
        WHERE o.customer_id = ${customerId}::uuid
          AND o.status NOT IN (${Prisma.join(NON_REVENUE_ORDER_STATUSES)})
      `,
      // The till's own settlement of an online order carries that order's
      // discount again, so it is left out rather than counted twice.
      this.prisma.posReceipt.aggregate({
        where: {
          customerId,
          originOnlineOrderId: null,
          discountCents: { gt: 0 },
        },
        _sum: { discountCents: true },
      }),
      this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { createdAt: true },
      }),
    ]);

    const onlineSavedCents = Number(online[0]?.saved ?? 0);
    const inStoreSavedCents = inStore._sum.discountCents ?? 0;
    return {
      totalSavedCents: onlineSavedCents + inStoreSavedCents,
      onlineSavedCents,
      inStoreSavedCents,
      ordersCounted: Number(online[0]?.orders ?? 0),
      memberSince: customer?.createdAt.toISOString() ?? null,
    };
  }
}
