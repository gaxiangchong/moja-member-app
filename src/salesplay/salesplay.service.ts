import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { request as httpsRequest } from 'node:https';
import { PrismaService } from '../prisma/prisma.service';
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

  /** Cached OAuth token (in-memory; re-obtained after a restart). */
  private oauth: {
    accessToken: string;
    refreshToken: string | null;
    expiresAtMs: number;
  } | null = null;
  /** De-dupes concurrent token requests so parallel API calls share one fetch. */
  private oauthInflight: Promise<string | null> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  isConfigured(): boolean {
    const enabled = this.config.get<string>('SALESPLAY_ENABLED');
    const on = ['1', 'true', 'on', 'yes'].includes(
      String(enabled ?? '').toLowerCase(),
    );
    if (!on) return false;
    const token = this.config.get<string>('SALESPLAY_ACCESS_TOKEN')?.trim();
    return Boolean(token) || this.oauthConfigured();
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

  // ---- Auth -------------------------------------------------------------

  /**
   * True when OAuth 2.0 app credentials are present (Backoffice → Integrations
   * → OAuth Apps): App ID, App secret, and the Authorization Code shown on the
   * app page. OAuth is preferred over SALESPLAY_ACCESS_TOKEN when both are set.
   */
  private oauthConfigured(): boolean {
    return Boolean(
      this.config.get<string>('SALESPLAY_CLIENT_ID')?.trim() &&
        this.config.get<string>('SALESPLAY_CLIENT_SECRET')?.trim() &&
        this.config.get<string>('SALESPLAY_AUTH_CODE')?.trim(),
    );
  }

  /**
   * Resolves the Bearer token for API calls: the cached OAuth access token
   * (fetched / refreshed on demand) when OAuth is configured, otherwise the
   * static SALESPLAY_ACCESS_TOKEN. Returns null when no token is obtainable.
   */
  private async getAccessToken(): Promise<string | null> {
    if (!this.oauthConfigured()) {
      return this.config.get<string>('SALESPLAY_ACCESS_TOKEN')?.trim() || null;
    }
    // Refresh 60s before expiry so in-flight calls never race the deadline.
    if (this.oauth && Date.now() < this.oauth.expiresAtMs - 60_000) {
      return this.oauth.accessToken;
    }
    if (!this.oauthInflight) {
      this.oauthInflight = this.obtainOauthToken().finally(() => {
        this.oauthInflight = null;
      });
    }
    return this.oauthInflight;
  }

  /**
   * Gets a fresh access token from SalesPlay. The refresh token (in-memory or
   * persisted in app_settings from an earlier exchange) is preferred; the
   * authorization code is only exchanged when no refresh token exists yet.
   * Authorization codes are single-use, so the code path is effectively the
   * one-time bootstrap — after it succeeds, restarts survive on the persisted
   * refresh token alone.
   */
  private async obtainOauthToken(): Promise<string | null> {
    const clientId = this.config.getOrThrow<string>('SALESPLAY_CLIENT_ID').trim();
    const clientSecret = this.config
      .getOrThrow<string>('SALESPLAY_CLIENT_SECRET')
      .trim();

    const refreshToken =
      this.oauth?.refreshToken ?? (await this.loadPersistedRefreshToken());
    if (refreshToken) {
      const refreshed = await this.requestOauthToken({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });
      if (refreshed) return refreshed;
      this.logger.warn(
        'SalesPlay OAuth refresh failed; retrying with the authorization code.',
      );
    }

    return this.requestOauthToken({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code: this.config.getOrThrow<string>('SALESPLAY_AUTH_CODE').trim(),
    });
  }

  /** app_settings key holding the SalesPlay OAuth refresh token. */
  private static readonly OAUTH_SETTING_KEY = 'salesplay.oauth';

  private async loadPersistedRefreshToken(): Promise<string | null> {
    try {
      const row = await this.prisma.appSetting.findUnique({
        where: { key: SalesplayService.OAUTH_SETTING_KEY },
      });
      const value = row?.value as { refreshToken?: string } | null;
      return value?.refreshToken?.trim() || null;
    } catch (err) {
      this.logger.warn(
        `Could not load persisted SalesPlay refresh token: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  /** Best-effort persistence so restarts never need a fresh authorization code. */
  private async persistRefreshToken(refreshToken: string): Promise<void> {
    try {
      await this.prisma.appSetting.upsert({
        where: { key: SalesplayService.OAUTH_SETTING_KEY },
        create: {
          key: SalesplayService.OAUTH_SETTING_KEY,
          value: { refreshToken },
        },
        update: { value: { refreshToken } },
      });
    } catch (err) {
      this.logger.warn(
        `Could not persist SalesPlay refresh token: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** POST /oauth/token (form-urlencoded). Never throws; caches on success. */
  private async requestOauthToken(
    params: Record<string, string>,
  ): Promise<string | null> {
    try {
      const res = await fetch(`${this.apiBase()}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: '*/*',
        },
        body: new URLSearchParams(params).toString(),
      });
      const text = await res.text();
      if (!res.ok) {
        this.logger.error(
          `SalesPlay OAuth token request failed (${res.status}, grant=${params.grant_type}): ${text.slice(0, 300)}`,
        );
        return null;
      }
      const data = JSON.parse(text) as {
        access_token?: string;
        expires_in?: number;
        refresh_token?: string;
      };
      const accessToken = data.access_token?.trim();
      if (!accessToken) {
        this.logger.error(
          `SalesPlay OAuth token response missing access_token: ${text.slice(0, 300)}`,
        );
        return null;
      }
      const ttlSec =
        Number.isFinite(data.expires_in) && Number(data.expires_in) > 0
          ? Number(data.expires_in)
          : 3600;
      this.oauth = {
        accessToken,
        // Keep the previous refresh token if the response omits a new one.
        refreshToken: data.refresh_token?.trim() || this.oauth?.refreshToken || null,
        expiresAtMs: Date.now() + ttlSec * 1000,
      };
      // Persist rotation so a restart can refresh instead of needing a new
      // (single-use) authorization code.
      const newRefreshToken = data.refresh_token?.trim();
      if (newRefreshToken) await this.persistRefreshToken(newRefreshToken);
      this.logger.log(
        `SalesPlay OAuth access token obtained via ${params.grant_type} (expires in ${ttlSec}s).`,
      );
      return accessToken;
    } catch (err) {
      this.logger.error(
        `SalesPlay OAuth token request error: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
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
   * Low-level list fetch with cursor pagination. Never throws — returns null on
   * any failure so a pull run degrades gracefully rather than crashing a loop.
   *
   * Despite the reference docs labelling these "query parameters", SalesPlay's
   * official Postman collection (and the live API) put the filters in a raw
   * JSON body on the GET request — query-string params are ignored entirely,
   * which surfaces as `"Created min at can not be blank"`. Standard fetch()
   * forbids GET bodies, so the transport drops down to node:https.
   */
  private async getResourcePage(
    resource: 'receipts' | 'credit_notes',
    opts: SalesplayPageQuery,
  ): Promise<SalesplayPage | null> {
    if (!this.isConfigured()) return null;
    const token = await this.getAccessToken();
    if (!token) {
      this.logger.error(`SalesPlay ${resource} GET skipped: no usable access token.`);
      return null;
    }

    // The credit-notes list lives at /credit_note_and_refund (the /credit_notes
    // path from earlier guesswork does not exist and 404s).
    const path = resource === 'credit_notes' ? 'credit_note_and_refund' : resource;

    // Filter window in `Y-m-d H:i:s` — created_at_min is required by the live
    // validation, so "full history" backfills send an epoch-ish lower bound.
    const body: Record<string, string> = {
      receipt_numbers: '',
      shop_id: this.config.get<string>('SALESPLAY_SHOP_ID')?.trim() || '',
      created_at_min: opts.fromDate ?? '2000-01-01 00:00:00',
      created_at_max: this.formatSalesplayDateTime(
        new Date(Date.now() + 24 * 60 * 60 * 1000),
      ),
      limit: String(opts.limit ?? this.pullPageSize()),
      cursor: opts.cursor ?? '',
    };

    try {
      const { status, text } = await this.getWithJsonBody(
        `${this.apiBase()}/${path}`,
        token,
        body,
      );
      if (status < 200 || status >= 300) {
        // Log the body we sent (no secrets — auth is in the header) so a
        // rejected request shows exactly which filters went out.
        this.logger.error(
          `SalesPlay ${resource} GET failed (${status}) [/${path} ${JSON.stringify(body)}]: ${text.slice(0, 500)}`,
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

  /**
   * GET with a JSON body over node:https (fetch() rejects GET bodies per spec).
   * Sends the token under both header names: `Authorization` (verified to pass
   * their auth) and `Token` (the name used by SalesPlay's Postman collection).
   */
  private getWithJsonBody(
    urlStr: string,
    token: string,
    body: Record<string, string>,
  ): Promise<{ status: number; text: string }> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(body);
      const u = new URL(urlStr);
      const req = httpsRequest(
        {
          hostname: u.hostname,
          port: u.port || 443,
          path: u.pathname + u.search,
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Token: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            Accept: '*/*',
          },
        },
        (res) => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => {
            data += chunk;
          });
          res.on('end', () =>
            resolve({ status: res.statusCode ?? 0, text: data }),
          );
        },
      );
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
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

    const token = await this.getAccessToken();
    if (!token) {
      this.logger.error(
        `SalesPlay customer sync skipped for ${input.id ?? input.phoneE164}: no usable access token.`,
      );
      return null;
    }
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
    const token = await this.getAccessToken();
    if (!token) {
      this.logger.error(
        `SalesPlay online order push skipped for ${input.orderId}: no usable access token.`,
      );
      return null;
    }
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
