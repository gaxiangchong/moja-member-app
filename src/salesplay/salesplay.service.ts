import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

  private apiBase(): string {
    return (
      this.config.get<string>('SALESPLAY_API_BASE')?.trim().replace(/\/$/, '') ||
      'https://api.salesplaypos.com/v1.0'
    );
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
}
