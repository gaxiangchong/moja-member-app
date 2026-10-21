import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TIER_POINTS_MULTIPLIER } from '../loyalty/member-tier';
import { ORDER_STATUS } from '../orders/order-status';
import { PrismaService } from '../prisma/prisma.service';
import { parseReceipt } from '../salesplay/salesplay-receipt.parser';

/**
 * How a purchase's points line up with what the earn rule says it should get.
 *  - ok          points match base × a tier multiplier (1×, 1.5×, 2×)
 *  - missing     eligible purchase, no points awarded
 *  - mismatch    points awarded, but not a value the earn rule can produce
 *  - reversed    points were awarded and then fully reversed by an admin
 *  - not_eligible the earn rule does not award points (see `note`)
 */
export type PointsCheck = 'ok' | 'missing' | 'mismatch' | 'reversed' | 'not_eligible';

export type PurchaseHistoryItem = {
  channel: 'in_store' | 'online';
  id: string;
  reference: string;
  occurredAt: string;
  amountCents: number;
  items: { name: string; qty: number; lineTotalCents: number }[];
  pointsEarned: number;
  pointsRedeemed: number;
  pointsReversed: number;
  /** Earn ledger entries not yet reversed — what "Reverse points" undoes. */
  reversibleEntryIds: string[];
  /** Points the earn rule gives at 1× (before the tier multiplier). */
  basePoints: number;
  check: PointsCheck;
  note: string | null;
  refunded: boolean;
};

export type PurchaseHistory = {
  pointsPerRm: number;
  summary: {
    purchases: number;
    spendCents: number;
    pointsFromPurchases: number;
    missing: number;
    mismatch: number;
    /** Every ledger entry for the member, grouped — explains the balance. */
    ledger: {
      purchases: number;
      redemptions: number;
      reversals: number;
      other: number;
      balance: number;
    };
  };
  purchases: PurchaseHistoryItem[];
};

/** Points the earn rule can produce for this spend, one per tier. */
export function allowedPurchasePoints(amountCents: number, pointsPerRm: number): number[] {
  const rm = Math.floor(amountCents / 100);
  if (rm <= 0 || !(pointsPerRm > 0)) return [0];
  return Object.values(TIER_POINTS_MULTIPLIER).map((m) => Math.floor(rm * pointsPerRm * m));
}

export function classifyPurchasePoints(input: {
  eligible: boolean;
  amountCents: number;
  pointsPerRm: number;
  pointsEarned: number;
  pointsReversed: number;
}): PointsCheck {
  if (input.pointsEarned > 0 && input.pointsEarned + input.pointsReversed <= 0) {
    return 'reversed';
  }
  if (!input.eligible) return input.pointsEarned > 0 ? 'mismatch' : 'not_eligible';
  if (input.pointsEarned <= 0) {
    return allowedPurchasePoints(input.amountCents, input.pointsPerRm)[0] > 0
      ? 'missing'
      : 'not_eligible';
  }
  return allowedPurchasePoints(input.amountCents, input.pointsPerRm).includes(
    input.pointsEarned,
  )
    ? 'ok'
    : 'mismatch';
}

/** Ledger reasons written by the two purchase earn paths. */
const PURCHASE_EARN_REASONS = ['shop_order_purchase', 'salesplay_purchase'];

/** Statuses an online order only reaches once it has been paid. */
const PAID_ORDER_STATUSES: string[] = [
  ORDER_STATUS.PLACED,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY,
  ORDER_STATUS.COMPLETED,
];

/**
 * A member's in-store (SalesPlay) and online purchases side by side with the
 * points each one earned, so staff can confirm points match what was bought.
 * Read-only: it never awards or changes points.
 */
@Injectable()
export class CustomerPurchaseHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Same rate the earn paths use (LOYALTY_POINTS_PER_RM, legacy fallback). */
  pointsPerRm(): number {
    const unified = Number(this.config.get<string>('LOYALTY_POINTS_PER_RM'));
    if (Number.isFinite(unified) && unified > 0) return unified;
    const legacy = Number(this.config.get<string>('SALESPLAY_POINTS_PER_UNIT'));
    return Number.isFinite(legacy) && legacy > 0 ? legacy : 1;
  }

  async forCustomer(customerId: string, limit = 50): Promise<PurchaseHistory> {
    const take = Math.min(Math.max(limit, 1), 200);
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND', message: 'Member not found' });
    }

    const [receipts, orders, ledgerTotals] = await Promise.all([
      this.prisma.posReceipt.findMany({
        where: { customerId },
        orderBy: [{ businessDate: 'desc' }, { soldAt: 'desc' }],
        take,
        include: { lines: true },
      }),
      this.prisma.customerOrder.findMany({
        where: { customerId, status: { not: ORDER_STATUS.PENDING_PAYMENT } },
        orderBy: { placedAt: 'desc' },
        take,
        include: { lines: true },
      }),
      this.prisma.loyaltyLedgerEntry.groupBy({
        by: ['referenceType'],
        where: { customerId },
        _sum: { deltaPoints: true },
      }),
    ]);

    const receiptIds = receipts.map((r) => r.id);
    const orderIds = orders.map((o) => o.id);
    const linked = await this.prisma.loyaltyLedgerEntry.findMany({
      where: {
        customerId,
        OR: [
          { referenceType: 'pos_receipt', referenceId: { in: receiptIds } },
          { referenceType: 'customer_order', referenceId: { in: orderIds } },
        ],
      },
      select: { id: true, referenceId: true, deltaPoints: true, reason: true },
    });
    const reversals = linked.length
      ? await this.prisma.loyaltyLedgerEntry.findMany({
          where: { referenceType: 'reversal', referenceId: { in: linked.map((e) => e.id) } },
          select: { referenceId: true, deltaPoints: true },
        })
      : [];
    const reversalByEntry = new Map<string, number>();
    for (const r of reversals) {
      if (!r.referenceId) continue;
      reversalByEntry.set(r.referenceId, (reversalByEntry.get(r.referenceId) ?? 0) + r.deltaPoints);
    }
    const pointsFor = (purchaseId: string) => {
      let earned = 0;
      let redeemed = 0;
      let reversed = 0;
      const reversibleEntryIds: string[] = [];
      for (const e of linked) {
        if (e.referenceId !== purchaseId) continue;
        if (PURCHASE_EARN_REASONS.includes(e.reason)) {
          earned += e.deltaPoints;
          reversed += reversalByEntry.get(e.id) ?? 0;
          if (!reversalByEntry.has(e.id)) reversibleEntryIds.push(e.id);
        } else {
          // Checkout redemptions (−) net of any refund when the order is cancelled (+).
          redeemed -= e.deltaPoints;
        }
      }
      return { earned, redeemed, reversed, reversibleEntryIds };
    };

    const refundedReceiptIds = new Set(
      (
        await this.prisma.posCreditNote.findMany({
          where: {
            salesplayReceiptId: { in: receipts.map((r) => r.salesplayReceiptId) },
          },
          select: { salesplayReceiptId: true },
        })
      ).map((c) => c.salesplayReceiptId),
    );

    const rate = this.pointsPerRm();
    const purchases: PurchaseHistoryItem[] = [];
    /** Real completed sales — excludes settlements, voids and unpaid orders. */
    const countedSales = new Set<string>();

    for (const r of receipts) {
      const parsed = parseReceipt(r.rawPayload);
      let note: string | null = null;
      if (r.originOnlineOrderId) note = 'Settles an online order — points were given on that order';
      else if (parsed?.isDeleted) note = 'Deleted in SalesPlay';
      else if (parsed?.receiptType && parsed.receiptType.toUpperCase() !== 'SALE') {
        note = `${parsed.receiptType} receipt`;
      }
      if (note === null) countedSales.add(r.id);
      const p = pointsFor(r.id);
      const check = classifyPurchasePoints({
        eligible: note === null,
        amountCents: r.netCents,
        pointsPerRm: rate,
        pointsEarned: p.earned,
        pointsReversed: p.reversed,
      });
      if (check === 'not_eligible' && !note) note = 'Below RM 1';
      purchases.push({
        channel: 'in_store',
        id: r.id,
        reference: r.receiptNumber ?? r.salesplayReceiptId,
        occurredAt: (r.soldAt ?? r.businessDate).toISOString(),
        amountCents: r.netCents,
        items: r.lines.map((l) => ({ name: l.name, qty: l.qty, lineTotalCents: l.lineTotalCents })),
        pointsEarned: p.earned,
        pointsRedeemed: p.redeemed,
        pointsReversed: p.reversed,
        reversibleEntryIds: p.reversibleEntryIds,
        basePoints: allowedPurchasePoints(r.netCents, rate)[0],
        check,
        note,
        refunded: refundedReceiptIds.has(r.salesplayReceiptId),
      });
    }

    for (const o of orders) {
      const paid = PAID_ORDER_STATUSES.includes(o.status);
      if (paid) countedSales.add(o.id);
      const p = pointsFor(o.id);
      const check = classifyPurchasePoints({
        eligible: paid,
        amountCents: o.totalCents,
        pointsPerRm: rate,
        pointsEarned: p.earned,
        pointsReversed: p.reversed,
      });
      let note: string | null = null;
      if (!paid) note = `Order ${o.status}`;
      else if (check === 'not_eligible') note = 'Below RM 1';
      purchases.push({
        channel: 'online',
        id: o.id,
        reference: `#${o.orderNumber}`,
        occurredAt: o.placedAt.toISOString(),
        amountCents: o.totalCents,
        items: o.lines.map((l) => ({
          name: l.name,
          qty: l.qty,
          lineTotalCents: l.unitPriceCents * l.qty,
        })),
        pointsEarned: p.earned,
        pointsRedeemed: p.redeemed,
        pointsReversed: p.reversed,
        reversibleEntryIds: p.reversibleEntryIds,
        basePoints: allowedPurchasePoints(o.totalCents, rate)[0],
        check,
        note,
        refunded: o.status === ORDER_STATUS.REFUNDED,
      });
    }

    purchases.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    const shown = purchases.slice(0, take);

    const sumOf = (types: (string | null)[]) =>
      ledgerTotals
        .filter((g) => types.includes(g.referenceType))
        .reduce((s, g) => s + (g._sum.deltaPoints ?? 0), 0);
    const balance = ledgerTotals.reduce((s, g) => s + (g._sum.deltaPoints ?? 0), 0);
    // Purchase references carry both earns and checkout redemptions; the
    // earn reasons tell them apart.
    const purchaseRefTotal = sumOf(['pos_receipt', 'customer_order']);
    const allPurchaseEntries = await this.prisma.loyaltyLedgerEntry.aggregate({
      where: {
        customerId,
        referenceType: { in: ['pos_receipt', 'customer_order'] },
        reason: { in: PURCHASE_EARN_REASONS },
      },
      _sum: { deltaPoints: true },
    });
    const purchaseEarn = allPurchaseEntries._sum.deltaPoints ?? 0;
    const redemptions = purchaseRefTotal - purchaseEarn + sumOf(['points_redeem']);
    const reversalsTotal = sumOf(['reversal']);

    return {
      pointsPerRm: rate,
      summary: {
        purchases: shown.length,
        spendCents: shown
          .filter((x) => countedSales.has(x.id))
          .reduce((s, x) => s + x.amountCents, 0),
        pointsFromPurchases: shown.reduce((s, x) => s + x.pointsEarned, 0),
        missing: shown.filter((x) => x.check === 'missing').length,
        mismatch: shown.filter((x) => x.check === 'mismatch').length,
        ledger: {
          purchases: purchaseEarn,
          redemptions,
          reversals: reversalsTotal,
          other: balance - purchaseEarn - redemptions - reversalsTotal,
          balance,
        },
      },
      purchases: shown,
    };
  }
}
