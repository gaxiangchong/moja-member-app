import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type Provider = 'meta' | 'twilio';

/**
 * Sends login OTP via WhatsApp. Two providers are supported and selected via
 * `WHATSAPP_PROVIDER` (default `meta`):
 *
 * - `meta`   — Meta WhatsApp Cloud API (Graph API).
 *              @see https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
 * - `twilio` — Twilio Programmable Messaging over WhatsApp.
 *              @see https://www.twilio.com/docs/whatsapp/api
 */
@Injectable()
export class WhatsappOtpService {
  private readonly logger = new Logger(WhatsappOtpService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return this.resolveProvider() === 'twilio'
      ? this.isTwilioConfigured()
      : this.isMetaConfigured();
  }

  async sendOtp(phoneE164: string, code: string): Promise<void> {
    if (this.resolveProvider() === 'twilio') {
      await this.sendViaTwilio(phoneE164, code);
      return;
    }
    await this.sendViaMeta(phoneE164, code);
  }

  private resolveProvider(): Provider {
    const raw = this.config
      .get<string>('WHATSAPP_PROVIDER', 'meta')
      .trim()
      .toLowerCase();
    return raw === 'twilio' ? 'twilio' : 'meta';
  }

  // ---------------------------------------------------------------------------
  // Meta WhatsApp Cloud API
  // ---------------------------------------------------------------------------

  private isMetaConfigured(): boolean {
    const token = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    return Boolean(token?.trim() && phoneNumberId?.trim());
  }

  /**
   * `phoneE164` e.g. +6591234567 → WhatsApp `to` is digits only (no +).
   */
  private async sendViaMeta(phoneE164: string, code: string): Promise<void> {
    const token = this.config.getOrThrow<string>('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = this.config.getOrThrow<string>(
      'WHATSAPP_PHONE_NUMBER_ID',
    );
    const version = this.config.get<string>(
      'WHATSAPP_GRAPH_API_VERSION',
      'v21.0',
    );
    const to = phoneE164.replace(/\D/g, '');
    if (!to) {
      throw new Error('Invalid phone for WhatsApp delivery');
    }

    const templateName = this.config.get<string>('WHATSAPP_OTP_TEMPLATE_NAME');
    const templateLang = this.config.get<string>(
      'WHATSAPP_OTP_TEMPLATE_LANG',
      'en',
    );

    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

    const body = templateName
      ? {
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: templateName,
            language: { code: templateLang },
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', text: code }],
              },
            ],
          },
        }
      : {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: {
            body: `Your Moja verification code is ${code}. Do not share it with anyone. It expires in a few minutes.`,
          },
        };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`WhatsApp (Meta) API error ${res.status}: ${text}`);
      throw new Error(`WhatsApp send failed: ${res.status}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Twilio WhatsApp (Programmable Messaging)
  // ---------------------------------------------------------------------------

  private isTwilioConfigured(): boolean {
    const sid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const from = this.config.get<string>('TWILIO_WHATSAPP_FROM')?.trim();
    const mss = this.config
      .get<string>('TWILIO_MESSAGING_SERVICE_SID')
      ?.trim();
    return Boolean(sid?.trim() && token?.trim() && (from || mss));
  }

  /**
   * Sends the OTP through Twilio's Messages API on the WhatsApp channel.
   * Supports either a direct `From=whatsapp:+…` sender or a Messaging Service SID.
   * When `TWILIO_WHATSAPP_CONTENT_SID` is set, a pre-approved Content template
   * is used with `{{1}}` bound to the OTP code; otherwise a plain-text `Body`
   * is sent (which only works within the 24h customer-initiated window or in the
   * Twilio WhatsApp Sandbox).
   */
  private async sendViaTwilio(phoneE164: string, code: string): Promise<void> {
    const accountSid = this.config.getOrThrow<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.getOrThrow<string>('TWILIO_AUTH_TOKEN');
    const from = this.config.get<string>('TWILIO_WHATSAPP_FROM')?.trim();
    const messagingServiceSid = this.config
      .get<string>('TWILIO_MESSAGING_SERVICE_SID')
      ?.trim();
    if (!from && !messagingServiceSid) {
      throw new Error(
        'Twilio sender not set: define TWILIO_WHATSAPP_FROM or TWILIO_MESSAGING_SERVICE_SID',
      );
    }

    const digits = phoneE164.replace(/\D/g, '');
    if (!digits) {
      throw new Error('Invalid phone for WhatsApp delivery');
    }
    const toE164 = phoneE164.startsWith('+') ? phoneE164 : `+${digits}`;

    const contentSid = this.config
      .get<string>('TWILIO_WHATSAPP_CONTENT_SID')
      ?.trim();

    const params = new URLSearchParams();
    params.set('To', `whatsapp:${toE164}`);
    if (messagingServiceSid) {
      params.set('MessagingServiceSid', messagingServiceSid);
    } else if (from) {
      params.set(
        'From',
        from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
      );
    }
    if (contentSid) {
      params.set('ContentSid', contentSid);
      params.set('ContentVariables', JSON.stringify({ '1': code }));
    } else {
      params.set(
        'Body',
        `Your Moja verification code is ${code}. Do not share it with anyone. It expires in a few minutes.`,
      );
    }

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
      this.logger.error(`Twilio WhatsApp API error ${res.status}: ${text}`);
      throw new Error(`Twilio WhatsApp send failed: ${res.status}`);
    }
  }
}
