import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { AuditService } from '../audit/audit.service';

type SalesplayWebhookBody = {
  type?: string;
  merchant_id?: string;
  created_at?: string;
  receipts?: unknown[];
  [key: string]: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** First present, non-empty string among the given keys. */
function pickString(
  obj: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
}

/** First present numeric value (accepts numeric strings) among the given keys. */
function pickNumber(
  obj: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) {
      return Number(v);
    }
  }
  return null;
}

/**
 * Handles inbound SalesPlay webhooks. Currently turns in-store receipts
 * (`receipts.update`) into loyalty points for the matching member.
 *
 * SalesPlay does not sign webhooks, so we authenticate via a shared secret in
 * the URL (`?token=`) compared against SALESPLAY_WEBHOOK_TOKEN.
 *
 * The receipt JSON shape is not publicly documented; parsing is defensive and
 * the raw payload is logged so the field names can be confirmed from a real
 * event and tightened here.
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

    if (!type.startsWith('receipts')) {
      // customers.update / inventory_levels.update / etc. — not handled yet.
      this.logger.debug(
        `Ignoring SalesPlay event ${type}: ${JSON.stringify(body).slice(0, 800)}`,
      );
      return;
    }

    const receipts = Array.isArray(body.receipts) ? body.receipts : [];
    if (receipts.length === 0) {
      this.logger.warn(
        `receipts event with no receipts array: ${JSON.stringify(body).slice(0, 800)}`,
      );
      return;
    }

    for (const raw of receipts) {
      try {
        await this.processReceipt(raw);
      } catch (err) {
        this.logger.error(
          `Failed processing SalesPlay receipt: ${
            err instanceof Error ? err.message : String(err)
          } — ${JSON.stringify(raw).slice(0, 800)}`,
        );
      }
    }
  }

  private async processReceipt(raw: unknown): Promise<void> {
    const receipt = asRecord(raw);
    if (!receipt) return;

    // Log the first real receipt shape so we can confirm field names.
    this.logger.debug(`SalesPlay receipt payload: ${JSON.stringify(receipt)}`);

    const receiptId = pickString(receipt, [
      'receipt_id',
      'id',
      'receipt_number',
      'receipt_no',
      'invoice_number',
    ]);
    if (!receiptId) {
      this.logger.warn('SalesPlay receipt missing an id; skipping.');
      return;
    }

    const customer = await this.findCustomer(receipt);
    if (!customer) {
      this.logger.log(
        `SalesPlay receipt ${receiptId} has no matching member; skipping points.`,
      );
      return;
    }

    const amount = pickNumber(receipt, [
      'total',
      'total_amount',
      'net_amount',
      'grand_total',
      'amount',
      'total_price',
    ]);
    if (amount == null || amount <= 0) {
      this.logger.log(
        `SalesPlay receipt ${receiptId} has no positive amount; skipping points.`,
      );
      return;
    }

    const points = Math.floor(amount * this.pointsPerUnit());
    if (points <= 0) return;

    // Idempotency: SalesPlay retries up to 200×, so never double-award a receipt.
    const existing = await this.prisma.loyaltyLedgerEntry.findFirst({
      where: {
        customerId: customer.id,
        referenceType: 'salesplay_receipt',
        referenceId: receiptId,
      },
      select: { id: true },
    });
    if (existing) {
      this.logger.debug(
        `SalesPlay receipt ${receiptId} already awarded; skipping.`,
      );
      return;
    }

    await this.loyalty.appendLedgerEntry({
      customerId: customer.id,
      deltaPoints: points,
      reason: 'salesplay_purchase',
      referenceType: 'salesplay_receipt',
      referenceId: receiptId,
    });

    await this.audit.log({
      actorType: 'system',
      action: 'loyalty.salesplay_purchase',
      entityType: 'customer',
      entityId: customer.id,
      metadata: { receiptId, amount, points },
    });

    this.logger.log(
      `Awarded ${points} pts to ${customer.id} for SalesPlay receipt ${receiptId}.`,
    );
  }

  /** Match the receipt's customer to a member by SalesPlay id, then by phone. */
  private async findCustomer(
    receipt: Record<string, unknown>,
  ): Promise<{ id: string } | null> {
    const salesplayCustomerId = pickString(receipt, [
      'customer_id',
      'customer',
      'customer_uid',
    ]);
    if (salesplayCustomerId) {
      const byId = await this.prisma.customer.findFirst({
        where: { salesplayCustomerId },
        select: { id: true },
      });
      if (byId) return byId;
    }

    const code = pickString(receipt, [
      'customer_code',
      'customer_mobile',
      'mobile_no',
      'phone_number',
      'telephone',
    ]);
    if (code) {
      const digits = code.replace(/\D/g, '');
      if (digits) {
        const phoneE164 = code.startsWith('+') ? code : `+${digits}`;
        const byPhone = await this.prisma.customer.findUnique({
          where: { phoneE164 },
          select: { id: true },
        });
        if (byPhone) return byPhone;
      }
    }

    return null;
  }
}
