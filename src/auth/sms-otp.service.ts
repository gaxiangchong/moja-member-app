import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Sends login OTP via SMS using Twilio Programmable Messaging.
 * @see https://www.twilio.com/docs/messaging/api/message-resource
 */
@Injectable()
export class SmsOtpService {
  private readonly logger = new Logger(SmsOtpService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const sid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const from = this.config.get<string>('TWILIO_SMS_FROM')?.trim();
    const mss = this.config.get<string>('TWILIO_MESSAGING_SERVICE_SID')?.trim();
    return Boolean(sid?.trim() && token?.trim() && (from || mss));
  }

  async sendOtp(phoneE164: string, code: string): Promise<void> {
    const accountSid = this.config.getOrThrow<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.getOrThrow<string>('TWILIO_AUTH_TOKEN');
    const from = this.config.get<string>('TWILIO_SMS_FROM')?.trim();
    const messagingServiceSid = this.config
      .get<string>('TWILIO_MESSAGING_SERVICE_SID')
      ?.trim();
    if (!from && !messagingServiceSid) {
      throw new Error(
        'Twilio SMS sender not set: define TWILIO_SMS_FROM or TWILIO_MESSAGING_SERVICE_SID',
      );
    }

    const digits = phoneE164.replace(/\D/g, '');
    if (!digits) {
      throw new Error('Invalid phone for SMS delivery');
    }
    const toE164 = phoneE164.startsWith('+') ? phoneE164 : `+${digits}`;

    const params = new URLSearchParams();
    params.set('To', toE164);
    if (messagingServiceSid) {
      params.set('MessagingServiceSid', messagingServiceSid);
    } else if (from) {
      params.set('From', from.startsWith('+') ? from : `+${from.replace(/\D/g, '')}`);
    }
    params.set(
      'Body',
      `Your Moja verification code is ${code}. Do not share it with anyone. It expires in a few minutes.`,
    );

    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
      accountSid,
    )}/Messages.json`;
    const basic = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Twilio SMS API error ${res.status}: ${text}`);
      throw new Error(`Twilio SMS send failed: ${res.status}`);
    }
  }
}
