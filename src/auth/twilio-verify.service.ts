import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Sends and checks login OTP via the Twilio Verify API. Twilio generates,
 * delivers, and validates the code itself — this app does not store the code.
 * @see https://www.twilio.com/docs/verify/api
 */
@Injectable()
export class TwilioVerifyService {
  private readonly logger = new Logger(TwilioVerifyService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const sid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const serviceSid = this.config
      .get<string>('TWILIO_VERIFY_SERVICE_SID')
      ?.trim();
    return Boolean(sid?.trim() && token?.trim() && serviceSid);
  }

  private serviceSid(): string {
    return this.config.getOrThrow<string>('TWILIO_VERIFY_SERVICE_SID').trim();
  }

  private authHeader(): string {
    const accountSid = this.config.getOrThrow<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.getOrThrow<string>('TWILIO_AUTH_TOKEN');
    return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
  }

  private toE164(phoneE164: string): string {
    const digits = phoneE164.replace(/\D/g, '');
    if (!digits) {
      throw new Error('Invalid phone for Twilio Verify delivery');
    }
    return phoneE164.startsWith('+') ? phoneE164 : `+${digits}`;
  }

  /**
   * Channel for delivery. `sms` is the default; `call` and `whatsapp` are also
   * supported by Twilio Verify if enabled on the service.
   */
  async startVerification(
    phoneE164: string,
    channel: 'sms' | 'call' | 'whatsapp' = 'sms',
  ): Promise<void> {
    const to = this.toE164(phoneE164);
    const params = new URLSearchParams();
    params.set('To', to);
    params.set('Channel', channel);

    const url = `https://verify.twilio.com/v2/Services/${encodeURIComponent(
      this.serviceSid(),
    )}/Verifications`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Twilio Verify start error ${res.status}: ${text}`);
      throw new Error(`Twilio Verify send failed: ${res.status}`);
    }
  }

  /**
   * Checks a submitted code. Returns true only when Twilio reports `approved`.
   * A missing/expired verification (Twilio 404) is treated as not approved.
   */
  async checkVerification(phoneE164: string, code: string): Promise<boolean> {
    const to = this.toE164(phoneE164);
    const params = new URLSearchParams();
    params.set('To', to);
    params.set('Code', code);

    const url = `https://verify.twilio.com/v2/Services/${encodeURIComponent(
      this.serviceSid(),
    )}/VerificationCheck`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (res.status === 404) {
      // Verification not found (expired or already consumed) → treat as invalid.
      return false;
    }

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Twilio Verify check error ${res.status}: ${text}`);
      throw new Error(`Twilio Verify check failed: ${res.status}`);
    }

    const data = (await res.json()) as { status?: string; valid?: boolean };
    return data.status === 'approved' || data.valid === true;
  }
}
