import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportingSettingsService } from './reporting-settings.service';
import { FinanceOverviewQueryDto } from './dto/finance-overview-query.dto';
import {
  SalesChannel,
  UnifiedTransactionsQueryDto,
} from './dto/unified-transactions-query.dto';
import {
  FinanceOverviewResult,
  FinanceSeriesPoint,
  UnifiedTransactionRow,
  UnifiedTransactionsResult,
} from './finance-report.types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Online-shop revenue: any customer_order that is not still awaiting payment or
 * cancelled — matches getCakeSalesAnalytics so figures agree across views.
 */
const ONLINE_PAID = Prisma.sql`o.status NOT IN ('pending_payment', 'cancelled')`;
/** Bento revenue: a successful bento subscription payment. */
const BENTO_PAID = Prisma.sql`pi.purpose = 'bento_subscription' AND pi.status = 'SUCCEEDED'`;
/**
 * POS revenue: an in-store receipt that is NOT the settlement of one of our own
 * online orders (those are already counted in the online channel).
 */
const POS_ONLY = Prisma.sql`pr.origin_online_order_id IS NULL`;

type TotalsRow = { cnt: bigint; gmv: bigint };

/**
 * Consolidated cross-channel financial reporting over the three sales sources
 * that live in member-app: in-store POS (pos_receipts), online shop
 * (customer_orders) and bento (payment_intents). Each channel keeps its own
 * source-of-truth table; this service unions them at read time and never
 * copies rows, so there is a single set of numbers with no bookkeeping drift.
 *
 * Note on day boundaries: POS books on its Asia/Kuala_Lumpur business date,
 * while online/bento bucket on their UTC timestamps (as the existing sales
 * analytics do). At day granularity this can shift a late-night transaction by
 * up to 8h between channels; totals over a range are unaffected.
 */
@Injectable()
export class FinanceReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportingSettings: ReportingSettingsService,
  ) {}

  private salesFloor(): Date | null {
    return this.reportingSettings.getSalesStartDate();
  }

  private resolveRange(q: { from?: string; to?: string }): {
    from: Date;
    to: Date;
  } {
    const now = new Date();
    const to = q.to ? new Date(q.to) : now;
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * 86400000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'from and to must be valid ISO dates',
      });
    }
    if (from.getTime() >= to.getTime()) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'from must be before to',
      });
    }
    if (to.getTime() - from.getTime() > 800 * 86400000) {
      throw new BadRequestException({
        code: 'RANGE_TOO_LARGE',
        message: 'Date range cannot exceed 800 days',
      });
    }
    return { from, to };
  }

  /** Raise the lower bound to the configured sales cutoff, if any. */
  private clampFrom(from: Date): Date {
    const floor = this.salesFloor();
    return floor && floor.getTime() > from.getTime() ? floor : from;
  }

  // ---- Channel totals ---------------------------------------------------

  private async channelTotals(
    from: Date,
    to: Date,
  ): Promise<Record<SalesChannel, { revenueCents: number; orders: number }>> {
    const [online, bento, pos] = await Promise.all([
      this.prisma.$queryRaw<TotalsRow[]>`
        SELECT COUNT(*)::bigint AS cnt, COALESCE(SUM(o.total_cents), 0)::bigint AS gmv
        FROM customer_orders o
        WHERE ${ONLINE_PAID} AND o.placed_at >= ${from} AND o.placed_at < ${to}
      `,
      this.prisma.$queryRaw<TotalsRow[]>`
        SELECT COUNT(*)::bigint AS cnt, COALESCE(SUM(pi.amount_cents), 0)::bigint AS gmv
        FROM payment_intents pi
        WHERE ${BENTO_PAID} AND pi.updated_at >= ${from} AND pi.updated_at < ${to}
      `,
      this.prisma.$queryRaw<TotalsRow[]>`
        SELECT COUNT(*)::bigint AS cnt, COALESCE(SUM(pr.net_cents), 0)::bigint AS gmv
        FROM pos_receipts pr
        WHERE ${POS_ONLY} AND pr.business_date >= (${from} AT TIME ZONE 'UTC')::date AND pr.business_date < (${to} AT TIME ZONE 'UTC')::date
      `,
    ]);
    return {
      online_shop: {
        revenueCents: Number(online[0]?.gmv ?? 0n),
        orders: Number(online[0]?.cnt ?? 0n),
      },
      bento: {
        revenueCents: Number(bento[0]?.gmv ?? 0n),
        orders: Number(bento[0]?.cnt ?? 0n),
      },
      pos: {
        revenueCents: Number(pos[0]?.gmv ?? 0n),
        orders: Number(pos[0]?.cnt ?? 0n),
      },
    };
  }

  // ---- Overview ---------------------------------------------------------

  async getFinanceOverview(
    query: FinanceOverviewQueryDto,
  ): Promise<FinanceOverviewResult> {
    const now = new Date();
    const { from: rawFrom, to } = this.resolveRange(query);
    const bucket = query.bucket ?? 'month';
    const from = this.clampFrom(rawFrom);

    // Previous window of equal length, immediately preceding [from, to).
    const windowMs = to.getTime() - from.getTime();
    const prevTo = from;
    const prevFrom = new Date(from.getTime() - windowMs);

    if (from.getTime() >= to.getTime()) {
      return this.emptyOverview(from, to, bucket, now, prevFrom, prevTo);
    }

    const truncUnit = Prisma.raw(`'${bucket}'`);

    const [
      current,
      previous,
      posRefunds,
      bentoRefunds,
      posMethods,
      onlineSeries,
      bentoSeries,
      posSeries,
      topProducts,
    ] = await Promise.all([
      this.channelTotals(from, to),
      this.channelTotals(prevFrom, prevTo),
      this.prisma.$queryRaw<TotalsRow[]>`
        SELECT COUNT(*)::bigint AS cnt, COALESCE(SUM(amount_cents), 0)::bigint AS gmv
        FROM pos_credit_notes
        WHERE business_date >= (${from} AT TIME ZONE 'UTC')::date AND business_date < (${to} AT TIME ZONE 'UTC')::date
      `,
      // Bento stores no refund timestamp (only createdAt + status), so refunds
      // are attributed to the subscription's purchase date. total_cents is the
      // subscription price — no payment_intents join needed.
      this.prisma.$queryRaw<TotalsRow[]>`
        SELECT COUNT(*)::bigint AS cnt, COALESCE(SUM(bs.total_cents), 0)::bigint AS gmv
        FROM bento_subscriptions bs
        WHERE bs.status = 'REFUNDED' AND bs.created_at >= ${from} AND bs.created_at < ${to}
      `,
      this.prisma.$queryRaw<{ method: string | null; cnt: bigint; gmv: bigint }[]>`
        SELECT pr.payment_type AS method,
               COUNT(*)::bigint AS cnt,
               COALESCE(SUM(pr.net_cents), 0)::bigint AS gmv
        FROM pos_receipts pr
        WHERE ${POS_ONLY} AND pr.business_date >= (${from} AT TIME ZONE 'UTC')::date AND pr.business_date < (${to} AT TIME ZONE 'UTC')::date
        GROUP BY pr.payment_type
      `,
      // Series buckets: date_trunc on the *naive* (UTC-valued) timestamp, then
      // AT TIME ZONE 'UTC' to return a true UTC instant. Keeps bucket keys
      // deterministic regardless of the DB server's timezone, so the three
      // channels always merge onto the same period.
      this.prisma.$queryRaw<{ period_start: Date; gmv: bigint; cnt: bigint }[]>`
        SELECT (date_trunc(${truncUnit}, o.placed_at) AT TIME ZONE 'UTC') AS period_start,
               COALESCE(SUM(o.total_cents), 0)::bigint AS gmv,
               COUNT(*)::bigint AS cnt
        FROM customer_orders o
        WHERE ${ONLINE_PAID} AND o.placed_at >= ${from} AND o.placed_at < ${to}
        GROUP BY 1 ORDER BY 1 ASC
      `,
      this.prisma.$queryRaw<{ period_start: Date; gmv: bigint; cnt: bigint }[]>`
        SELECT (date_trunc(${truncUnit}, pi.updated_at) AT TIME ZONE 'UTC') AS period_start,
               COALESCE(SUM(pi.amount_cents), 0)::bigint AS gmv,
               COUNT(*)::bigint AS cnt
        FROM payment_intents pi
        WHERE ${BENTO_PAID} AND pi.updated_at >= ${from} AND pi.updated_at < ${to}
        GROUP BY 1 ORDER BY 1 ASC
      `,
      this.prisma.$queryRaw<{ period_start: Date; gmv: bigint; cnt: bigint }[]>`
        SELECT (date_trunc(${truncUnit}, pr.business_date::timestamp) AT TIME ZONE 'UTC') AS period_start,
               COALESCE(SUM(pr.net_cents), 0)::bigint AS gmv,
               COUNT(*)::bigint AS cnt
        FROM pos_receipts pr
        WHERE ${POS_ONLY} AND pr.business_date >= (${from} AT TIME ZONE 'UTC')::date AND pr.business_date < (${to} AT TIME ZONE 'UTC')::date
        GROUP BY 1 ORDER BY 1 ASC
      `,
      this.topProducts(from, to),
    ]);

    const series = this.mergeSeries(onlineSeries, bentoSeries, posSeries);

    const byChannel = (['pos', 'online_shop', 'bento'] as SalesChannel[]).map(
      (channel) => {
        const t = current[channel];
        const refundsCents =
          channel === 'pos'
            ? Number(posRefunds[0]?.gmv ?? 0n)
            : channel === 'bento'
              ? Number(bentoRefunds[0]?.gmv ?? 0n)
              : 0;
        return {
          channel,
          revenueCents: t.revenueCents,
          orders: t.orders,
          averageOrderValueCents:
            t.orders > 0 ? Math.round(t.revenueCents / t.orders) : 0,
          refundsCents,
        };
      },
    );

    const revenueCents = byChannel.reduce((s, c) => s + c.revenueCents, 0);
    const orders = byChannel.reduce((s, c) => s + c.orders, 0);
    const prevRevenue =
      previous.pos.revenueCents +
      previous.online_shop.revenueCents +
      previous.bento.revenueCents;
    const prevOrders =
      previous.pos.orders + previous.online_shop.orders + previous.bento.orders;

    const posRefundCents = Number(posRefunds[0]?.gmv ?? 0n);
    const posRefundCount = Number(posRefunds[0]?.cnt ?? 0n);
    const bentoRefundCents = Number(bentoRefunds[0]?.gmv ?? 0n);
    const bentoRefundCount = Number(bentoRefunds[0]?.cnt ?? 0n);
    const refundsTotal = posRefundCents + bentoRefundCents;

    const paymentMethods = this.buildPaymentMethods(
      posMethods,
      current.online_shop,
      current.bento,
    );

    return {
      meta: {
        from: from.toISOString(),
        to: to.toISOString(),
        bucket,
        generatedAt: now.toISOString(),
        previousFrom: prevFrom.toISOString(),
        previousTo: prevTo.toISOString(),
      },
      totals: {
        revenueCents,
        orders,
        averageOrderValueCents: orders > 0 ? Math.round(revenueCents / orders) : 0,
        refundsCents: refundsTotal,
        netRevenueCents: revenueCents - refundsTotal,
      },
      previous: { revenueCents: prevRevenue, orders: prevOrders },
      deltas: {
        revenuePct: pctDelta(revenueCents, prevRevenue),
        ordersPct: pctDelta(orders, prevOrders),
      },
      byChannel,
      series,
      paymentMethods,
      refunds: {
        posCents: posRefundCents,
        posCount: posRefundCount,
        bentoCents: bentoRefundCents,
        bentoCount: bentoRefundCount,
        totalCents: refundsTotal,
      },
      topProducts,
    };
  }

  private buildPaymentMethods(
    posMethods: { method: string | null; cnt: bigint; gmv: bigint }[],
    online: { revenueCents: number; orders: number },
    bento: { revenueCents: number; orders: number },
  ): FinanceOverviewResult['paymentMethods'] {
    const rows = posMethods.map((m) => ({
      method: m.method ? `In-store — ${m.method}` : 'In-store — unspecified',
      revenueCents: Number(m.gmv),
      count: Number(m.cnt),
    }));
    if (online.orders > 0) {
      rows.push({
        method: 'Online — shop',
        revenueCents: online.revenueCents,
        count: online.orders,
      });
    }
    if (bento.orders > 0) {
      rows.push({
        method: 'Online — bento',
        revenueCents: bento.revenueCents,
        count: bento.orders,
      });
    }
    return rows.sort((a, b) => b.revenueCents - a.revenueCents);
  }

  private mergeSeries(
    online: { period_start: Date; gmv: bigint; cnt: bigint }[],
    bento: { period_start: Date; gmv: bigint; cnt: bigint }[],
    pos: { period_start: Date; gmv: bigint; cnt: bigint }[],
  ): FinanceSeriesPoint[] {
    const map = new Map<string, FinanceSeriesPoint>();
    const ensure = (d: Date): FinanceSeriesPoint => {
      const key = d.toISOString();
      let e = map.get(key);
      if (!e) {
        e = {
          periodStart: key,
          posRevenueCents: 0,
          onlineShopRevenueCents: 0,
          bentoRevenueCents: 0,
          totalRevenueCents: 0,
          totalOrders: 0,
        };
        map.set(key, e);
      }
      return e;
    };
    for (const r of online) {
      const e = ensure(r.period_start);
      e.onlineShopRevenueCents = Number(r.gmv);
      e.totalOrders += Number(r.cnt);
    }
    for (const r of bento) {
      const e = ensure(r.period_start);
      e.bentoRevenueCents = Number(r.gmv);
      e.totalOrders += Number(r.cnt);
    }
    for (const r of pos) {
      const e = ensure(r.period_start);
      e.posRevenueCents = Number(r.gmv);
      e.totalOrders += Number(r.cnt);
    }
    for (const e of map.values()) {
      e.totalRevenueCents =
        e.posRevenueCents + e.onlineShopRevenueCents + e.bentoRevenueCents;
    }
    return Array.from(map.values()).sort((a, b) =>
      a.periodStart < b.periodStart ? -1 : a.periodStart > b.periodStart ? 1 : 0,
    );
  }

  private async topProducts(
    from: Date,
    to: Date,
  ): Promise<FinanceOverviewResult['topProducts']> {
    const [online, pos, bento] = await Promise.all([
      this.prisma.$queryRaw<
        { product_id: string; name: string; qty: bigint; revenue: bigint }[]
      >`
        SELECT l.product_id AS product_id, MAX(l.name) AS name,
               SUM(l.qty)::bigint AS qty,
               SUM(l.unit_price_cents * l.qty)::bigint AS revenue
        FROM customer_order_lines l
        INNER JOIN customer_orders o ON o.id = l.order_id
        WHERE ${ONLINE_PAID} AND o.placed_at >= ${from} AND o.placed_at < ${to}
        GROUP BY l.product_id ORDER BY revenue DESC LIMIT 25
      `,
      this.prisma.$queryRaw<
        { product_id: string | null; name: string; qty: bigint; revenue: bigint }[]
      >`
        SELECT prl.product_code AS product_id, MAX(prl.name) AS name,
               SUM(prl.qty)::bigint AS qty,
               SUM(prl.line_total_cents)::bigint AS revenue
        FROM pos_receipt_lines prl
        INNER JOIN pos_receipts pr ON pr.id = prl.receipt_id
        WHERE ${POS_ONLY} AND pr.business_date >= (${from} AT TIME ZONE 'UTC')::date AND pr.business_date < (${to} AT TIME ZONE 'UTC')::date
        GROUP BY prl.product_code ORDER BY revenue DESC LIMIT 25
      `,
      this.prisma.$queryRaw<
        { product_id: string; name: string; qty: bigint; revenue: bigint }[]
      >`
        SELECT bp.code AS product_id, MAX(bp.label) AS name,
               COUNT(*)::bigint AS qty,
               SUM(pi.amount_cents)::bigint AS revenue
        FROM payment_intents pi
        INNER JOIN bento_subscriptions bs ON bs.payment_intent_id = pi.id
        INNER JOIN bento_packages bp ON bp.id = bs.package_id
        WHERE ${BENTO_PAID} AND pi.updated_at >= ${from} AND pi.updated_at < ${to}
        GROUP BY bp.code ORDER BY revenue DESC LIMIT 25
      `,
    ]);

    const tag = (
      rows: { product_id: string | null; name: string; qty: bigint; revenue: bigint }[],
      channel: SalesChannel,
    ) =>
      rows.map((r) => ({
        channel,
        productId: r.product_id ?? '(unknown)',
        name: r.name,
        qtySold: Number(r.qty),
        revenueCents: Number(r.revenue),
      }));

    return [
      ...tag(online, 'online_shop'),
      ...tag(pos, 'pos'),
      ...tag(bento, 'bento'),
    ]
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, 25);
  }

  private emptyOverview(
    from: Date,
    to: Date,
    bucket: 'day' | 'week' | 'month',
    now: Date,
    prevFrom: Date,
    prevTo: Date,
  ): FinanceOverviewResult {
    const byChannel = (['pos', 'online_shop', 'bento'] as SalesChannel[]).map(
      (channel) => ({
        channel,
        revenueCents: 0,
        orders: 0,
        averageOrderValueCents: 0,
        refundsCents: 0,
      }),
    );
    return {
      meta: {
        from: from.toISOString(),
        to: to.toISOString(),
        bucket,
        generatedAt: now.toISOString(),
        previousFrom: prevFrom.toISOString(),
        previousTo: prevTo.toISOString(),
      },
      totals: {
        revenueCents: 0,
        orders: 0,
        averageOrderValueCents: 0,
        refundsCents: 0,
        netRevenueCents: 0,
      },
      previous: { revenueCents: 0, orders: 0 },
      deltas: { revenuePct: null, ordersPct: null },
      byChannel,
      series: [],
      paymentMethods: [],
      refunds: {
        posCents: 0,
        posCount: 0,
        bentoCents: 0,
        bentoCount: 0,
        totalCents: 0,
      },
      topProducts: [],
    };
  }

  // ---- Unified transactions --------------------------------------------

  /**
   * Builds the UNION CTE of all three channels plus the caller's filter
   * predicates. Shared by the data and count queries so both see the same rows.
   */
  private transactionsCte(
    from: Date,
    to: Date,
    query: UnifiedTransactionsQueryDto,
  ): Prisma.Sql {
    const filters: Prisma.Sql[] = [
      Prisma.sql`tx.occurred_at >= ${from} AND tx.occurred_at < ${to}`,
    ];
    if (query.channel) {
      filters.push(Prisma.sql`tx.channel = ${query.channel}`);
    }
    if (query.paymentMethod) {
      filters.push(Prisma.sql`tx.payment_method = ${query.paymentMethod}`);
    }
    if (query.customerId && UUID_RE.test(query.customerId)) {
      filters.push(Prisma.sql`tx.customer_id = ${query.customerId}::uuid`);
    }
    if (query.minAmountCents != null) {
      filters.push(Prisma.sql`tx.amount_cents >= ${query.minAmountCents}`);
    }
    if (query.maxAmountCents != null) {
      filters.push(Prisma.sql`tx.amount_cents <= ${query.maxAmountCents}`);
    }
    const where = Prisma.join(filters, ' AND ');

    return Prisma.sql`
      WITH tx AS (
        SELECT 'online_shop'::text AS channel, o.id::text AS id,
               o.placed_at AS occurred_at, o.total_cents AS amount_cents,
               o.customer_id AS customer_id, NULL::text AS payment_method,
               o.order_number::text AS reference
        FROM customer_orders o
        WHERE ${ONLINE_PAID}
        UNION ALL
        SELECT 'bento'::text, pi.id::text, pi.updated_at, pi.amount_cents,
               pi.customer_id, 'online'::text, NULL::text
        FROM payment_intents pi
        WHERE ${BENTO_PAID}
        UNION ALL
        SELECT 'pos'::text, pr.id::text,
               COALESCE(pr.sold_at, pr.business_date::timestamp), pr.net_cents,
               pr.customer_id, pr.payment_type, pr.receipt_number
        FROM pos_receipts pr
        WHERE ${POS_ONLY}
      )
      SELECT tx.*, c.display_name AS display_name, c.phone_e164 AS phone_e164
      FROM tx
      LEFT JOIN customers c ON c.id = tx.customer_id
      WHERE ${where}
    `;
  }

  async getUnifiedTransactions(
    query: UnifiedTransactionsQueryDto,
  ): Promise<UnifiedTransactionsResult> {
    const now = new Date();
    const { from: rawFrom, to } = this.resolveRange(query);
    const from = this.clampFrom(rawFrom);
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50));
    const offset = (page - 1) * pageSize;

    if (from.getTime() >= to.getTime()) {
      return {
        meta: {
          from: from.toISOString(),
          to: to.toISOString(),
          generatedAt: now.toISOString(),
          page,
          pageSize,
          total: 0,
          totalPages: 0,
        },
        totalsInFilter: { amountCents: 0, count: 0 },
        transactions: [],
      };
    }

    const cte = this.transactionsCte(from, to, query);

    const [rows, totalRow] = await Promise.all([
      this.prisma.$queryRaw<
        {
          channel: SalesChannel;
          id: string;
          occurred_at: Date;
          amount_cents: number;
          payment_method: string | null;
          reference: string | null;
          customer_id: string | null;
          display_name: string | null;
          phone_e164: string | null;
        }[]
      >`${cte} ORDER BY occurred_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
      this.prisma.$queryRaw<{ cnt: bigint; total: bigint }[]>`
        SELECT COUNT(*)::bigint AS cnt,
               COALESCE(SUM(amount_cents), 0)::bigint AS total
        FROM (${cte}) counted
      `,
    ]);

    const total = Number(totalRow[0]?.cnt ?? 0n);
    const transactions: UnifiedTransactionRow[] = rows.map((r) => ({
      channel: r.channel,
      id: r.id,
      occurredAt: r.occurred_at.toISOString(),
      amountCents: Number(r.amount_cents),
      paymentMethod: r.payment_method,
      reference: r.reference,
      customerId: r.customer_id,
      customerName: r.display_name,
      customerPhone: r.phone_e164,
    }));

    return {
      meta: {
        from: from.toISOString(),
        to: to.toISOString(),
        generatedAt: now.toISOString(),
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      totalsInFilter: {
        amountCents: Number(totalRow[0]?.total ?? 0n),
        count: total,
      },
      transactions,
    };
  }

  unifiedTransactionsToCsv(payload: UnifiedTransactionsResult): string {
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines: string[] = [];
    lines.push(
      'channel,occurredAt,amountCents,paymentMethod,reference,customerId,customerName,customerPhone',
    );
    for (const t of payload.transactions) {
      lines.push(
        [
          t.channel,
          t.occurredAt,
          t.amountCents,
          t.paymentMethod,
          t.reference,
          t.customerId,
          t.customerName,
          t.customerPhone,
        ]
          .map(esc)
          .join(','),
      );
    }
    return lines.join('\n');
  }
}

/** Percentage change from previous to current; null when previous is 0. */
function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}
