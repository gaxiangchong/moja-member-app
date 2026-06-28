import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type ResendSendResponse = {
  id?: string;
  error?: {
    message?: string;
    name?: string;
  };
};

@Injectable()
export class EmailOtpService {
  private readonly logger = new Logger(EmailOtpService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const key = this.config.get<string>('RESEND_API_KEY')?.trim();
    const from = this.config.get<string>('OTP_EMAIL_FROM')?.trim();
    return Boolean(key && from);
  }

  // Some hosts (e.g. Render's env UI) keep surrounding quotes as part of the
  // value, unlike dotenv which strips them. A quoted `from` like
  // `"Moja Maison <x@y.com>"` is rejected by Resend, so normalize defensively.
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

  async sendOtp(email: string, code: string): Promise<void> {
    const apiKey = this.stripWrappingQuotes(
      this.config.getOrThrow<string>('RESEND_API_KEY'),
    );
    const from = this.stripWrappingQuotes(
      this.config.getOrThrow<string>('OTP_EMAIL_FROM'),
    );
    const subjectPrefix =
      this.stripWrappingQuotes(
        this.config.get<string>('OTP_EMAIL_SUBJECT_PREFIX') ?? '',
      ) || 'Moja Maison';
    const subject = `${subjectPrefix} verification code`;

    const html = `
      <div style="font-family: Inter, Arial, sans-serif; line-height: 1.5; color: #1f2937;">
        <p>Your verification code is:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px; margin: 12px 0;">${code}</p>
        <p>This code will expire in a few minutes. Do not share it with anyone.</p>
      </div>
    `;
    const text = `Your Moja verification code is ${code}. It expires in a few minutes. Do not share it.`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject,
        html,
        text,
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
      this.logger.error(`Resend API send failed: ${detail}`);
      throw new Error(`Email OTP send failed: ${detail}`);
    }
  }
}
