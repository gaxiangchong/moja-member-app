import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type ResendSendResponse = {
  id?: string;
  error?: {
    message?: string;
    name?: string;
  };
};

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Optional override for the From header. Falls back to RECEIPT_EMAIL_FROM, then OTP_EMAIL_FROM. */
  from?: string;
}

/**
 * Generic transactional email sender (Resend HTTP API).
 *
 * Mirrors the env conventions used by EmailOtpService so the same Resend key
 * can serve both OTPs and receipts without duplication. From/subject lookup:
 *   from   = options.from ?? RECEIPT_EMAIL_FROM ?? OTP_EMAIL_FROM
 *   prefix = RECEIPT_EMAIL_SUBJECT_PREFIX ?? OTP_EMAIL_SUBJECT_PREFIX ?? 'Moja Maison'
 *
 * Methods never throw on transport failure; they log and return false so
 * callers (e.g. webhook handlers) don't fail a successful payment because of
 * email delivery hiccups. Configuration errors (missing key/from) are also
 * logged-and-skipped.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const key = this.config.get<string>('RESEND_API_KEY')?.trim();
    const from =
      this.config.get<string>('RECEIPT_EMAIL_FROM')?.trim() ||
      this.config.get<string>('OTP_EMAIL_FROM')?.trim();
    return Boolean(key && from);
  }

  getSubjectPrefix(): string {
    return (
      this.stripWrappingQuotes(
        this.config.get<string>('RECEIPT_EMAIL_SUBJECT_PREFIX') ?? '',
      ) ||
      this.stripWrappingQuotes(
        this.config.get<string>('OTP_EMAIL_SUBJECT_PREFIX') ?? '',
      ) ||
      'Moja Maison'
    );
  }

  async send(options: SendEmailOptions): Promise<boolean> {
    const apiKey = this.stripWrappingQuotes(
      this.config.get<string>('RESEND_API_KEY') ?? '',
    );
    const from = this.stripWrappingQuotes(
      options.from ??
        this.config.get<string>('RECEIPT_EMAIL_FROM') ??
        this.config.get<string>('OTP_EMAIL_FROM') ??
        '',
    );

    if (!apiKey || !from) {
      this.logger.warn(
        'EmailService.send skipped: RESEND_API_KEY and a from address (RECEIPT_EMAIL_FROM or OTP_EMAIL_FROM) are required.',
      );
      return false;
    }

    if (!options.to.trim()) {
      this.logger.warn('EmailService.send skipped: empty recipient address.');
      return false;
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [options.to],
          subject: options.subject,
          html: options.html,
          text: options.text,
        }),
      });

      let payload: ResendSendResponse | null = null;
      try {
        payload = (await res.json()) as ResendSendResponse;
      } catch {
        payload = null;
      }

      if (!res.ok || payload?.error) {
        const detail = payload?.error?.message || `HTTP ${res.status}`;
        this.logger.error(
          `Resend send failed (to=${options.to}, subject="${options.subject}"): ${detail}`,
        );
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(
        `Resend send threw (to=${options.to}, subject="${options.subject}"): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }

  // Some hosts (e.g. Render's env UI) keep surrounding quotes as part of the
  // value, unlike dotenv which strips them. Defensive normalization mirroring
  // EmailOtpService.
  private stripWrappingQuotes(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length >= 2) {
      const first = trimmed[0];
      const last = trimmed[trimmed.length - 1];
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        return trimmed.slice(1, -1).trim();
      }
    }
    return trimmed;
  }
}
