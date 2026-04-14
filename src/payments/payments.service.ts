import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WalletTxnType } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { SubmitMemberOrderDto } from '../customers/dto/submit-member-order.dto';
import { CustomersService } from '../customers/customers.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import type { XenditPaymentRequestResponse } from './xendit-api.service';
import { XenditApiService } from './xendit-api.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private static readonly CHANNELS_REQUIRING_CARD_DETAILS = new Set([
    'CARDS',
    'CREDIT_CARD',
  ]);
  private static readonly CHANNEL_CODE_ALIASES: Record<string, string> = {
    TOUCHNGO_MY: 'TOUCHNGO',
    SHOPEEPAY_MY: 'SHOPEEPAY',
    FPX_MY: 'FPX',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly xendit: XenditApiService,
    private readonly wallet: WalletService,
    private readonly customers: CustomersService,
  ) {}

  private memberPublicBase(): string {
    const explicit = this.config.get<string>('MEMBER_APP_PUBLIC_URL')?.trim();
    if (explicit) return explicit.replace(/\/$/, '');
    const cors = this.config.get<string>('CLIENT_WEB_ORIGIN')?.split(',')[0]?.trim();
    if (cors) return cors.replace(/\/$/, '');
    return 'http://localhost:5193';
  }

  private isDemoMode(): boolean {
    const v = this.config.get<string>('PAYMENTS_DEMO_MODE')?.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
  }

  private assertShopChannelAllowed(channelCode: string) {
    const raw = this.config.get<string>('XENDIT_SHOP_CHANNEL_CODES')?.trim();
    if (!raw) return;
    const allowed = new Set(
      raw
        .split(',')
        .map((s) => this.normalizeChannelCode(s))
        .filter(Boolean),
    );
    const code = this.normalizeChannelCode(channelCode);
    if (!allowed.has(code)) {
      throw new BadRequestException({
        code: 'CHANNEL_NOT_ALLOWED',
        message: `Channel "${code}" is not enabled for shop checkout.`,
      });
    }
  }

  private assertChannelSupportedByCurrentIntegration(channelCode: string) {
    const code = this.normalizeChannelCode(channelCode);
    if (PaymentsService.CHANNELS_REQUIRING_CARD_DETAILS.has(code)) {
      throw new BadRequestException({
        code: 'CHANNEL_NOT_SUPPORTED_YET',
        message:
          'Direct channel card flow requires card_details (PAN/CVN/expiry/cardholder). Use tokenized card checkout via paymentTokenId, or use a wallet/bank channel (e.g. TOUCHNGO, SHOPEEPAY, FPX).',
      });
    }
  }

  private normalizeChannelCode(channelCode: string): string {
    const raw = channelCode.trim().toUpperCase();
    return PaymentsService.CHANNEL_CODE_ALIASES[raw] ?? raw;
  }

  shopChannelList(): Array<{ code: string; label: string }> {
    const raw =
      this.config.get<string>('XENDIT_SHOP_CHANNEL_CODES')?.trim() ||
      'TOUCHNGO,SHOPEEPAY,FPX,BNI_VA,BCA_VA';
    const codes = raw
      .split(',')
      .map((s) => this.normalizeChannelCode(s))
      .filter(Boolean)
      .filter(
        (code) =>
          !PaymentsService.CHANNELS_REQUIRING_CARD_DETAILS.has(code.toUpperCase()),
      );
    return [...new Set(codes)].map((code) => ({ code, label: shopChannelLabel(code) }));
  }

  async getShopChannelsPublic() {
    return { channels: this.shopChannelList() };
  }

  async createCardTokenSession(customerId: string) {
    const country =
      this.config.get<string>('XENDIT_COUNTRY')?.trim().toUpperCase() || 'MY';
    const currency =
      this.config.get<string>('XENDIT_CURRENCY')?.trim().toUpperCase() || 'MYR';
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, displayName: true, email: true, phoneE164: true },
    });
    if (!customer) {
      throw new NotFoundException({
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Customer not found',
      });
    }
    const allowedOrigins = this.resolveComponentsOrigins();
    const sessionNonce = randomUUID().replace(/-/g, '').slice(0, 12);
    const sessionRef = `card_${customerId}_${sessionNonce}`;
    const customerRef = `c${customerId.replace(/-/g, '').slice(0, 20)}${sessionNonce}`;
    const givenName = customer.displayName?.trim() || 'Moja Member';
    const session = await this.xendit.createCardsSaveSession({
      referenceId: sessionRef,
      country,
      currency,
      customerReferenceId: customerRef,
      customerGivenName: givenName,
      customerEmail: customer.email ?? undefined,
      customerMobileNumber: customer.phoneE164 ?? undefined,
      origins: allowedOrigins,
    });
    const paymentSessionId =
      typeof session.payment_session_id === 'string' ? session.payment_session_id : null;
    const componentsSdkKey =
      typeof session.components_sdk_key === 'string' ? session.components_sdk_key : null;
    if (!paymentSessionId || !componentsSdkKey) {
      throw new BadRequestException({
        code: 'XENDIT_COMPONENTS_SESSION_INVALID',
        message: 'Xendit did not return payment session or components SDK key.',
      });
    }
    return {
      paymentSessionId,
      componentsSdkKey,
      expiresAt: typeof session.expires_at === 'string' ? session.expires_at : null,
    };
  }

  async getCardTokenSessionStatus(customerId: string, paymentSessionId: string) {
    const session = await this.xendit.getSession(paymentSessionId);
    const referenceId =
      typeof session.reference_id === 'string' ? session.reference_id : null;
    if (!referenceId || !referenceId.startsWith(`card_${customerId}_`)) {
      throw new UnauthorizedException({
        code: 'SESSION_NOT_OWNED',
        message: 'Session does not belong to current user.',
      });
    }
    return {
      paymentSessionId:
        typeof session.payment_session_id === 'string'
          ? session.payment_session_id
          : paymentSessionId,
      status: typeof session.status === 'string' ? session.status : 'UNKNOWN',
      paymentTokenId:
        typeof session.payment_token_id === 'string' ? session.payment_token_id : null,
    };
  }

  private resolveComponentsOrigins(): string[] {
    const explicitOriginsCsv = this.config.get<string>('XENDIT_COMPONENTS_ORIGINS')?.trim();
    if (explicitOriginsCsv) {
      const explicitOrigins = explicitOriginsCsv
        .split(',')
        .map((s) => s.trim().replace(/\/$/, ''))
        .filter(Boolean);
      const nonHttps = explicitOrigins.filter((o) => !o.startsWith('https://'));
      if (nonHttps.length > 0) {
        throw new BadRequestException({
          code: 'XENDIT_COMPONENTS_ORIGINS_INVALID',
          message:
            'XENDIT_COMPONENTS_ORIGINS must contain HTTPS origins only (comma-separated).',
        });
      }
      return [...new Set(explicitOrigins)];
    }

    const origins = new Set<string>();
    const memberBase = this.memberPublicBase();
    if (memberBase) origins.add(memberBase);
    const cors = this.config.get<string>('CLIENT_WEB_ORIGIN')?.trim();
    if (cors) {
      for (const raw of cors.split(',')) {
        const origin = raw.trim().replace(/\/$/, '');
        if (origin) origins.add(origin);
      }
    }
    const resolved = [...origins];
    const httpsOnly = resolved.filter((o) => o.startsWith('https://'));
    if (httpsOnly.length > 0) return httpsOnly;
    throw new BadRequestException({
      code: 'XENDIT_COMPONENTS_HTTPS_ORIGIN_REQUIRED',
      message:
        'Xendit Components requires HTTPS origin. Set XENDIT_COMPONENTS_ORIGINS to your HTTPS frontend URL (for example, https://<your-tunnel-domain>).',
    });
  }

  async createWalletTopUpSession(
    customerId: string,
    amountCents: number,
    channelCodeOverride?: string,
  ) {
    if (!Number.isInteger(amountCents) || amountCents < 100) {
      throw new BadRequestException({
        code: 'PAYMENT_INVALID_AMOUNT',
        message: 'amountCents must be at least 100 (minimum 1.00 in major currency units).',
      });
    }

    const country =
      this.config.get<string>('XENDIT_COUNTRY')?.trim().toUpperCase() || 'MY';
    const currency =
      this.config.get<string>('XENDIT_CURRENCY')?.trim().toUpperCase() || 'MYR';
    const channelCode =
      this.normalizeChannelCode(
        channelCodeOverride?.trim() ||
          this.config.get<string>('XENDIT_DEFAULT_CHANNEL_CODE')?.trim() ||
          'TOUCHNGO',
      );
    this.assertChannelSupportedByCurrentIntegration(channelCode);

    const referenceId = randomUUID();
    const base = this.memberPublicBase();
    const successUrl = `${base}/?tab=account&walletTopup=success`;
    const failureUrl = `${base}/?tab=account&walletTopup=failed`;

    const requestAmount = amountCents / 100;

    const xenditResponse = await this.xendit.createPaymentRequest({
      referenceId,
      country,
      currency,
      requestAmount,
      channelCode,
      description: 'Moja member wallet top-up',
      successReturnUrl: successUrl,
      failureReturnUrl: failureUrl,
      metadata: {
        customerId: String(customerId),
        purpose: 'wallet_topup',
      },
    });

    const paymentRequestId =
      typeof xenditResponse.payment_request_id === 'string'
        ? xenditResponse.payment_request_id
        : null;
    const apiStatus =
      typeof xenditResponse.status === 'string' ? xenditResponse.status : 'UNKNOWN';

    await this.prisma.paymentIntent.create({
      data: {
        customerId,
        referenceId,
        purpose: 'wallet_topup',
        amountCents,
        currency,
        country,
        channelCode,
        status: 'PENDING',
        xenditPaymentRequestId: paymentRequestId,
        metadata: xenditResponse as object,
      },
    });

    if (apiStatus === 'SUCCEEDED') {
      await this.applyWalletTopUpFromXendit(referenceId, xenditResponse);
    }

    const redirectUrl = this.xendit.extractRedirectUrl(xenditResponse);

    return {
      referenceId,
      paymentRequestId,
      status: apiStatus,
      redirectUrl,
      channelCode,
      country,
      currency,
      amountCents,
    };
  }

  /**
   * Shop checkout: pending order + Xendit payment request (or demo / zero-total).
   */
  async createShopOrderCheckout(
    customerId: string,
    dto: SubmitMemberOrderDto,
    channelCodeRaw?: string,
    paymentTokenIdRaw?: string,
  ) {
    if (this.isDemoMode()) {
      const order = await this.customers.createPendingMemberOrder(customerId, dto);
      return {
        demoMode: true as const,
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalCents: order.totalCents,
        placedAt: order.placedAt.toISOString(),
        status: order.status,
      };
    }

    if (dto.totalCents === 0) {
      const order = await this.customers.createPendingMemberOrder(customerId, dto);
      await this.customers.finalizeShopOrderAfterPayment(order.id);
      const refreshed = await this.prisma.customerOrder.findUniqueOrThrow({
        where: { id: order.id },
      });
      return {
        zeroPaid: true as const,
        order: {
          id: refreshed.id,
          orderNumber: refreshed.orderNumber,
          placedAt: refreshed.placedAt.toISOString(),
          status: refreshed.status,
          totalCents: refreshed.totalCents,
        },
      };
    }

    if (!Number.isInteger(dto.totalCents) || dto.totalCents < 100) {
      throw new BadRequestException({
        code: 'ORDER_MIN_AMOUNT',
        message: 'Minimum payable amount is 1.00 in major currency units (100 cents).',
      });
    }

    const paymentTokenId = paymentTokenIdRaw?.trim() || null;
    const channelCode = paymentTokenId
      ? 'CARDS'
      : this.normalizeChannelCode(channelCodeRaw?.trim() || '');
    if (!channelCode) {
      throw new BadRequestException({
        code: 'CHANNEL_REQUIRED',
        message: 'Select a payment method (channel).',
      });
    }
    if (!paymentTokenId) {
      this.assertShopChannelAllowed(channelCode);
      this.assertChannelSupportedByCurrentIntegration(channelCode);
    }

    const country =
      this.config.get<string>('XENDIT_COUNTRY')?.trim().toUpperCase() || 'MY';
    const currency =
      this.config.get<string>('XENDIT_CURRENCY')?.trim().toUpperCase() || 'MYR';

    const order = await this.customers.createPendingMemberOrder(customerId, dto);
    const referenceId = randomUUID();
    const base = this.memberPublicBase();
    const successUrl = `${base}/?tab=shop&shopPayment=success&orderNumber=${encodeURIComponent(String(order.orderNumber))}`;
    const failureUrl = `${base}/?tab=shop&shopPayment=failed`;

    const requestAmount = dto.totalCents / 100;

    const xenditResponse = await this.xendit.createPaymentRequest({
      referenceId,
      country,
      currency,
      requestAmount,
      ...(paymentTokenId ? { paymentTokenId } : { channelCode }),
      description: `Moja shop order #${order.orderNumber}`,
      successReturnUrl: successUrl,
      failureReturnUrl: failureUrl,
      metadata: {
        customerId: String(customerId),
        purpose: 'shop_order',
        orderId: String(order.id),
      },
    });

    const paymentRequestId =
      typeof xenditResponse.payment_request_id === 'string'
        ? xenditResponse.payment_request_id
        : null;
    const apiStatus =
      typeof xenditResponse.status === 'string' ? xenditResponse.status : 'UNKNOWN';

    await this.prisma.paymentIntent.create({
      data: {
        customerId,
        referenceId,
        purpose: 'shop_order',
        amountCents: dto.totalCents,
        currency,
        country,
        channelCode,
        status: 'PENDING',
        xenditPaymentRequestId: paymentRequestId,
        metadata: { orderId: order.id } as object,
      },
    });

    if (apiStatus === 'SUCCEEDED') {
      await this.applyShopOrderFromXendit(referenceId, xenditResponse);
    }

    const redirectUrl = this.xendit.extractRedirectUrl(xenditResponse);

    return {
      demoMode: false as const,
      zeroPaid: false as const,
      orderId: order.id,
      orderNumber: order.orderNumber,
      referenceId,
      paymentRequestId,
      status: apiStatus,
      redirectUrl,
      channelCode,
      country,
      currency,
      amountCents: dto.totalCents,
    };
  }

  async completeDemoShopOrder(customerId: string, orderId: string) {
    if (!this.isDemoMode()) {
      throw new BadRequestException({
        code: 'DEMO_NOT_ENABLED',
        message: 'Demo payment completion is disabled when PAYMENTS_DEMO_MODE is not true.',
      });
    }
    const order = await this.prisma.customerOrder.findFirst({
      where: { id: orderId, customerId },
    });
    if (!order) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found',
      });
    }
    if (order.status !== 'pending_payment') {
      throw new BadRequestException({
        code: 'ORDER_NOT_PENDING',
        message: 'Order is not awaiting payment.',
      });
    }
    await this.customers.finalizeShopOrderAfterPayment(orderId);
    const refreshed = await this.prisma.customerOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: { lines: { orderBy: { id: 'asc' } } },
    });
    return {
      order: {
        id: refreshed.id,
        orderNumber: refreshed.orderNumber,
        placedAt: refreshed.placedAt.toISOString(),
        status: refreshed.status,
        totalCents: refreshed.totalCents,
        lines: refreshed.lines.map((l) => ({
          id: l.id,
          productId: l.productId,
          name: l.name,
          variantLabel: l.variantLabel,
          unitPriceCents: l.unitPriceCents,
          qty: l.qty,
          imageUrl: l.imageUrl,
        })),
      },
    };
  }

  private async applyWalletTopUpFromXendit(
    referenceId: string,
    data: XenditPaymentRequestResponse,
  ): Promise<void> {
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { referenceId },
    });
    if (!intent || intent.purpose !== 'wallet_topup') return;
    await this.creditWalletIfNeeded(intent.id, referenceId, data);
  }

  private async applyShopOrderFromXendit(
    referenceId: string,
    data: XenditPaymentRequestResponse,
  ): Promise<void> {
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { referenceId },
    });
    if (!intent || intent.purpose !== 'shop_order') return;
    if (intent.status === 'SUCCEEDED') return;

    const lock = await this.prisma.paymentIntent.updateMany({
      where: { id: intent.id, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });
    if (lock.count === 0) return;

    const meta = intent.metadata as { orderId?: string } | null;
    const orderId = typeof meta?.orderId === 'string' ? meta.orderId : null;
    if (!orderId) {
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'PENDING' },
      });
      return;
    }

    try {
      await this.customers.finalizeShopOrderAfterPayment(orderId);
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: {
          status: 'SUCCEEDED',
          metadata: mergeMetadata(intent.metadata, { xendit: data }) as object,
        },
      });
    } catch (err) {
      this.logger.error(`Shop order finalize failed for ${referenceId}`, err);
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'PENDING' },
      });
      throw err;
    }
  }

  async handleXenditWebhook(
    callbackToken: string | undefined,
    body: unknown,
  ): Promise<void> {
    const expected = this.config.get<string>('XENDIT_WEBHOOK_TOKEN')?.trim();
    if (!expected || callbackToken !== expected) {
      throw new UnauthorizedException({
        code: 'WEBHOOK_UNAUTHORIZED',
        message: 'Invalid or missing x-callback-token',
      });
    }

    if (!body || typeof body !== 'object') return;

    const event = (body as { event?: string }).event;
    const data = (body as { data?: Record<string, unknown> }).data;
    if (!data || typeof data !== 'object') return;

    const referenceId = data.reference_id;
    if (typeof referenceId !== 'string' || !referenceId) return;

    if (event === 'payment.capture') {
      const status = data.status;
      if (status !== 'SUCCEEDED') return;

      const intent = await this.prisma.paymentIntent.findUnique({
        where: { referenceId },
      });
      if (!intent) return;
      if (intent.purpose === 'wallet_topup') {
        await this.applyWalletTopUpFromXendit(referenceId, data as XenditPaymentRequestResponse);
        return;
      }
      if (intent.purpose === 'shop_order') {
        await this.applyShopOrderFromXendit(referenceId, data as XenditPaymentRequestResponse);
        return;
      }
      return;
    }

    if (event === 'payment.failure') {
      const intent = await this.prisma.paymentIntent.findUnique({
        where: { referenceId },
      });
      if (intent?.purpose === 'shop_order') {
        await this.prisma.paymentIntent.updateMany({
          where: { referenceId, status: { not: 'SUCCEEDED' } },
          data: {
            status: 'FAILED',
            metadata: mergeMetadata(intent.metadata, { xenditFailure: data }) as object,
          },
        });
        return;
      }
      await this.prisma.paymentIntent.updateMany({
        where: { referenceId, status: { not: 'SUCCEEDED' } },
        data: { status: 'FAILED', metadata: data as object },
      });
    }
  }

  private async creditWalletIfNeeded(
    paymentIntentId: string,
    referenceId: string,
    _xenditData: XenditPaymentRequestResponse,
  ): Promise<void> {
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { id: paymentIntentId },
    });
    if (!intent || intent.referenceId !== referenceId) return;
    if (intent.status === 'SUCCEEDED') return;

    const lock = await this.prisma.paymentIntent.updateMany({
      where: { id: intent.id, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });
    if (lock.count === 0) return;

    const paymentId =
      typeof _xenditData.payment_id === 'string' ? _xenditData.payment_id : undefined;

    try {
      await this.wallet.appendTransaction({
        customerId: intent.customerId,
        type: WalletTxnType.TOPUP,
        amountCents: intent.amountCents,
        reason: 'xendit_wallet_topup',
        createdByType: 'system',
        metadata: {
          paymentIntentId: intent.id,
          referenceId: intent.referenceId,
          xenditPaymentRequestId: intent.xenditPaymentRequestId,
          xenditPaymentId: paymentId,
        },
      });

      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: {
          status: 'SUCCEEDED',
          metadata: _xenditData as object,
        },
      });
    } catch (err) {
      this.logger.error(`Wallet top-up failed for ${referenceId}`, err);
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'PENDING' },
      });
      throw err;
    }
  }
}

function mergeMetadata(
  raw: unknown,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const base =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return extra ? { ...base, ...extra } : base;
}

function shopChannelLabel(code: string): string {
  const map: Record<string, string> = {
    TOUCHNGO: 'Touch ’n Go',
    SHOPEEPAY: 'ShopeePay',
    FPX: 'FPX (online banking)',
    TOUCHNGO_MY: 'Touch ’n Go',
    SHOPEEPAY_MY: 'ShopeePay',
    FPX_MY: 'FPX (online banking)',
    BNI_VA: 'BNI Virtual Account',
    BCA_VA: 'BCA Virtual Account',
    CREDIT_CARD: 'Card',
    QRIS: 'QRIS',
    OVO_ID: 'OVO',
    DANA_ID: 'DANA',
    LINKAJA_ID: 'LinkAja',
  };
  return map[code] ?? code;
}
