import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';

describe('PaymentsService provider ordering', () => {
  function buildService(deps: {
    prisma: Record<string, unknown>;
    xendit: {
      createPaymentRequest: jest.Mock;
      extractRedirectUrl: jest.Mock;
    };
    customers?: {
      createPendingMemberOrder: jest.Mock;
      finalizeShopOrderAfterPayment: jest.Mock;
      addInterestTag: jest.Mock;
    };
    rewardsWorkflow?: { releaseVoucherLock: jest.Mock };
    bentoVoucher?: {
      attachPaymentIntent: jest.Mock;
      releaseByPaymentIntent: jest.Mock;
    };
    wallet?: { appendTransaction: jest.Mock };
    receiptEmail?: Record<string, jest.Mock>;
  }) {
    const config = {
      get: (key: string) => {
        if (key === 'PAYMENTS_DEMO_MODE') return 'false';
        if (key === 'XENDIT_COUNTRY') return 'MY';
        if (key === 'XENDIT_CURRENCY') return 'MYR';
        if (key === 'XENDIT_DEFAULT_CHANNEL_CODE') return 'TOUCHNGO';
        if (key === 'MEMBER_APP_PUBLIC_URL') return 'http://localhost:5193';
        if (key === 'BENTO_APP_PUBLIC_URL') return 'http://localhost:5195';
        return undefined;
      },
    } as unknown as ConfigService;

    return new PaymentsService(
      deps.prisma as never,
      config,
      deps.xendit as never,
      (deps.wallet ?? { appendTransaction: jest.fn() }) as never,
      (deps.customers ?? {
        createPendingMemberOrder: jest.fn(),
        finalizeShopOrderAfterPayment: jest.fn(),
        addInterestTag: jest.fn(),
      }) as never,
      { appendLedgerEntry: jest.fn() } as never,
      (deps.rewardsWorkflow ?? { releaseVoucherLock: jest.fn() }) as never,
      (deps.receiptEmail ?? {
        sendWalletTopUpReceipt: jest.fn(),
        sendShopOrderReceipt: jest.fn(),
        sendBentoSubscriptionReceipt: jest.fn(),
        sendBentoAdminNotification: jest.fn(),
      }) as never,
      (deps.bentoVoucher ?? {
        attachPaymentIntent: jest.fn(),
        releaseByPaymentIntent: jest.fn(),
      }) as never,
    );
  }

  it('creates a local wallet PaymentIntent before calling Xendit', async () => {
    const callOrder: string[] = [];
    const prisma = {
      paymentIntent: {
        create: jest.fn().mockImplementation(async () => {
          callOrder.push('intent.create');
          return { id: 'intent-1' };
        }),
        update: jest.fn().mockImplementation(async () => {
          callOrder.push('intent.update');
          return {};
        }),
      },
    };
    const xendit = {
      createPaymentRequest: jest.fn().mockImplementation(async () => {
        callOrder.push('xendit.create');
        return {
          payment_request_id: 'pr-1',
          status: 'REQUIRES_ACTION',
        };
      }),
      extractRedirectUrl: jest.fn().mockReturnValue('https://xendit.test/pay'),
    };

    const service = buildService({ prisma, xendit });
    await service.createWalletTopUpSession('customer-1', 2000);

    expect(callOrder.slice(0, 2)).toEqual(['intent.create', 'xendit.create']);
    expect(prisma.paymentIntent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          purpose: 'wallet_topup',
          status: 'PENDING',
          xenditPaymentRequestId: null,
          referenceId: expect.any(String),
        }),
      }),
    );
    expect(prisma.paymentIntent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          xenditPaymentRequestId: 'pr-1',
        }),
      }),
    );
  });

  it('marks wallet intent FAILED when Xendit create throws', async () => {
    const prisma = {
      paymentIntent: {
        create: jest.fn().mockResolvedValue({ id: 'intent-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const xendit = {
      createPaymentRequest: jest
        .fn()
        .mockRejectedValue(new Error('xendit unavailable')),
      extractRedirectUrl: jest.fn(),
    };

    const service = buildService({ prisma, xendit });
    await expect(
      service.createWalletTopUpSession('customer-1', 2000),
    ).rejects.toThrow('xendit unavailable');

    expect(prisma.paymentIntent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
        }),
      }),
    );
  });

  it('creates a local shop PaymentIntent before calling Xendit', async () => {
    const callOrder: string[] = [];
    const customers = {
      createPendingMemberOrder: jest.fn().mockResolvedValue({
        id: 'order-1',
        orderNumber: 42,
        totalCents: 1500,
      }),
      finalizeShopOrderAfterPayment: jest.fn(),
      addInterestTag: jest.fn(),
    };
    const prisma = {
      paymentIntent: {
        create: jest.fn().mockImplementation(async () => {
          callOrder.push('intent.create');
          return { id: 'intent-shop' };
        }),
        update: jest.fn().mockImplementation(async () => {
          callOrder.push('intent.update');
          return {};
        }),
      },
    };
    const xendit = {
      createPaymentRequest: jest.fn().mockImplementation(async () => {
        callOrder.push('xendit.create');
        return {
          payment_request_id: 'pr-shop',
          status: 'REQUIRES_ACTION',
        };
      }),
      extractRedirectUrl: jest.fn().mockReturnValue('https://xendit.test/shop'),
    };

    const service = buildService({ prisma, xendit, customers });
    await service.createShopOrderCheckout(
      'customer-1',
      {
        lines: [
          {
            productId: 'p1',
            productName: 'Cake',
            variantLabel: null,
            unitPriceCents: 1500,
            qty: 1,
          },
        ],
        totalCents: 1500,
        discountCents: 0,
        fulfillmentSummary: ['Pickup'],
      } as never,
      'TOUCHNGO',
    );

    expect(callOrder.slice(0, 2)).toEqual(['intent.create', 'xendit.create']);
    expect(prisma.paymentIntent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          purpose: 'shop_order',
          xenditPaymentRequestId: null,
          metadata: expect.objectContaining({ orderId: 'order-1' }),
        }),
      }),
    );
  });

  it('creates and links a bento PaymentIntent before calling Xendit', async () => {
    const callOrder: string[] = [];
    const prisma = {
      bentoSubscription: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'sub-1',
            status: 'PENDING_PAYMENT',
            package: { label: '5-Day Lunch' },
          },
        ]),
        updateMany: jest.fn().mockImplementation(async () => {
          callOrder.push('subscription.link');
          return { count: 1 };
        }),
      },
      paymentIntent: {
        create: jest.fn().mockImplementation(async () => {
          callOrder.push('intent.create');
          return { id: 'intent-bento' };
        }),
        update: jest.fn().mockImplementation(async () => {
          callOrder.push('intent.update');
          return {};
        }),
      },
    };
    const xendit = {
      createPaymentRequest: jest.fn().mockImplementation(async () => {
        callOrder.push('xendit.create');
        return {
          payment_request_id: 'pr-bento',
          status: 'REQUIRES_ACTION',
        };
      }),
      extractRedirectUrl: jest.fn().mockReturnValue('https://xendit.test/bento'),
    };

    const service = buildService({ prisma, xendit });
    await service.createBentoSubscriptionCheckout(
      'customer-1',
      ['sub-1'],
      9900,
      'TOUCHNGO',
    );

    expect(callOrder.slice(0, 3)).toEqual([
      'intent.create',
      'subscription.link',
      'xendit.create',
    ]);
    expect(prisma.paymentIntent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          purpose: 'bento_subscription',
          xenditPaymentRequestId: null,
        }),
      }),
    );
  });
});
