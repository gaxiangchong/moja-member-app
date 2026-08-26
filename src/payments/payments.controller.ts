import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { DemoCompleteShopOrderDto } from './dto/demo-complete-shop-order.dto';
import { DemoCompleteBentoSubscriptionDto } from './dto/demo-complete-bento-subscription.dto';
import { ShopOrderCheckoutDto } from './dto/shop-order-checkout.dto';
import { WalletTopUpSessionDto } from './dto/wallet-topup-session.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /**
   * Public flags for checkout UIs (e.g. bento-web design preview without Xendit).
   */
  @Get('config')
  @SkipThrottle()
  getConfig() {
    return {
      paymentsDemoMode: this.payments.paymentsDemoModeEnabled(),
      paymentsDisabled: this.payments.paymentsDisabledEnabled(),
    };
  }

  /**
   * Payment methods enabled for shop (from XENDIT_SHOP_CHANNEL_CODES).
   */
  @Get('xendit/shop-channels')
  getShopChannels() {
    return this.payments.getShopChannelsPublic();
  }

  @Post('xendit/card-token-session')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  createCardTokenSession(@CurrentUser() user: AuthUser) {
    return this.payments.createCardTokenSession(user.customerId);
  }

  @Get('xendit/card-token-session/:paymentSessionId')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  getCardTokenSessionStatus(
    @CurrentUser() user: AuthUser,
    @Param('paymentSessionId') paymentSessionId: string,
  ) {
    return this.payments.getCardTokenSessionStatus(
      user.customerId,
      paymentSessionId,
    );
  }

  /**
   * Customer-scoped lookup of a payment intent by reference id, used by the
   * member web app to poll for completion when a redirect-back from an
   * e-wallet (e.g. Touch 'n Go, ShopeePay) doesn't return the user to the app.
   * Returns enough information for the client to show the success/failure UI.
   */
  @Get('intent/:referenceId')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  getMyPaymentIntentStatus(
    @CurrentUser() user: AuthUser,
    @Param('referenceId') referenceId: string,
  ) {
    return this.payments.getMyPaymentIntentStatus(
      user.customerId,
      referenceId,
    );
  }

  /**
   * Start a Xendit `PAY` payment request for stored wallet top-up.
   * @see https://docs.xendit.co/docs/how-payments-api-work
   */
  @Post('xendit/wallet-topup')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  createWalletTopUp(
    @CurrentUser() user: AuthUser,
    @Body() dto: WalletTopUpSessionDto,
  ) {
    return this.payments.createWalletTopUpSession(
      user.customerId,
      dto.amountCents,
      dto.channelCode,
    );
  }

  /**
   * Create a pending order and Xendit payment request; client redirects to `redirectUrl`.
   * When PAYMENTS_DEMO_MODE=true, returns demo payload (complete via POST …/demo/complete-shop-order).
   */
  @Post('xendit/shop-order')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  createShopOrder(
    @CurrentUser() user: AuthUser,
    @Body() dto: ShopOrderCheckoutDto,
  ) {
    return this.payments.createShopOrderCheckout(
      user.customerId,
      dto.order,
      dto.channelCode,
      dto.paymentTokenId,
      dto.voucherId,
      dto.rewardDefinitionId,
      dto.idempotencyKey,
    );
  }

  /**
   * Simulates successful payment for demo mode (PAYMENTS_DEMO_MODE=true) only.
   */
  @Post('demo/complete-shop-order')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  completeDemoShopOrder(
    @CurrentUser() user: AuthUser,
    @Body() dto: DemoCompleteShopOrderDto,
  ) {
    return this.payments.completeDemoShopOrder(user.customerId, dto.orderId);
  }

  /**
   * Simulates successful bento subscription payment (PAYMENTS_DEMO_MODE=true) only.
   */
  @Post('demo/complete-bento-subscription')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  completeDemoBentoSubscription(
    @CurrentUser() user: AuthUser,
    @Body() dto: DemoCompleteBentoSubscriptionDto,
  ) {
    return this.payments.completeDemoBentoSubscription(
      user.customerId,
      dto.subscriptionId,
    );
  }
}

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly payments: PaymentsService) {}

  /**
   * Xendit sends `payment.capture` / `payment.failure` here.
   * Configure the same URL and callback token in the Xendit dashboard.
   */
  @Post('xendit')
  @HttpCode(200)
  @SkipThrottle()
  async xendit(
    @Headers('x-callback-token') callbackToken: string | undefined,
    @Body() body: unknown,
  ) {
    await this.payments.handleXenditWebhook(callbackToken, body);
    return { received: true };
  }
}
