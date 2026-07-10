import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { AuditService } from '../audit/audit.service';
import {
  parseCreditNote,
  parseReceipt,
  type ParsedCreditNote,
  type ParsedReceipt,
} from './salesplay-receipt.parser';

type SalesplayWebhookBody = {
  type?: string;
  merchant_id?: string;
  created_at?: string;
  receipts?: unknown[];
  credit_notes?: unknown[];
  [key: string]: unknown;
};

/**
 * Handles inbound SalesPlay webhooks. In-store receipts (`receipts.*`) are
 * persisted as the POS sales channel (pos_receipts) and, for receipts matched
 * to a member, converted into loyalty points. Credit notes (`credit_notes.*`)
 * are persisted as in-store refunds.
 *
 * SalesPlay does not sign webhooks, so we authenticate via a shared secret in
 * the URL (`?token=`) compared against SALESPLAY_WEBHOOK_TOKEN.
 *
 * The receipt JSON shape is not publicly documented; parsing lives in
 * salesplay-receipt.parser.ts (defensive, capture-first) and the raw payload is
 * always stored so field mapping can be tightened from real events.
 */
@Injectable()
export class SalesplayWebhookService {
  private readonly logger = new Logger(SalesplayWebhookService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
    private readonly audit: AuditService,
  ) {}

  verifyToken(token: string | undefined): void {
    const expected = this.config.get<string>('SALESPLAY_WEBHOOK_TOKEN')?.trim();
    if (!expected) {
      // Misconfiguration — refuse rather than accept unauthenticated callers.
      this.logger.error('SALESPLAY_WEBHOOK_TOKEN is not set; rejecting webhook.');
      throw new UnauthorizedException({ code: 'SALESPLAY_WEBHOOK_UNCONFIGURED' });
    }
    if (!token || token !== expected) {
      throw new UnauthorizedException({ code: 'SALESPLAY_WEBHOOK_FORBIDDEN' });
    }
  }

  /**
   * Earn rate (points per unit of currency spent). Unified across channels:
   * `LOYALTY_POINTS_PER_RM` is the canonical env used by both in-store
   * (SalesPlay) and online (member-app shop). Legacy `SALESPLAY_POINTS_PER_UNIT`
   * is honored as a fallback so existing deployments keep working.
   */
  private pointsPerUnit(): number {
    const unified = Number(this.config.get<string>('LOYALTY_POINTS_PER_RM'));
    if (Number.isFinite(unified) && unified > 0) return unified;
    const legacy = Number(this.config.get<string>('SALESPLAY_POINTS_PER_UNIT'));
    return Number.isFinite(legacy) && legacy > 0 ? legacy : 1;
  }

  async handleWebhook(
    token: string | undefined,
    body: SalesplayWebhookBody,
  ): Promise<void> {
    this.verifyToken(token);

    const type = (body?.type ?? '').toString();
    this.logger.log(`SalesPlay webhook received: ${type || '(no type)'}`);

    if (type.startsWith('receipts')) {
      await this.touchSyncState('receipts');
      await this.processReceiptBatch(body.receipts);
      return;
    }

    if (type.startsWith('credit_note')) {
      await this.touchSyncState('credit_notes');
      await this.processCreditNoteBatch(body.credit_notes);
      return;
    }

    // customers.update / inventory_levels.update / etc. — not handled yet.
    this.logger.debug(
      `Ignoring SalesPlay event ${type}: ${JSON.stringify(body).slice(0, 800)}`,
    );
  }

  private async touchSyncState(resource: string): Promise<void> {
    try {
      await this.prisma.salesplaySyncState.upsert({
        where: { resource },
        create: { resource, lastWebhookAt: new Date() },
        update: { lastWebhookAt: new Date() },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to record webhook time for ${resource}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async processReceiptBatch(receipts: unknown): Promise<void> {
    const list = Array.isArray(receipts) ? receipts : [];
    if (list.length === 0) {
      this.logger.warn('receipts event with no receipts array.');
      return;
    }
    for (const raw of list) {
      try {
        await this.ingestReceipt(raw, 'WEBHOOK');
      } catch (err) {
        this.logger.error(
          `Failed processing SalesPlay receipt: ${
            err instanceof Error ? err.message : String(err)
          } — ${JSON.stringify(raw).slice(0, 800)}`,
        );
      }
    }
  }

  private async processCreditNoteBatch(notes: unknown): Promise<void> {
    const list = Array.isArray(notes) ? notes : [];
    if (list.length === 0) {
      this.logger.warn('credit_notes event with no credit_notes array.');
      return;
    }
    for (const raw of list) {
      try {
        await this.ingestCreditNote(raw, 'WEBHOOK');
      } catch (err) {
        this.logger.error(
          `Failed processing SalesPlay credit note: ${
            err instanceof Error ? err.message : String(err)
          } — ${JSON.stringify(raw).slice(0, 800)}`,
        );
      }
    }
  }

  /**
   * Persists a receipt (idempotent by SalesPlay receipt id) and, for a newly
   * ingested receipt that belongs to a member and is not the settlement of one
   * of our online orders, awards loyalty points. Shared by the webhook and the
   * pull sync (source distinguishes them).
   *
   * Returns true when the receipt was newly ingested.
   */
  async ingestReceipt(
    raw: unknown,
    source: 'WEBHOOK' | 'PULL',
  ): Promise<boolean> {
    const parsed = parseReceipt(raw);
    if (!parsed) {
      this.logger.warn('SalesPlay receipt missing an id; skipping.');
      return false;
    }

    // Log the first real receipt shape so field mapping can be confirmed.
    this.logger.debug(`SalesPlay receipt payload: ${JSON.stringify(raw)}`);

    const existing = await this.prisma.posReceipt.findUnique({
      where: { salesplayReceiptId: parsed.salesplayReceiptId },
      select: { id: true },
    });
    if (existing) {
      this.logger.debug(
        `SalesPlay receipt ${parsed.salesplayReceiptId} already ingested; skipping.`,
      );
      return false;
    }

    const originOnlineOrderId = await this.matchOnlineOrder(parsed);
    const customerId = await this.matchCustomerId(parsed.customerHints);

    let receiptId: string;
    try {
      const created = await this.prisma.posReceipt.create({
        data: {
          salesplayReceiptId: parsed.salesplayReceiptId,
          receiptNumber: parsed.receiptNumber,
          shopId: parsed.shopId,
          terminal: parsed.terminal,
          businessDate: parsed.businessDate,
          soldAt: parsed.soldAt,
          grossCents: parsed.grossCents,
          discountCents: parsed.discountCents,
          taxCents: parsed.taxCents,
          netCents: parsed.netCents,
          paymentType: parsed.paymentType,
          customerId,
          originOnlineOrderId,
          source,
          rawPayload: raw as Prisma.InputJsonValue,
          lines: {
            create: parsed.lines.map((l) => ({
              productCode: l.productCode,
              name: l.name,
              qty: l.qty,
              unitPriceCents: l.unitPriceCents,
              lineTotalCents: l.lineTotalCents,
            })),
          },
        },
        select: { id: true },
      });
      receiptId = created.id;
    } catch (err) {
      // A concurrent delivery of the same receipt won the unique constraint —
      // treat as already ingested (the winner handles loyalty).
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        this.logger.debug(
          `SalesPlay receipt ${parsed.salesplayReceiptId} ingested concurrently; skipping.`,
        );
        return false;
      }
      throw err;
    }

    await this.audit.log({
      actorType: 'system',
      action: 'pos.receipt_ingested',
      entityType: 'pos_receipt',
      entityId: receiptId,
      metadata: {
        salesplayReceiptId: parsed.salesplayReceiptId,
        netCents: parsed.netCents,
        source,
        matchedCustomer: Boolean(customerId),
        originOnlineOrderId: originOnlineOrderId ?? undefined,
      },
    });

    await this.maybeAwardLoyalty(parsed, receiptId, customerId, originOnlineOrderId);
    return true;
  }

  private async maybeAwardLoyalty(
    parsed: ParsedReceipt,
    receiptId: string,
    customerId: string | null,
    originOnlineOrderId: string | null,
  ): Promise<void> {
    if (!customerId) return;
    // Online orders already earn points at checkout; their in-store settlement
    // receipt must not double-award.
    if (originOnlineOrderId) {
      this.logger.debug(
        `Receipt ${parsed.salesplayReceiptId} is online order ${originOnlineOrderId}; not re-awarding points.`,
      );
      return;
    }
    if (parsed.netCents <= 0) return;

    // Floor RM (major unit) before applying the rate — same formula as online
    // checkout (`CustomersService.finalizeShopOrderAfterPayment`) so both
    // channels award identical points for the same spend at any earn rate.
    const amountRm = Math.floor(parsed.netCents / 100);
    const points = Math.floor(amountRm * this.pointsPerUnit());
    if (points <= 0) return;

    await this.loyalty.appendLedgerEntry({
      customerId,
      deltaPoints: points,
      reason: 'salesplay_purchase',
      referenceType: 'pos_receipt',
      // pos_receipt id is a UUID, matching the ledger's referenceId column type.
      referenceId: receiptId,
    });

    await this.audit.log({
      actorType: 'system',
      action: 'loyalty.salesplay_purchase',
      entityType: 'customer',
      entityId: customerId,
      metadata: {
        receiptId,
        salesplayReceiptId: parsed.salesplayReceiptId,
        netCents: parsed.netCents,
        points,
      },
    });

    this.logger.log(
      `Awarded ${points} pts to ${customerId} for SalesPlay receipt ${parsed.salesplayReceiptId}.`,
    );
  }

  /** Persists a credit note (idempotent). Returns true when newly ingested. */
  async ingestCreditNote(
    raw: unknown,
    source: 'WEBHOOK' | 'PULL',
  ): Promise<boolean> {
    const parsed = parseCreditNote(raw);
    if (!parsed) {
      this.logger.warn('SalesPlay credit note missing an id; skipping.');
      return false;
    }

    const existing = await this.prisma.posCreditNote.findUnique({
      where: { salesplayCreditNoteId: parsed.salesplayCreditNoteId },
      select: { id: true },
    });
    if (existing) return false;

    const customerId = await this.matchCustomerId(parsed.customerHints);

    try {
      await this.prisma.posCreditNote.create({
        data: {
          salesplayCreditNoteId: parsed.salesplayCreditNoteId,
          salesplayReceiptId: parsed.salesplayReceiptId,
          businessDate: parsed.businessDate,
          amountCents: parsed.amountCents,
          reason: parsed.reason,
          customerId,
          source,
          rawPayload: raw as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return false;
      }
      throw err;
    }

    this.logger.log(
      `Ingested SalesPlay credit note ${parsed.salesplayCreditNoteId} (RM ${(
        parsed.amountCents / 100
      ).toFixed(2)}).`,
    );
    return true;
  }

  /**
   * If this receipt is the in-store settlement of one of our online orders,
   * returns that order's id (so it is excluded from POS-channel revenue and
   * loyalty). Matched by the references we send in `online_orders`:
   * system_unique_id, then order id (UUID), then order number.
   */
  private async matchOnlineOrder(
    parsed: ParsedReceipt,
  ): Promise<string | null> {
    const { systemUniqueId, orderReferenceId, orderReferenceNumber } =
      parsed.onlineOrderRefs;

    if (systemUniqueId) {
      const byUnique = await this.prisma.customerOrder.findFirst({
        where: { salesplaySystemUniqueId: systemUniqueId },
        select: { id: true },
      });
      if (byUnique) return byUnique.id;
    }

    // order_reference_id is our CustomerOrder UUID.
    if (orderReferenceId && isUuid(orderReferenceId)) {
      const byId = await this.prisma.customerOrder.findUnique({
        where: { id: orderReferenceId },
        select: { id: true },
      });
      if (byId) return byId.id;
    }

    // order_reference_number is our sequential order number.
    const orderNumber = Number(orderReferenceNumber);
    if (Number.isInteger(orderNumber) && orderNumber > 0) {
      const byNumber = await this.prisma.customerOrder.findUnique({
        where: { orderNumber },
        select: { id: true },
      });
      if (byNumber) return byNumber.id;
    }

    return null;
  }

  /** Match the receipt's customer to a member by SalesPlay id, then by phone. */
  private async matchCustomerId(hints: {
    salesplayCustomerId: string | null;
    phone: string | null;
  }): Promise<string | null> {
    if (hints.salesplayCustomerId) {
      const byId = await this.prisma.customer.findFirst({
        where: { salesplayCustomerId: hints.salesplayCustomerId },
        select: { id: true },
      });
      if (byId) return byId.id;
    }

    if (hints.phone) {
      const digits = hints.phone.replace(/\D/g, '');
      if (digits) {
        const phoneE164 = hints.phone.startsWith('+') ? hints.phone : `+${digits}`;
        const byPhone = await this.prisma.customer.findUnique({
          where: { phoneE164 },
          select: { id: true },
        });
        if (byPhone) return byPhone.id;
      }
    }

    return null;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
