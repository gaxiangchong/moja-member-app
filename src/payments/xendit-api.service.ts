import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type XenditCreatePaymentRequestInput = {
  referenceId: string;
  country: string;
  currency: string;
  requestAmount: number;
  channelCode?: string;
  paymentTokenId?: string;
  description: string;
  successReturnUrl: string;
  failureReturnUrl: string;
  /** String values only (Xendit metadata). */
  metadata?: Record<string, string>;
};

export type XenditPaymentRequestResponse = {
  payment_request_id?: string;
  reference_id?: string;
  status?: string;
  actions?: Array<{ type: string; value?: string; descriptor?: string }>;
  [key: string]: unknown;
};

export type XenditCreateSessionResponse = {
  payment_session_id?: string;
  components_sdk_key?: string;
  expires_at?: string;
  [key: string]: unknown;
};

export type XenditGetSessionResponse = {
  payment_session_id?: string;
  payment_token_id?: string | null;
  status?: string;
  [key: string]: unknown;
};

@Injectable()
export class XenditApiService {
  constructor(private readonly config: ConfigService) {}

  private getApiVersion(): string {
    return this.config.get<string>('XENDIT_API_VERSION')?.trim() || '2024-11-11';
  }

  private getSecretKey(): string {
    const key = this.config.get<string>('XENDIT_SECRET_KEY')?.trim();
    if (!key) {
      throw new ServiceUnavailableException({
        code: 'XENDIT_NOT_CONFIGURED',
        message:
          'Xendit is not configured. Set XENDIT_SECRET_KEY (see .env.example).',
      });
    }
    return key;
  }

  private getApiBase(): string {
    return this.config.get<string>('XENDIT_API_BASE')?.trim() || 'https://api.xendit.co';
  }

  private getAuthHeader(): string {
    const secretKey = this.getSecretKey();
    return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
  }

  async createPaymentRequest(
    input: XenditCreatePaymentRequestInput,
  ): Promise<XenditPaymentRequestResponse> {
    const apiVersion = this.getApiVersion();
    const base = this.getApiBase();
    const url = `${base.replace(/\/$/, '')}/v3/payment_requests`;

    const bodyBase = {
      reference_id: input.referenceId,
      type: 'PAY',
      country: input.country,
      currency: input.currency,
      request_amount: input.requestAmount,
      capture_method: 'AUTOMATIC',
      channel_properties: {
        success_return_url: input.successReturnUrl,
        failure_return_url: input.failureReturnUrl,
      },
      description: input.description,
      metadata: input.metadata ?? {},
    };
    const body = input.paymentTokenId
      ? {
          ...bodyBase,
          payment_token_id: input.paymentTokenId,
        }
      : {
          ...bodyBase,
          channel_code: input.channelCode,
        };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: this.getAuthHeader(),
        'Content-Type': 'application/json',
        'api-version': apiVersion,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let json: XenditPaymentRequestResponse;
    try {
      json = text ? (JSON.parse(text) as XenditPaymentRequestResponse) : {};
    } catch {
      throw new ServiceUnavailableException({
        code: 'XENDIT_INVALID_RESPONSE',
        message: 'Xendit returned a non-JSON response.',
      });
    }

    if (!res.ok) {
      const message =
        typeof json.message === 'string'
          ? json.message
          : `Xendit error (${res.status})`;
      throw new ServiceUnavailableException({
        code: 'XENDIT_REQUEST_FAILED',
        message,
      });
    }

    return json;
  }

  async createCardsSaveSession(input: {
    referenceId: string;
    country: string;
    currency: string;
    customerReferenceId: string;
    customerGivenName: string;
    customerEmail?: string;
    customerMobileNumber?: string;
    origins: string[];
  }): Promise<XenditCreateSessionResponse> {
    const base = this.getApiBase();
    const url = `${base.replace(/\/$/, '')}/sessions`;
    const body = {
      reference_id: input.referenceId,
      session_type: 'SAVE',
      mode: 'COMPONENTS',
      currency: input.currency,
      amount: 0,
      country: input.country,
      customer: {
        reference_id: input.customerReferenceId,
        type: 'INDIVIDUAL',
        individual_detail: {
          given_names: input.customerGivenName,
        },
        ...(input.customerEmail ? { email: input.customerEmail } : {}),
        ...(input.customerMobileNumber
          ? { mobile_number: input.customerMobileNumber }
          : {}),
      },
      allowed_payment_channels: ['CARDS'],
      components_configuration: {
        origins: input.origins,
      },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = await this.parseJsonBody<XenditCreateSessionResponse>(res);
    if (!res.ok) {
      const message =
        typeof json.message === 'string'
          ? json.message
          : `Xendit session create error (${res.status})`;
      throw new ServiceUnavailableException({
        code: 'XENDIT_SESSION_CREATE_FAILED',
        message,
      });
    }
    return json;
  }

  async getSession(paymentSessionId: string): Promise<XenditGetSessionResponse> {
    const base = this.getApiBase();
    const url = `${base.replace(/\/$/, '')}/sessions/${encodeURIComponent(paymentSessionId)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });
    const json = await this.parseJsonBody<XenditGetSessionResponse>(res);
    if (!res.ok) {
      const message =
        typeof json.message === 'string'
          ? json.message
          : `Xendit session lookup error (${res.status})`;
      throw new ServiceUnavailableException({
        code: 'XENDIT_SESSION_LOOKUP_FAILED',
        message,
      });
    }
    return json;
  }

  private async parseJsonBody<T extends Record<string, unknown>>(
    res: Response,
  ): Promise<T> {
    const text = await res.text();
    try {
      return text ? (JSON.parse(text) as T) : ({} as T);
    } catch {
      throw new ServiceUnavailableException({
        code: 'XENDIT_INVALID_RESPONSE',
        message: 'Xendit returned a non-JSON response.',
      });
    }
  }

  extractRedirectUrl(response: XenditPaymentRequestResponse): string | null {
    const actions = response.actions;
    if (!Array.isArray(actions)) return null;
    const redirect = actions.find((a) => a.type === 'REDIRECT_CUSTOMER');
    return typeof redirect?.value === 'string' ? redirect.value : null;
  }
}
