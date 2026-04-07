import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Sends login OTP via Meta WhatsApp Cloud API when credentials are set.
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
 */
@Injectable()
export class WhatsappOtpService {
  private readonly logger = new Logger(WhatsappOtpService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const token = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    return Boolean(token?.trim() && phoneNumberId?.trim());
  }

  /**
   * `phoneE164` e.g. +6591234567 → WhatsApp `to` is digits only (no +).
   */
  async sendOtp(phoneE164: string, code: string): Promise<void> {
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
      this.logger.error(`WhatsApp API error ${res.status}: ${text}`);
      throw new Error(`WhatsApp send failed: ${res.status}`);
    }
  }
}
