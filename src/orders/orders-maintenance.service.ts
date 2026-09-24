import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { shopCalendarYmd } from '../bento/bento-shop-date.util';
import { PrismaService } from '../prisma/prisma.service';
import { ABANDONED_CHECKOUT_CANCEL_REASON, ORDER_STATUS } from './order-status';
import { ProductStockService } from './product-stock.service';

/**
 * Returns stock held by checkouts that were never paid for.
 *
 * A member who reaches the payment page and closes the tab leaves a
 * `pending_payment` order holding a reservation. Without this sweep that cake
 * stays unsellable for the rest of the day, which on a small daily bake is the
 * difference between selling out and turning people away.
 *
 * Lives here rather than in CustomersService so the orders module does not
 * have to depend back on customers (which already depends on orders).
 */
@Injectable()
export class OrdersMaintenanceService {
  private readonly logger = new Logger(OrdersMaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly productStock: ProductStockService,
    private readonly config: ConfigService,
  ) {}

  /** Generous enough for a slow bank/e-wallet redirect, short enough to matter. */
  private ttlMinutes(): number {
    const raw = Number(
      this.config.get<string>('ORDER_RESERVATION_TTL_MINUTES'),
    );
    return Number.isFinite(raw) && raw >= 5 ? Math.floor(raw) : 30;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweepAbandonedCheckouts(): Promise<void> {
    try {
      await this.releaseExpiredReservations(this.ttlMinutes());
    } catch (err) {
      this.logger.error(
        `Abandoned-checkout sweep failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** Cancels unpaid orders past the TTL and frees their reserved stock. */
  async releaseExpiredReservations(olderThanMinutes = 30): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
    const stale = await this.prisma.customerOrder.findMany({
      where: {
        status: ORDER_STATUS.PENDING_PAYMENT,
        placedAt: { lt: cutoff },
      },
      select: {
        id: true,
        scheduledDate: true,
        placedAt: true,
        lines: { select: { productId: true, qty: true } },
      },
      take: 200,
    });
    if (stale.length === 0) return 0;

    let released = 0;
    for (const order of stale) {
      const day =
        order.scheduledDate?.toISOString().slice(0, 10) ??
        shopCalendarYmd(order.placedAt);
      // Status and stock move together. If the payment webhook already placed
      // the order, updateMany matches nothing and the reservation stays with
      // it. A later successful payment of a row we do cancel is revived by
      // finalizeShopOrderAfterPayment because of the cancel reason below.
      const cancelled = await this.prisma.$transaction(async (tx) => {
        const result = await tx.customerOrder.updateMany({
          where: { id: order.id, status: ORDER_STATUS.PENDING_PAYMENT },
          data: {
            status: ORDER_STATUS.CANCELLED,
            cancelledAt: new Date(),
            cancelReason: ABANDONED_CHECKOUT_CANCEL_REASON,
          },
        });
        if (result.count === 0) return result;
        await this.productStock.releaseForOrderLines(order.lines, day, tx);
        return result;
      });
      if (cancelled.count === 0) continue;
      released += 1;
    }
    if (released > 0) {
      this.logger.log(
        `Released reservations for ${released} unpaid order(s) older than ${olderThanMinutes}m.`,
      );
    }
    return released;
  }
}
