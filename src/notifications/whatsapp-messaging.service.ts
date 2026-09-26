import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { envFlagTrue } from '../config/env-flags';

type Provider = 'meta' | 'twilio';

/**
 * Thrown when a business-initiated message has no approved template id.
 * Session (plain-text) sends are intentionally not used as a fallback:
 * WhatsApp only accepts those inside the 24-hour reply window.
 */
export class WhatsappTemplateNotConfiguredError extends Error {
  constructor(label: string) {
    super(`WhatsApp template not configured for ${label}`);
    this.name = 'WhatsappTemplateNotConfiguredError';
  }
}

export type WhatsappUtilityTemplate = {
  /** Short label for logs, e.g. `order_ready`. */
  label: string;
  toE164: string;
  /** Meta template name. Required when `WHATSAPP_PROVIDER=meta`. */
  metaTemplateName?: string;
  metaTemplateLang?: string;
  /** Twilio Content SID. Required when `WHATSAPP_PROVIDER=twilio`. */
  twilioContentSid?: string;
  /** Body variables `{{1}}`, `{{2}}`, … in order. Must be non-empty strings. */
  bodyParameters: string[];
};

/**
 * Shared WhatsApp transport for OTP and order notices.
 *
 * Providers are selected with `WHATSAPP_PROVIDER` (default `meta`):
 *
 * - `meta`   — Meta WhatsApp Cloud API (Graph API).
 * - `twilio` — Twilio Programmable Messaging over WhatsApp.
 */
@Injectable()
export class WhatsappMessagingService {
  private readonly logger = new Logger(WhatsappMessagingService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return this.resolveProvider() === 'twilio'
      ? this.isTwilioConfigured()
      : this.isMetaConfigured();
  }

  /**
   * Business-initiated utility template. Throws when credentials or the
   * template id are missing, or when the provider rejects the send.
   */
  async sendUtilityTemplate(input: WhatsappUtilityTemplate): Promise<void> {
    if (!this.isConfigured()) {
      throw new WhatsappTemplateNotConfiguredError(
        `${input.label} (WhatsApp credentials missing)`,
      );
    }
    const parameters = input.bodyParameters.map((text, index) => {
      const value = text.replace(/[\r\n\t]+/g, ' ').trim();
      if (!value) {
        throw new Error(
          `WhatsApp template ${input.label} parameter {{${index + 1}}} is empty`,
        );
      }
      return value;
    });

    if (this.resolveProvider() === 'twilio') {
      const contentSid = input.twilioContentSid?.trim();
      if (!contentSid) {
        throw new WhatsappTemplateNotConfiguredError(input.label);
      }
      await this.postTwilio({
        toE164: input.toE164,
        contentSid,
        contentVariables: Object.fromEntries(
          parameters.map((value, index) => [String(index + 1), value]),
        ),
      });
      return;
    }

    const templateName = input.metaTemplateName?.trim();
    if (!templateName) {
      throw new WhatsappTemplateNotConfiguredError(input.label);
    }
    await this.postMeta({
      toE164: input.toE164,
      templateName,
      templateLang: input.metaTemplateLang?.trim() || 'en',
      bodyParameters: parameters,
    });
  }

  async sendOtp(phoneE164: string, code: string): Promise<void> {
    if (this.resolveProvider() === 'twilio') {
      await this.sendOtpViaTwilio(phoneE164, code);
      return;
    }
    await this.sendOtpViaMeta(phoneE164, code);
  }

  private resolveProvider(): Provider {
    const raw = this.config
      .get<string>('WHATSAPP_PROVIDER', 'meta')
      .trim()
      .toLowerCase();
    return raw === 'twilio' ? 'twilio' : 'meta';
  }

  /**
   * When unset, defaults to `true` so Meta **authentication** OTP templates work
   * (code must appear in body + url button). Explicit `false` for body-only utility templates.
   */
  private resolveMetaIncludeAuthButton(): boolean {
    const raw = this.config.get<string>(
      'WHATSAPP_OTP_META_INCLUDE_AUTH_BUTTON',
    );
    if (raw === undefined || raw.trim() === '') {
      return true;
    }
    return envFlagTrue(raw);
  }

  private isMetaConfigured(): boolean {
    const token = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    return Boolean(token?.trim() && phoneNumberId?.trim());
  }

  private async sendOtpViaMeta(phoneE164: string, code: string): Promise<void> {
    const templateName = this.config
      .get<string>('WHATSAPP_OTP_TEMPLATE_NAME')
      ?.trim();
    const templateLang =
      this.config.get<string>('WHATSAPP_OTP_TEMPLATE_LANG', 'en')?.trim() ||
      'en';
    const includeAuthButton = templateName
      ? this.resolveMetaIncludeAuthButton()
      : false;

    if (templateName) {
      await this.postMeta({
        toE164: phoneE164,
        templateName,
        templateLang,
        bodyParameters: [code],
        includeAuthButton,
      });
      return;
    }

    await this.postMetaText(
      phoneE164,
      `Your Moja verification code is ${code}. Do not share it with anyone. It expires in a few minutes.`,
    );
  }

  private async postMeta(input: {
    toE164: string;
    templateName: string;
    templateLang: string;
    bodyParameters: string[];
    includeAuthButton?: boolean;
  }): Promise<void> {
    const to = this.metaRecipient(input.toE164);
    const otpTextParam = {
      type: 'text' as const,
      text: input.bodyParameters[0],
    };
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: input.templateName,
        language: { code: input.templateLang },
        components: [
          {
            type: 'body',
            parameters: input.bodyParameters.map((text) => ({
              type: 'text' as const,
              text,
            })),
          },
          ...(input.includeAuthButton
            ? [
                {
                  type: 'button' as const,
                  sub_type: 'url' as const,
                  index: '0',
                  parameters: [otpTextParam],
                },
              ]
            : []),
        ],
      },
    };
    await this.postMetaPayload(body);
  }

  private async postMetaText(phoneE164: string, text: string): Promise<void> {
    const to = this.metaRecipient(phoneE164);
    await this.postMetaPayload({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    });
  }

  private metaRecipient(phoneE164: string): string {
    const to = phoneE164.replace(/\D/g, '');
    if (!to) {
      throw new Error('Invalid phone for WhatsApp delivery');
    }
    return to;
  }

  private async postMetaPayload(body: unknown): Promise<void> {
    const token = this.config.getOrThrow<string>('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = this.config.getOrThrow<string>(
      'WHATSAPP_PHONE_NUMBER_ID',
    );
    const version = this.config.get<string>(
      'WHATSAPP_GRAPH_API_VERSION',
      'v21.0',
    );
    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
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

  private isTwilioConfigured(): boolean {
    const sid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const from = this.config.get<string>('TWILIO_WHATSAPP_FROM')?.trim();
    const mss = this.config.get<string>('TWILIO_MESSAGING_SERVICE_SID')?.trim();
    return Boolean(sid?.trim() && token?.trim() && (from || mss));
  }

  private async sendOtpViaTwilio(
    phoneE164: string,
    code: string,
  ): Promise<void> {
    const contentSid = this.config
      .get<string>('TWILIO_WHATSAPP_CONTENT_SID')
      ?.trim();
    if (contentSid) {
      await this.postTwilio({
        toE164: phoneE164,
        contentSid,
        contentVariables: { '1': code },
      });
      return;
    }
    await this.postTwilio({
      toE164: phoneE164,
      body: `Your Moja verification code is ${code}. Do not share it with anyone. It expires in a few minutes.`,
    });
  }

  private async postTwilio(input: {
    toE164: string;
    contentSid?: string;
    contentVariables?: Record<string, string>;
    body?: string;
  }): Promise<void> {
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

    const digits = input.toE164.replace(/\D/g, '');
    if (!digits) {
      throw new Error('Invalid phone for WhatsApp delivery');
    }
    const toE164 = input.toE164.startsWith('+') ? input.toE164 : `+${digits}`;

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
    if (input.contentSid) {
      params.set('ContentSid', input.contentSid);
      params.set(
        'ContentVariables',
        JSON.stringify(input.contentVariables ?? {}),
      );
    } else if (input.body) {
      params.set('Body', input.body);
    } else {
      throw new Error('Twilio WhatsApp send has neither a template nor a body');
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
