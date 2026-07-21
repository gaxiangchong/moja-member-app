import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  SalesplayOnlineOrderInput,
  SalesplayOnlineOrderPushResult,
  SalesplayPage,
  SalesplayPageQuery,
} from './salesplay-online-order.types';

const SALESPLAY_TIMEZONE = 'Asia/Kuala_Lumpur';

/**
 * Member fields we can hand to SalesPlay. Keep this independent of the Prisma
 * model so callers can pass a partial snapshot from anywhere.
 */
export type SalesplayCustomerInput = {
  /** Our internal customer id (used for logging/traceability). */
  id?: string;
  displayName?: string | null;
  phoneE164?: string | null;
  email?: string | null;
  /** Stable, unique code — we use the member referral code. */
  code?: string | null;
  memberTier?: string | null;
};

/**
 * Pushes member details into SalesPlay POS so registered members appear in the
 * SalesPlay customer base.
 *
 * Docs: https://help.salesplay.com/help/rest-api-access-for-integration
 *   Base URL : https://api.salesplaypos.com/v1.0
 *   Auth     : Authorization: Bearer <access token from Backoffice → Integrations → Access Token>
 *
 * NOTE: SalesPlay does not publish the exact create-customer JSON schema, so the
 * request body in `buildPayload()` is a best-effort mapping. After the first
 * live call, check the logged response and adjust the field names there only.
 */
@Injectable()
export class SalesplayService {
  private readonly logger = new Logger(SalesplayService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const enabled = this.config.get<string>('SALESPLAY_ENABLED');
    const token = this.config.get<string>('SALESPLAY_ACCESS_TOKEN')?.trim();
    const on = ['1', 'true', 'on', 'yes'].includes(
      String(enabled ?? '').toLowerCase(),
    );
    return on && Boolean(token);
  }

  /** True when online order push is enabled and shop id is configured. */
  isOnlineOrdersConfigured(): boolean {
    if (!this.isConfigured()) return false;
    const flag = this.config.get<string>('SALESPLAY_ONLINE_ORDERS_ENABLED');
    if (
      flag !== undefined &&
      !['1', 'true', 'on', 'yes'].includes(String(flag).toLowerCase())
    ) {
      return false;
    }
    return Boolean(this.config.get<string>('SALESPLAY_SHOP_ID')?.trim());
  }

  private apiBase(): string {
    return (
      this.config.get<string>('SALESPLAY_API_BASE')?.trim().replace(/\/$/, '') ||
      'https://api.salesplaypos.com/v1.0'
    );
  }

  // ---- Pull sync (GET) --------------------------------------------------

  /**
   * Fetches one page of receipts from SalesPlay for the pull sync
   * (backfill + reconciliation). See {@link getResourcePage} for the defensive
   * response handling — the list/cursor shapes are undocumented.
   */
  async getReceiptsPage(opts: SalesplayPageQuery): Promise<SalesplayPage | null> {
    return this.getResourcePage('receipts', opts);
  }

  /** Fetches one page of credit notes (in-store refunds) for the pull sync. */
  async getCreditNotesPage(
    opts: SalesplayPageQuery,
  ): Promise<SalesplayPage | null> {
    return this.getResourcePage('credit_notes', opts);
  }

  /** Max page size — SalesPlay caps at 250. */
  pullPageSize(): number {
    const n = Number(this.config.get<string>('SALESPLAY_PULL_PAGE_SIZE'));
    if (!Number.isFinite(n) || n <= 0) return 250;
    return Math.min(Math.floor(n), 250);
  }

  /**
   * Low-level GET with cursor pagination. Never throws — returns null on any
   * failure so a pull run degrades gracefully rather than crashing a loop.
   *
   * The exact query-param and response-envelope names are not documented, so
   * they are configurable (with sensible defaults) and the response is parsed
   * defensively. The raw first page is logged so the shape can be confirmed.
   */
  private async getResourcePage(
    resource: 'receipts' | 'credit_notes',
    opts: SalesplayPageQuery,
  ): Promise<SalesplayPage | null> {
    if (!this.isConfigured()) return null;
    const token = this.config.getOrThrow<string>('SALESPLAY_ACCESS_TOKEN').trim();

    const cursorParam =
      this.config.get<string>('SALESPLAY_PULL_CURSOR_PARAM')?.trim() || 'cursor';
    const fromParam =
      this.config.get<string>('SALESPLAY_PULL_FROM_PARAM')?.trim() ||
      'date_from';

    const url = new URL(`${this.apiBase()}/${resource}`);
    url.searchParams.set('limit', String(opts.limit ?? this.pullPageSize()));
    if (opts.cursor) url.searchParams.set(cursorParam, opts.cursor);
    if (opts.fromDate) url.searchParams.set(fromParam, opts.fromDate);
    const shopId = this.config.get<string>('SALESPLAY_SHOP_ID')?.trim();
    if (shopId) url.searchParams.set('shop_id', shopId);

    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: '*/*' },
      });
      const text = await res.text();
      if (!res.ok) {
        this.logger.error(
          `SalesPlay ${resource} GET failed (${res.status}): ${text.slice(0, 500)}`,
        );
        return null;
      }
      if (!opts.cursor) {
        this.logger.debug(
          `SalesPlay ${resource} first page: ${text.slice(0, 800)}`,
        );
      }
      return this.parseResourcePage(text);
    } catch (err) {
      this.logger.error(
        `SalesPlay ${resource} GET error: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  private parseResourcePage(text: string): SalesplayPage {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { items: [], nextCursor: null };
    }

    const root =
      data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    const success =
      root.success && typeof root.success === 'object'
        ? (root.success as Record<string, unknown>)
        : null;

    // The array of records may sit under a few different envelope keys.
    const items =
      [root.receipts, root.credit_notes, root.data, root.items, root.results]
        .concat(success ? [success.receipts, success.credit_notes, success.data] : [])
        .find((v) => Array.isArray(v)) ?? (Array.isArray(data) ? data : []);

    // The forward cursor likewise may be reported under several keys.
    const paging =
      root.paging && typeof root.paging === 'object'
        ? (root.paging as Record<string, unknown>)
        : root.meta && typeof root.meta === 'object'
          ? (root.meta as Record<string, unknown>)
          : {};
    const nextCursor =
      firstString([
        root.next_cursor,
        root.cursor,
        root.next,
        paging.next_cursor,
        paging.cursor,
        paging.next,
        success?.next_cursor,
        success?.cursor,
      ]) ?? null;

    return { items: Array.isArray(items) ? items : [], nextCursor };
  }

  /**
   * Maps our member to the SalesPlay create-customer body, aligned to the
   * SalesPlay "Customer details" form (First name, Last name, Email, Phone
   * number, Country, Customer code, ...).
   *
   * `customer_code` is set to the member's phone number so the SalesPlay code
   * follows the phone — stable and matched on every upsert.
   */
  private buildPayload(input: SalesplayCustomerInput): Record<string, unknown> {
    const phone = (input.phoneE164 ?? '').trim();
    const last4 = phone.replace(/\D/g, '').slice(-4);
    const fullName =
      (input.displayName ?? '').trim() ||
      (last4 ? `Member ${last4}` : 'Member');
    const spaceIdx = fullName.indexOf(' ');
    const firstName = spaceIdx === -1 ? fullName : fullName.slice(0, spaceIdx);
    const lastName = spaceIdx === -1 ? '' : fullName.slice(spaceIdx + 1).trim();

    const country =
      this.config.get<string>('SALESPLAY_DEFAULT_COUNTRY')?.trim() || 'Malaysia';

    // SalesPlay customer code allows only letters/numbers/dot/underscore, so
    // strip the leading "+" and any separators from the phone (E.164 → digits).
    const customerCode = phone.replace(/[^0-9A-Za-z._]/g, '');

    return {
      first_name: firstName,
      last_name: lastName || undefined,
      email: (input.email ?? '').trim() || undefined,
      phone_number: phone || undefined,
      country,
      ...(customerCode ? { customer_code: customerCode } : {}),
    };
  }

  /**
   * Creates / upserts the member in SalesPlay. Never throws — failures are
   * logged so member registration is never blocked by a POS outage.
   * Returns the SalesPlay customer id on success, otherwise null.
   */
  async syncCustomer(input: SalesplayCustomerInput): Promise<string | null> {
    if (!this.isConfigured()) return null;

    const token = this.config.getOrThrow<string>('SALESPLAY_ACCESS_TOKEN').trim();
    const url = `${this.apiBase()}/customers`;
    const payload = this.buildPayload(input);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          // SalesPlay runs Apache mod_negotiation; a strict JSON Accept header
          // triggers 406, so accept anything.
          Accept: '*/*',
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      if (!res.ok) {
        this.logger.error(
          `SalesPlay customer sync failed (${res.status}) for ${input.id ?? input.phoneE164}: ${text}`,
        );
        return null;
      }
      this.logger.log(
        `SalesPlay customer synced for ${input.id ?? input.phoneE164}: ${text.slice(0, 500)}`,
      );
      return this.parseCustomerId(text);
    } catch (err) {
      this.logger.error(
        `SalesPlay customer sync error for ${input.id ?? input.phoneE164}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  private parseCustomerId(text: string): string | null {
    try {
      const data = JSON.parse(text) as {
        success?: { customer_id?: string };
        customer_id?: string;
      };
      return data.success?.customer_id ?? data.customer_id ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Pushes a paid member-shop order to SalesPlay via POST /online_orders so it
   * appears in POS reporting. Never throws — failures are logged only.
   */
  async pushOnlineOrder(
    input: SalesplayOnlineOrderInput,
  ): Promise<SalesplayOnlineOrderPushResult | null> {
    if (!this.isOnlineOrdersConfigured()) return null;

    const shopId = this.config.getOrThrow<string>('SALESPLAY_SHOP_ID').trim();
    const token = this.config.getOrThrow<string>('SALESPLAY_ACCESS_TOKEN').trim();
    const url = `${this.apiBase()}/online_orders`;
    const payload = this.buildOnlineOrderPayload(input, shopId);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: '*/*',
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      if (!res.ok) {
        this.logger.error(
          `SalesPlay online order push failed (${res.status}) for order ${input.orderId}: ${text}`,
        );
        return null;
      }
      this.logger.log(
        `SalesPlay online order pushed for ${input.orderId}: ${text.slice(0, 500)}`,
      );
      return this.parseOnlineOrderResponse(text);
    } catch (err) {
      this.logger.error(
        `SalesPlay online order push error for ${input.orderId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  private buildOnlineOrderPayload(
    input: SalesplayOnlineOrderInput,
    shopId: string,
  ): Record<string, unknown> {
    const orderType =
      this.config.get<string>('SALESPLAY_ORDER_TYPE')?.trim() || 'Pickup';
    const paymentType =
      this.config.get<string>('SALESPLAY_PAYMENT_TYPE')?.trim() || 'Online';
    const targetTerminal =
      this.config.get<string>('SALESPLAY_TARGET_TERMINAL')?.trim() || undefined;

    const { firstName, lastName } = this.splitDisplayName(
      input.customer.displayName,
      input.customer.phoneE164,
    );
    const orderTotalRm = this.centsToRm(input.totalCents);
    const when = input.placedAt;
    const orderDate = this.formatSalesplayDate(when);
    const orderDateTime = this.formatSalesplayDateTime(when);

    const commentParts = [...input.fulfillmentSummaryLines];
    if (input.lines.some((l) => l.variantLabel)) {
      for (const line of input.lines) {
        if (line.variantLabel) {
          commentParts.push(`${line.name}: ${line.variantLabel}`);
        }
      }
    }

    return {
      shop_id: shopId,
      order_date: orderDate,
      order_date_time: orderDateTime,
      order_reference_number: String(input.orderNumber),
      order_reference_id: input.orderId,
      order_total: orderTotalRm,
      channel_order_status_id: 0,
      channel_order_status_name: 'pending',
      order_type: orderType,
      ...(targetTerminal ? { target_terminal: targetTerminal } : {}),
      customer_first_name: firstName,
      ...(lastName ? { customer_last_name: lastName } : {}),
      customer_phone: input.customer.phoneE164,
      ...(input.customer.email?.trim()
        ? { customer_email: input.customer.email.trim() }
        : {}),
      ...(commentParts.length
        ? { order_comment: commentParts.join('\n') }
        : {}),
      order_items: input.lines.map((line) => {
        const unitRm = this.centsToRm(line.unitPriceCents);
        const lineTotalRm = this.centsToRm(line.unitPriceCents * line.qty);
        const productName = line.variantLabel
          ? `${line.name} (${line.variantLabel})`
          : line.name;
        return {
          product_code: line.productId,
          product_name: productName,
          product_qty: line.qty,
          product_unit_price: unitRm,
          product_price: lineTotalRm,
        };
      }),
      order_payments: [
        {
          payment_type: paymentType,
          payment_amount: orderTotalRm.toFixed(2),
          is_advance: 0,
        },
      ],
    };
  }

  private splitDisplayName(
    displayName: string | null | undefined,
    phoneE164: string,
  ): { firstName: string; lastName: string } {
    const phone = (phoneE164 ?? '').trim();
    const last4 = phone.replace(/\D/g, '').slice(-4);
    const fullName =
      (displayName ?? '').trim() ||
      (last4 ? `Member ${last4}` : 'Member');
    const spaceIdx = fullName.indexOf(' ');
    if (spaceIdx === -1) {
      return { firstName: fullName, lastName: '' };
    }
    return {
      firstName: fullName.slice(0, spaceIdx),
      lastName: fullName.slice(spaceIdx + 1).trim(),
    };
  }

  private centsToRm(cents: number): number {
    return Math.round(cents) / 100;
  }

  private formatSalesplayDate(ref: Date): string {
    return this.formatSalesplayParts(ref, ['year', 'month', 'day']).join('-');
  }

  private formatSalesplayDateTime(ref: Date): string {
    const [y, mo, d] = this.formatSalesplayParts(ref, [
      'year',
      'month',
      'day',
    ]);
    const [h, mi, s] = this.formatSalesplayParts(ref, [
      'hour',
      'minute',
      'second',
    ]);
    return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
  }

  private formatSalesplayParts(
    ref: Date,
    types: ('year' | 'month' | 'day' | 'hour' | 'minute' | 'second')[],
  ): string[] {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: SALESPLAY_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(ref);
    return types.map((t) => parts.find((p) => p.type === t)?.value ?? '00');
  }

  private parseOnlineOrderResponse(
    text: string,
  ): SalesplayOnlineOrderPushResult | null {
    try {
      const data = JSON.parse(text) as {
        success?: {
          system_unique_id?: string;
          order_reference_id?: string;
          order_reference_number?: string;
        };
      };
      const success = data.success;
      const systemUniqueId = success?.system_unique_id?.trim();
      if (!systemUniqueId) return null;
      return {
        systemUniqueId,
        orderReferenceId: success?.order_reference_id ?? '',
        orderReferenceNumber: success?.order_reference_number ?? '',
      };
    } catch {
      return null;
    }
  }
}

/** First value that is a non-empty string (accepts numbers), else null. */
function firstString(values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
}
