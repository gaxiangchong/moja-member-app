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
import { LoyaltyService } from '../loyalty/loyalty.service';
import { ReceiptEmailService } from '../notifications/receipt-email.service';
import { PrismaService } from '../prisma/prisma.service';
import { RewardsWorkflowService } from '../rewards-workflow/rewards-workflow.service';
import { BentoVoucherService } from '../bento-vouchers/bento-voucher.service';
import { memberRewardsCatalogWhere } from '../rewards/member-rewards-catalog.util';
import {
  discountCentsFromRebate,
  loadDefinitionDiscountMap,
} from '../rewards/voucher-definition-discount.util';
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
    private readonly loyalty: LoyaltyService,
    private readonly rewardsWorkflow: RewardsWorkflowService,
    private readonly receiptEmail: ReceiptEmailService,
    private readonly bentoVoucher: BentoVoucherService,
  ) {}

  private memberPublicBase(): string {
    const explicit = this.config.get<string>('MEMBER_APP_PUBLIC_URL')?.trim();
    if (explicit) return explicit.replace(/\/$/, '');
    const cors = this.config
      .get<string>('CLIENT_WEB_ORIGIN')
      ?.split(',')[0]
      ?.trim();
    if (cors) return cors.replace(/\/$/, '');
    return 'http://localhost:5193';
  }

  private bentoPublicBase(): string {
    const explicit = this.config.get<string>('BENTO_APP_PUBLIC_URL')?.trim();
    if (explicit) return explicit.replace(/\/$/, '');
    const cors = this.config
      .get<string>('CLIENT_WEB_ORIGIN')
      ?.split(',')
      .map((s) => s.trim())
      .find((o) => o.includes(':5195'));
    if (cors) return cors.replace(/\/$/, '');
    return 'http://localhost:5195';
  }

  /** When true, checkout skips Xendit; client completes via demo endpoints. */
  paymentsDemoModeEnabled(): boolean {
    const v = this.config
      .get<string>('PAYMENTS_DEMO_MODE')
      ?.trim()
      .toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
  }

  private isDemoMode(): boolean {
    return this.paymentsDemoModeEnabled();
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
          !PaymentsService.CHANNELS_REQUIRING_CARD_DETAILS.has(
            code.toUpperCase(),
          ),
      );
    return [...new Set(codes)].map((code) => ({
      code,
      label: shopChannelLabel(code),
    }));
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
      typeof session.payment_session_id === 'string'
        ? session.payment_session_id
        : null;
    const componentsSdkKey =
      typeof session.components_sdk_key === 'string'
        ? session.components_sdk_key
        : null;
    if (!paymentSessionId || !componentsSdkKey) {
      throw new BadRequestException({
        code: 'XENDIT_COMPONENTS_SESSION_INVALID',
        message: 'Xendit did not return payment session or components SDK key.',
      });
    }
    return {
      paymentSessionId,
      componentsSdkKey,
      expiresAt:
        typeof session.expires_at === 'string' ? session.expires_at : null,
    };
  }

  async getCardTokenSessionStatus(
    customerId: string,
    paymentSessionId: string,
  ) {
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
        typeof session.payment_token_id === 'string'
          ? session.payment_token_id
          : null,
    };
  }

  private resolveComponentsOrigins(): string[] {
    const explicitOriginsCsv = this.config
      .get<string>('XENDIT_COMPONENTS_ORIGINS')
      ?.trim();
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
        message:
          'amountCents must be at least 100 (minimum 1.00 in major currency units).',
      });
    }

    const country =
      this.config.get<string>('XENDIT_COUNTRY')?.trim().toUpperCase() || 'MY';
    const currency =
      this.config.get<string>('XENDIT_CURRENCY')?.trim().toUpperCase() || 'MYR';
    const channelCode = this.normalizeChannelCode(
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
      typeof xenditResponse.status === 'string'
        ? xenditResponse.status
        : 'UNKNOWN';

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
    voucherIdRaw?: string,
    rewardDefinitionIdRaw?: string,
    idempotencyKeyRaw?: string,
  ) {
    const voucherId = voucherIdRaw?.trim() || null;
    const rewardDefinitionId = rewardDefinitionIdRaw?.trim() || null;
    const idempotencyKey = idempotencyKeyRaw?.trim() || randomUUID();
    let voucherLockToken: string | null = null;
    let customerVoucherId: string | null = null;
    let rewardPointsCost: number | null = null;
    const subtotalCents = this.computeSubtotal(dto);

    if (voucherId && rewardDefinitionId) {
      throw new BadRequestException({
        code: 'PROMO_CONFLICT',
        message: 'Apply only one voucher or one points reward per order.',
      });
    }

    let discountCents = 0;

    if (rewardDefinitionId) {
      const resolved = await this.resolveRewardDefinitionDiscount(
        customerId,
        rewardDefinitionId,
        subtotalCents,
      );
      discountCents = resolved.discountCents;
      rewardPointsCost = resolved.pointsCost;
    } else if (voucherId) {
      try {
        const lock = await this.rewardsWorkflow.validateAndLockVoucher({
          customerId,
          voucherId,
          orderTotalCents: subtotalCents,
          orderType: this.resolveOrderTypeFromSummary(dto.fulfillmentSummary),
          productIds: dto.lines.map((l) => l.productId),
          idempotencyKey,
        });
        voucherLockToken = lock.lockToken;
        discountCents = await this.rewardsWorkflow.computeLockedVoucherDiscount({
          lockToken: voucherLockToken,
          subtotalCents,
        });
      } catch (err) {
        if (!(err instanceof NotFoundException)) throw err;
        const cv = await this.resolveCustomerVoucherDiscount(
          customerId,
          voucherId,
          subtotalCents,
        );
        customerVoucherId = cv.customerVoucherId;
        discountCents = cv.discountCents;
      }
    }

    dto.discountCents = discountCents;
    dto.totalCents = Math.max(0, subtotalCents - discountCents);

    const promoFinalize = async (orderId: string) => {
      await this.finalizeShopPromotions({
        customerId,
        orderId,
        voucherLockToken,
        customerVoucherId,
        rewardDefinitionId,
        pointsCost: rewardPointsCost,
      });
    };

    if (this.isDemoMode()) {
      const order = await this.customers.createPendingMemberOrder(
        customerId,
        dto,
      );
      await promoFinalize(order.id);
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
      const order = await this.customers.createPendingMemberOrder(
        customerId,
        dto,
      );
      await this.customers.finalizeShopOrderAfterPayment(order.id);
      await promoFinalize(order.id);
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

    if (!Number.isInteger(subtotalCents) || subtotalCents < 100) {
      throw new BadRequestException({
        code: 'ORDER_MIN_AMOUNT',
        message:
          'Minimum order subtotal is 1.00 in major currency units (100 cents).',
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

    const order = await this.customers.createPendingMemberOrder(
      customerId,
      dto,
    );
    const referenceId = randomUUID();
    const base = this.memberPublicBase();
    const successUrl = `${base}/?tab=shop&shopPayment=success&orderNumber=${encodeURIComponent(String(order.orderNumber))}`;
    const failureUrl = `${base}/?tab=shop&shopPayment=failed`;

    const requestAmount = dto.totalCents / 100;

    const paymentMetadata: Record<string, string> = {
      customerId: String(customerId),
      purpose: 'shop_order',
      orderId: String(order.id),
      idempotencyKey,
    };
    if (voucherLockToken) paymentMetadata.voucherLockToken = voucherLockToken;
    if (voucherId) paymentMetadata.voucherId = voucherId;
    if (customerVoucherId) paymentMetadata.customerVoucherId = customerVoucherId;
    if (rewardDefinitionId) {
      paymentMetadata.rewardDefinitionId = rewardDefinitionId;
      if (rewardPointsCost != null) {
        paymentMetadata.rewardPointsCost = String(rewardPointsCost);
      }
    }

    const xenditResponse = await this.xendit.createPaymentRequest({
      referenceId,
      country,
      currency,
      requestAmount,
      ...(paymentTokenId ? { paymentTokenId } : { channelCode }),
      description: `Moja shop order #${order.orderNumber}`,
      successReturnUrl: successUrl,
      failureReturnUrl: failureUrl,
      metadata: paymentMetadata,
    });

    const paymentRequestId =
      typeof xenditResponse.payment_request_id === 'string'
        ? xenditResponse.payment_request_id
        : null;
    const apiStatus =
      typeof xenditResponse.status === 'string'
        ? xenditResponse.status
        : 'UNKNOWN';

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
        metadata: {
          orderId: order.id,
          voucherLockToken: voucherLockToken ?? null,
          voucherId: voucherId ?? null,
          customerVoucherId: customerVoucherId ?? null,
          rewardDefinitionId: rewardDefinitionId ?? null,
          rewardPointsCost: rewardPointsCost ?? null,
          idempotencyKey,
        } as object,
      },
    });

    if (apiStatus === 'SUCCEEDED') {
      await this.applyShopOrderFromXendit(referenceId, xenditResponse);
    }

    const redirectUrl = this.xendit.extractRedirectUrl(xenditResponse);
    if (!redirectUrl && voucherLockToken) {
      await this.rewardsWorkflow.releaseVoucherLock(voucherLockToken);
    }

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
      subtotalCents,
      discountCents,
      voucherId,
      voucherLockToken,
    };
  }

  /**
   * Bento subscription checkout via Xendit (or demo mode).
   */
  async createBentoSubscriptionCheckout(
    customerId: string,
    subscriptionIds: string[],
    amountCents: number,
    channelCodeRaw?: string,
    bentoVoucherRedemptionId?: string,
  ) {
    if (subscriptionIds.length === 0) {
      throw new BadRequestException({
        code: 'BENTO_SUBSCRIPTION_REQUIRED',
        message: 'At least one subscription is required for checkout.',
      });
    }

    const subscriptions = await this.prisma.bentoSubscription.findMany({
      where: { id: { in: subscriptionIds }, customerId },
      include: { package: true },
    });
    if (subscriptions.length !== subscriptionIds.length) {
      throw new NotFoundException({
        code: 'BENTO_SUBSCRIPTION_NOT_FOUND',
        message: 'Subscription not found',
      });
    }
    if (
      subscriptions.some((subscription) => subscription.status !== 'PENDING_PAYMENT')
    ) {
      throw new BadRequestException({
        code: 'BENTO_NOT_PENDING',
        message: 'Subscription is not awaiting payment.',
      });
    }

    const subscription = subscriptions[0];

    if (this.isDemoMode()) {
      // Demo checkout always completes (no real payment / webhook), so finalize
      // the promo-code reservation now rather than waiting on a payment intent.
      if (bentoVoucherRedemptionId) {
        await this.bentoVoucher.confirmRedemption(bentoVoucherRedemptionId);
      }
      return {
        demoMode: true as const,
        subscriptionId: subscription.id,
        subscriptionIds: subscriptions.map((s) => s.id),
        totalCents: amountCents,
        status: subscription.status,
      };
    }

    const channelCode = this.normalizeChannelCode(channelCodeRaw?.trim() || '');
    if (!channelCode) {
      throw new BadRequestException({
        code: 'CHANNEL_REQUIRED',
        message: 'Select a payment method (channel).',
      });
    }
    this.assertShopChannelAllowed(channelCode);
    this.assertChannelSupportedByCurrentIntegration(channelCode);

    const country =
      this.config.get<string>('XENDIT_COUNTRY')?.trim().toUpperCase() || 'MY';
    const currency =
      this.config.get<string>('XENDIT_CURRENCY')?.trim().toUpperCase() || 'MYR';

    const referenceId = randomUUID();
    const base = this.bentoPublicBase();
    const successUrl = `${base}/?bentoPayment=success&subscriptionId=${encodeURIComponent(subscription.id)}`;
    const failureUrl = `${base}/?bentoPayment=failed`;

    const setsLabel =
      subscriptions.length > 1 ? ` (${subscriptions.length} sets)` : '';
    const xenditResponse = await this.xendit.createPaymentRequest({
      referenceId,
      country,
      currency,
      requestAmount: amountCents / 100,
      channelCode,
      description: `Moja Bento ${subscription.package.label}${setsLabel}`,
      successReturnUrl: successUrl,
      failureReturnUrl: failureUrl,
      metadata: {
        customerId: String(customerId),
        purpose: 'bento_subscription',
        subscriptionId: String(subscription.id),
        subscriptionIds: subscriptions.map((s) => s.id).join(','),
      },
    });

    const paymentRequestId =
      typeof xenditResponse.payment_request_id === 'string'
        ? xenditResponse.payment_request_id
        : null;
    const apiStatus =
      typeof xenditResponse.status === 'string'
        ? xenditResponse.status
        : 'UNKNOWN';

    const intent = await this.prisma.paymentIntent.create({
      data: {
        customerId,
        referenceId,
        purpose: 'bento_subscription',
        amountCents,
        currency,
        country,
        channelCode,
        status: 'PENDING',
        xenditPaymentRequestId: paymentRequestId,
        metadata: {
          subscriptionId: subscription.id,
          subscriptionIds: subscriptions.map((s) => s.id),
        } as object,
      },
    });

    await this.prisma.bentoSubscription.updateMany({
      where: { id: { in: subscriptions.map((s) => s.id) } },
      data: { paymentIntentId: intent.id },
    });

    // Link the reserved promo-code redemption to this intent so it can be
    // confirmed on payment success or released on failure.
    if (bentoVoucherRedemptionId) {
      await this.bentoVoucher.attachPaymentIntent(
        bentoVoucherRedemptionId,
        intent.id,
      );
    }

    if (apiStatus === 'SUCCEEDED') {
      await this.applyBentoSubscriptionFromXendit(
        referenceId,
        xenditResponse,
      );
    }

    const redirectUrl = this.xendit.extractRedirectUrl(xenditResponse);

    return {
      demoMode: false as const,
      subscriptionId: subscription.id,
      subscriptionIds: subscriptions.map((s) => s.id),
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

  async completeDemoBentoSubscription(
    customerId: string,
    subscriptionId: string,
  ) {
    if (!this.isDemoMode()) {
      throw new BadRequestException({
        code: 'DEMO_NOT_ENABLED',
        message:
          'Demo payment completion is disabled when PAYMENTS_DEMO_MODE is not true.',
      });
    }
    const subscription = await this.prisma.bentoSubscription.findFirst({
      where: { id: subscriptionId, customerId },
    });
    if (!subscription) {
      throw new NotFoundException({
        code: 'BENTO_SUBSCRIPTION_NOT_FOUND',
        message: 'Subscription not found',
      });
    }
    if (subscription.status !== 'PENDING_PAYMENT') {
      throw new BadRequestException({
        code: 'BENTO_NOT_PENDING',
        message: 'Subscription is not awaiting payment.',
      });
    }
    await this.prisma.bentoSubscription.update({
      where: { id: subscriptionId },
      data: { status: 'ACTIVE' },
    });
    const refreshed = await this.prisma.bentoSubscription.findUniqueOrThrow({
      where: { id: subscriptionId },
      include: { package: true },
    });
    // Mark this member as interested in bento (→ "both" if they also buy cake).
    void this.customers.addInterestTag(customerId, 'bento');
    // Same receipt as a real payment, so the demo flow exercises email too.
    void this.receiptEmail.sendBentoSubscriptionReceipt({
      subscriptionId,
      paymentIntentId: refreshed.paymentIntentId,
    });
    // Notify the team inbox of every successful bento purchase.
    void this.receiptEmail.sendBentoAdminNotification({
      subscriptionId,
      paymentIntentId: refreshed.paymentIntentId,
    });
    return {
      subscription: {
        id: refreshed.id,
        status: refreshed.status,
        totalCents: refreshed.totalCents,
        package: refreshed.package.label,
      },
    };
  }

  async completeDemoShopOrder(customerId: string, orderId: string) {
    if (!this.isDemoMode()) {
      throw new BadRequestException({
        code: 'DEMO_NOT_ENABLED',
        message:
          'Demo payment completion is disabled when PAYMENTS_DEMO_MODE is not true.',
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
    // Mark this member as interested in cake (→ "both" if they also buy bento).
    void this.customers.addInterestTag(customerId, 'cake');
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

  /**
   * Customer-scoped status lookup for a single payment intent. Used by the
   * member web app to poll for completion when an e-wallet redirect doesn't
   * return the user to the app (common with TNG/ShopeePay in live mode).
   */
  async getMyPaymentIntentStatus(customerId: string, referenceId: string) {
    const trimmed = referenceId.trim();
    if (!trimmed) {
      throw new NotFoundException({
        code: 'PAYMENT_INTENT_NOT_FOUND',
        message: 'Payment intent not found.',
      });
    }
    let intent = await this.prisma.paymentIntent.findUnique({
      where: { referenceId: trimmed },
    });
    if (!intent || intent.customerId !== customerId) {
      throw new NotFoundException({
        code: 'PAYMENT_INTENT_NOT_FOUND',
        message: 'Payment intent not found.',
      });
    }

    // Active reconciliation: if the intent is still pending, pull the latest
    // status straight from Xendit and finalize it. This makes e-wallet
    // payments (TnG, ShopeePay) succeed even when the webhook can't reach us
    // (common in test/local), instead of getting stuck on PENDING_PAYMENT.
    if (intent.status === 'PENDING' && intent.xenditPaymentRequestId) {
      try {
        const data = await this.xendit.getPaymentRequest(
          intent.xenditPaymentRequestId,
        );
        if (data.status === 'SUCCEEDED') {
          if (intent.purpose === 'wallet_topup') {
            await this.applyWalletTopUpFromXendit(intent.referenceId, data);
          } else if (intent.purpose === 'shop_order') {
            await this.applyShopOrderFromXendit(intent.referenceId, data);
          } else if (intent.purpose === 'bento_subscription') {
            await this.applyBentoSubscriptionFromXendit(intent.referenceId, data);
          }
          const refreshed = await this.prisma.paymentIntent.findUnique({
            where: { referenceId: trimmed },
          });
          if (refreshed) intent = refreshed;
        }
      } catch (err) {
        // Xendit unreachable / transient — fall back to the stored status.
        this.logger.warn(
          `Payment status reconcile failed for ${trimmed}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    let orderId: string | null = null;
    let orderNumber: number | null = null;
    if (intent.purpose === 'shop_order') {
      const meta = intent.metadata as { orderId?: string } | null;
      orderId = typeof meta?.orderId === 'string' ? meta.orderId : null;
      if (orderId) {
        const order = await this.prisma.customerOrder.findUnique({
          where: { id: orderId },
          select: { orderNumber: true },
        });
        orderNumber = order?.orderNumber ?? null;
      }
    }

    return {
      referenceId: intent.referenceId,
      status: intent.status,
      purpose: intent.purpose,
      channelCode: intent.channelCode,
      currency: intent.currency,
      amountCents: intent.amountCents,
      orderId,
      orderNumber,
      updatedAt: intent.updatedAt.toISOString(),
    };
  }

  /**
   * Best-effort: if a bento subscription's payment is still pending, pull the
   * latest status from Xendit and finalize it. Lets a member schedule pickups
   * right after paying even when the webhook hasn't arrived (test/local).
   */
  async reconcileBentoSubscriptionPayment(subscriptionId: string): Promise<void> {
    const sub = await this.prisma.bentoSubscription.findUnique({
      where: { id: subscriptionId },
      select: { paymentIntentId: true },
    });
    if (!sub?.paymentIntentId) return;
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { id: sub.paymentIntentId },
    });
    if (
      !intent ||
      intent.status !== 'PENDING' ||
      intent.purpose !== 'bento_subscription' ||
      !intent.xenditPaymentRequestId
    ) {
      return;
    }
    try {
      const data = await this.xendit.getPaymentRequest(
        intent.xenditPaymentRequestId,
      );
      if (data.status === 'SUCCEEDED') {
        await this.applyBentoSubscriptionFromXendit(intent.referenceId, data);
      }
    } catch (err) {
      this.logger.warn(
        `Bento payment reconcile failed for subscription ${subscriptionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
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

  private async applyBentoSubscriptionFromXendit(
    referenceId: string,
    data: XenditPaymentRequestResponse,
  ): Promise<void> {
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { referenceId },
    });
    if (!intent || intent.purpose !== 'bento_subscription') return;
    if (intent.status === 'SUCCEEDED') return;

    const lock = await this.prisma.paymentIntent.updateMany({
      where: { id: intent.id, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });
    if (lock.count === 0) return;

    const meta = intent.metadata as {
      subscriptionId?: string;
      subscriptionIds?: string[];
    } | null;
    const subscriptionIds =
      Array.isArray(meta?.subscriptionIds) && meta.subscriptionIds.length > 0
        ? meta.subscriptionIds.filter((id): id is string => typeof id === 'string')
        : typeof meta?.subscriptionId === 'string'
          ? [meta.subscriptionId]
          : [];
    if (subscriptionIds.length === 0) {
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'PENDING' },
      });
      return;
    }

    try {
      await this.prisma.bentoSubscription.updateMany({
        where: { id: { in: subscriptionIds }, status: 'PENDING_PAYMENT' },
        data: { status: 'ACTIVE' },
      });
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: {
          status: 'SUCCEEDED',
          metadata: mergeMetadata(intent.metadata, { xendit: data }) as object,
        },
      });
      // Finalize any promo-code redemption tied to this intent. Capacity was
      // already claimed at checkout, so this only flips RESERVED -> CONFIRMED.
      void this.bentoVoucher.confirmByPaymentIntent(intent.id);
      // Mark this member as interested in bento (→ "both" if they also buy cake).
      void this.customers.addInterestTag(intent.customerId, 'bento');
      // Fire-and-forget: a transient email failure must not roll back a
      // successful payment, and the webhook should still ack 200 quickly.
      for (const subscriptionId of subscriptionIds) {
        void this.receiptEmail.sendBentoSubscriptionReceipt({
          subscriptionId,
          paymentIntentId: intent.id,
        });
        // Notify the team inbox of every successful bento purchase.
        void this.receiptEmail.sendBentoAdminNotification({
          subscriptionId,
          paymentIntentId: intent.id,
        });
      }
    } catch (err) {
      this.logger.error(
        `Bento subscription finalize failed for ${referenceId}`,
        err,
      );
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'PENDING' },
      });
      throw err;
    }
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

    const meta = intent.metadata as {
      orderId?: string;
      voucherLockToken?: string;
      customerVoucherId?: string;
      rewardDefinitionId?: string;
      rewardPointsCost?: number;
    } | null;
    const orderId = typeof meta?.orderId === 'string' ? meta.orderId : null;
    const voucherLockToken =
      meta &&
      typeof meta === 'object' &&
      typeof meta.voucherLockToken === 'string'
        ? meta.voucherLockToken
        : null;
    const customerVoucherId =
      meta &&
      typeof meta === 'object' &&
      typeof meta.customerVoucherId === 'string'
        ? meta.customerVoucherId
        : null;
    const rewardDefinitionId =
      meta &&
      typeof meta === 'object' &&
      typeof meta.rewardDefinitionId === 'string'
        ? meta.rewardDefinitionId
        : null;
    const rewardPointsCost =
      meta &&
      typeof meta === 'object' &&
      typeof meta.rewardPointsCost === 'number'
        ? meta.rewardPointsCost
        : null;
    if (!orderId) {
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'PENDING' },
      });
      return;
    }

    try {
      await this.customers.finalizeShopOrderAfterPayment(orderId);
      // Mark this member as interested in cake (→ "both" if they also buy bento).
      void this.customers.addInterestTag(intent.customerId, 'cake');
      await this.finalizeShopPromotions({
        customerId: intent.customerId,
        orderId,
        voucherLockToken,
        customerVoucherId,
        rewardDefinitionId,
        pointsCost: rewardPointsCost,
      });
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: {
          status: 'SUCCEEDED',
          metadata: mergeMetadata(intent.metadata, { xendit: data }) as object,
        },
      });
      // Fire-and-forget: a transient email failure must not roll back a
      // successful payment, and the webhook should still ack 200 quickly.
      void this.receiptEmail.sendShopOrderReceipt({
        orderId,
        paymentIntentId: intent.id,
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
        await this.applyWalletTopUpFromXendit(
          referenceId,
          data as XenditPaymentRequestResponse,
        );
        return;
      }
      if (intent.purpose === 'shop_order') {
        await this.applyShopOrderFromXendit(
          referenceId,
          data as XenditPaymentRequestResponse,
        );
        return;
      }
      if (intent.purpose === 'bento_subscription') {
        await this.applyBentoSubscriptionFromXendit(
          referenceId,
          data as XenditPaymentRequestResponse,
        );
        return;
      }
      return;
    }

    if (event === 'payment.failure') {
      const intent = await this.prisma.paymentIntent.findUnique({
        where: { referenceId },
      });
      const meta = intent?.metadata as { voucherLockToken?: string } | null;
      if (meta?.voucherLockToken) {
        await this.rewardsWorkflow.releaseVoucherLock(meta.voucherLockToken);
      }
      if (intent?.purpose === 'shop_order') {
        await this.prisma.paymentIntent.updateMany({
          where: { referenceId, status: { not: 'SUCCEEDED' } },
          data: {
            status: 'FAILED',
            metadata: mergeMetadata(intent.metadata, {
              xenditFailure: data,
            }) as object,
          },
        });
        return;
      }
      if (intent?.purpose === 'bento_subscription') {
        await this.prisma.paymentIntent.updateMany({
          where: { referenceId, status: { not: 'SUCCEEDED' } },
          data: {
            status: 'FAILED',
            metadata: mergeMetadata(intent.metadata, {
              xenditFailure: data,
            }) as object,
          },
        });
        // Return any promo-code capacity claimed for this failed checkout.
        await this.bentoVoucher.releaseByPaymentIntent(intent.id);
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
      typeof _xenditData.payment_id === 'string'
        ? _xenditData.payment_id
        : undefined;

    try {
      // Idempotent: if a prior attempt credited the wallet then failed while
      // marking SUCCEEDED (catch resets to PENDING), do not credit again.
      const alreadyCredited =
        await this.prisma.storedWalletLedgerEntry.findFirst({
          where: {
            customerId: intent.customerId,
            type: WalletTxnType.TOPUP,
            reason: 'xendit_wallet_topup',
            metadata: {
              path: ['paymentIntentId'],
              equals: intent.id,
            },
          },
          select: { id: true },
        });
      if (!alreadyCredited) {
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
      }

      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: {
          status: 'SUCCEEDED',
          metadata: _xenditData as object,
        },
      });
      // Fire-and-forget transactional receipt.
      void this.receiptEmail.sendWalletTopUpReceipt({
        paymentIntentId: intent.id,
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

  private resolveOrderTypeFromSummary(
    fulfillmentSummary: SubmitMemberOrderDto['fulfillmentSummary'],
  ): string | undefined {
    const first = Array.isArray(fulfillmentSummary)
      ? fulfillmentSummary[0]
      : null;
    if (!first) return undefined;
    const v = String(first).toLowerCase();
    if (v.includes('delivery')) return 'DELIVERY';
    if (v.includes('pickup')) return 'PICKUP';
    if (v.includes('in store')) return 'IN_STORE';
    return undefined;
  }

  private computeSubtotal(dto: SubmitMemberOrderDto): number {
    return dto.lines.reduce(
      (sum, line) => sum + line.unitPriceCents * line.qty,
      0,
    );
  }

  private async resolveCustomerVoucherDiscount(
    customerId: string,
    customerVoucherId: string,
    subtotalCents: number,
  ): Promise<{ customerVoucherId: string; discountCents: number }> {
    const row = await this.prisma.customerVoucher.findFirst({
      where: {
        id: customerVoucherId,
        customerId,
        status: 'ISSUED',
      },
      include: {
        definition: { select: { id: true, title: true } },
      },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'VOUCHER_NOT_FOUND',
        message: 'Voucher not found in your wallet.',
      });
    }
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: 'VOUCHER_EXPIRED',
        message: 'This voucher has expired.',
      });
    }
    const map = await loadDefinitionDiscountMap(this.prisma, [row.definition.id]);
    const meta = map.get(row.definition.id);
    if (meta?.minSpendSen != null && subtotalCents < meta.minSpendSen) {
      throw new BadRequestException({
        code: 'VOUCHER_MIN_SPEND',
        message: 'Order does not meet the minimum spend for this voucher.',
      });
    }
    const discountCents = discountCentsFromRebate(subtotalCents, meta);
    if (discountCents <= 0) {
      throw new BadRequestException({
        code: 'VOUCHER_NO_DISCOUNT',
        message:
          'This voucher has no rebate amount configured. Contact support if this looks wrong.',
      });
    }
    return { customerVoucherId: row.id, discountCents };
  }

  private async resolveRewardDefinitionDiscount(
    customerId: string,
    definitionId: string,
    subtotalCents: number,
  ): Promise<{ discountCents: number; pointsCost: number }> {
    const def = await this.prisma.voucherDefinition.findFirst({
      where: { id: definitionId, ...memberRewardsCatalogWhere() },
      select: { id: true, title: true, pointsCost: true },
    });
    if (!def) {
      // New campaign model: reward catalog entry linked to a voucher campaign.
      return this.resolveNewRewardCatalogDiscount(
        customerId,
        definitionId,
        subtotalCents,
      );
    }
    const pointsCost = def.pointsCost ?? 0;
    if (pointsCost <= 0) {
      throw new BadRequestException({
        code: 'REWARD_NOT_REDEEMABLE',
        message: 'This reward cannot be redeemed with points.',
      });
    }
    const wallet = await this.loyalty.getWalletSummary(customerId);
    if (wallet.pointsBalance < pointsCost) {
      throw new BadRequestException({
        code: 'INSUFFICIENT_POINTS',
        message: 'Not enough points for this reward.',
      });
    }
    const map = await loadDefinitionDiscountMap(this.prisma, [def.id]);
    const meta = map.get(def.id);
    if (meta?.minSpendSen != null && subtotalCents < meta.minSpendSen) {
      throw new BadRequestException({
        code: 'REWARD_MIN_SPEND',
        message: 'Order does not meet the minimum spend for this reward.',
      });
    }
    const discountCents = discountCentsFromRebate(subtotalCents, meta);
    if (discountCents <= 0) {
      throw new BadRequestException({
        code: 'REWARD_NO_DISCOUNT',
        message:
          'This reward has no discount value configured. Contact support if this looks wrong.',
      });
    }
    return { discountCents, pointsCost };
  }

  /**
   * Resolve a points-catalog reward from the new campaign model
   * (`RewardCatalog` linked to a `VoucherCampaign`). Deducts no points here —
   * `finalizeShopPromotions` does that on payment success. Mirrors the legacy
   * one-step "redeem at checkout" UX so members spend points for an instant
   * cash discount rather than a two-step voucher issue.
   */
  private async resolveNewRewardCatalogDiscount(
    customerId: string,
    rewardCatalogId: string,
    subtotalCents: number,
  ): Promise<{ discountCents: number; pointsCost: number }> {
    const reward = await this.prisma.rewardCatalog.findFirst({
      where: {
        id: rewardCatalogId,
        isActive: true,
        visibleInRewardsWallet: true,
      },
      include: { voucherCampaign: true },
    });
    if (!reward) {
      throw new NotFoundException({
        code: 'REWARD_NOT_FOUND',
        message: 'Reward is not available.',
      });
    }
    const pointsCost = reward.pointsCost ?? 0;
    if (pointsCost <= 0) {
      throw new BadRequestException({
        code: 'REWARD_NOT_REDEEMABLE',
        message: 'This reward cannot be redeemed with points.',
      });
    }
    const wallet = await this.loyalty.getWalletSummary(customerId);
    if (wallet.pointsBalance < pointsCost) {
      throw new BadRequestException({
        code: 'INSUFFICIENT_POINTS',
        message: 'Not enough points for this reward.',
      });
    }
    const campaign = reward.voucherCampaign;
    const minSpend = campaign?.minSpend ?? null;
    if (minSpend != null && subtotalCents < minSpend) {
      throw new BadRequestException({
        code: 'REWARD_MIN_SPEND',
        message: 'Order does not meet the minimum spend for this reward.',
      });
    }
    let discountCents = 0;
    if (campaign?.voucherType === 'FIXED_AMOUNT') {
      discountCents = Math.min(campaign.fixedAmountOff ?? 0, subtotalCents);
    } else if (campaign?.voucherType === 'PERCENTAGE') {
      const pct = Math.max(0, Math.min(campaign.percentageOff ?? 0, 100));
      discountCents = Math.floor((subtotalCents * pct) / 100);
    } else if (campaign?.voucherType === 'DELIVERY_DISCOUNT') {
      discountCents = Math.min(
        campaign.deliveryDiscountAmount ?? 0,
        subtotalCents,
      );
    }
    if (discountCents <= 0) {
      throw new BadRequestException({
        code: 'REWARD_NO_DISCOUNT',
        message:
          'This reward has no discount value configured. Contact support if this looks wrong.',
      });
    }
    return { discountCents, pointsCost };
  }

  private async finalizeShopPromotions(input: {
    customerId: string;
    orderId: string;
    voucherLockToken?: string | null;
    customerVoucherId?: string | null;
    rewardDefinitionId?: string | null;
    pointsCost?: number | null;
  }): Promise<void> {
    if (input.voucherLockToken) {
      await this.rewardsWorkflow.finalizeVoucherRedemption(
        input.voucherLockToken,
        input.orderId,
      );
    }
    if (input.customerVoucherId) {
      await this.prisma.customerVoucher.updateMany({
        where: {
          id: input.customerVoucherId,
          customerId: input.customerId,
          status: 'ISSUED',
        },
        data: { status: 'REDEEMED', redeemedAt: new Date() },
      });
    }
    if (
      input.rewardDefinitionId &&
      input.pointsCost != null &&
      input.pointsCost > 0
    ) {
      const redeemReason = `checkout_redeem_${input.rewardDefinitionId}`;
      // Idempotent across payment finalize retries: order purchase credits use
      // the same referenceType/referenceId but a different reason, so key on
      // the redeem reason to avoid double-deducting after a SUCCEEDED update
      // failure resets the intent to PENDING.
      const alreadyRedeemed = await this.prisma.loyaltyLedgerEntry.findFirst({
        where: {
          customerId: input.customerId,
          referenceType: 'customer_order',
          referenceId: input.orderId,
          reason: redeemReason,
        },
        select: { id: true },
      });
      if (!alreadyRedeemed) {
        await this.loyalty.appendLedgerEntry({
          customerId: input.customerId,
          deltaPoints: -input.pointsCost,
          reason: redeemReason,
          referenceType: 'customer_order',
          referenceId: input.orderId,
        });
      }
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
