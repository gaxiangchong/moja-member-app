import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';

describe('PaymentsService shop checkout idempotency', () => {
  function buildService(deps: {
    prisma: Record<string, unknown>;
    xendit?: {
      createPaymentRequest: jest.Mock;
      extractRedirectUrl: jest.Mock;
    };
    customers?: {
      createPendingMemberOrder: jest.Mock;
      finalizeShopOrderAfterPayment: jest.Mock;
      addInterestTag: jest.Mock;
    };
    rewardsWorkflow?: {
      validateAndLockVoucher: jest.Mock;
      computeLockedVoucherDiscount: jest.Mock;
      releaseVoucherLock: jest.Mock;
      finalizeVoucherRedemption: jest.Mock;
    };
  }) {
    const config = {
      get: (key: string) => {
        if (key === 'XENDIT_SHOP_CHANNEL_CODES') return 'TOUCHNGO,FPX';
        if (key === 'XENDIT_INTEGRATION_MODE') return 'payments';
        if (key === 'PAYMENTS_DEMO_MODE') return 'false';
        return undefined;
      },
    } as unknown as ConfigService;
    return new PaymentsService(
      deps.prisma as never,
      config,
      (deps.xendit ?? {
        createPaymentRequest: jest.fn(),
        extractRedirectUrl: jest.fn().mockReturnValue('https://pay.example/r'),
      }) as never,
      { appendTransaction: jest.fn() } as never,
      (deps.customers ?? {
        createPendingMemberOrder: jest.fn(),
        finalizeShopOrderAfterPayment: jest.fn(),
        addInterestTag: jest.fn(),
      }) as never,
      { appendLedgerEntry: jest.fn() } as never,
      (deps.rewardsWorkflow ?? {
        validateAndLockVoucher: jest.fn(),
        computeLockedVoucherDiscount: jest.fn(),
        releaseVoucherLock: jest.fn(),
        finalizeVoucherRedemption: jest.fn(),
      }) as never,
      {
        sendWalletTopUpReceipt: jest.fn(),
        sendShopOrderReceipt: jest.fn(),
        sendBentoSubscriptionReceipt: jest.fn(),
        sendBentoAdminNotification: jest.fn(),
      } as never,
      { confirmByPaymentIntent: jest.fn() } as never,
    );
  }

  const orderDto = {
    totalCents: 2500,
    discountCents: 0,
    fulfillmentSummary: ['Pickup'],
    lines: [
      {
        productId: 'p1',
        name: 'Cake',
        imageUrl: null,
        unitPriceCents: 2500,
        qty: 1,
        variantLabel: null,
      },
    ],
  };

  it('returns the existing checkout when idempotencyKey already has a PaymentIntent', async () => {
    const prisma = {
      paymentIntent: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'pi-1',
          customerId: 'c1',
          purpose: 'shop_order',
          referenceId: 'ref-existing',
          status: 'PENDING',
          channelCode: 'TOUCHNGO',
          country: 'MY',
          currency: 'MYR',
          amountCents: 2500,
          xenditPaymentRequestId: 'pr-1',
          metadata: {
            orderId: 'ord-1',
            redirectUrl: 'https://pay.example/existing',
            subtotalCents: 2500,
            discountCents: 0,
            voucherId: null,
            voucherLockToken: null,
          },
        }),
        create: jest.fn(),
      },
      customerOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ord-1',
          orderNumber: 42,
        }),
      },
    };
    const xendit = {
      createPaymentRequest: jest.fn(),
      extractRedirectUrl: jest.fn(),
    };
    const customers = {
      createPendingMemberOrder: jest.fn(),
      finalizeShopOrderAfterPayment: jest.fn(),
      addInterestTag: jest.fn(),
    };

    const service = buildService({ prisma, xendit, customers });
    const result = await service.createShopOrderCheckout(
      'c1',
      orderDto as never,
      'TOUCHNGO',
      undefined,
      undefined,
      undefined,
      'idem-key-1',
    );

    expect(result).toMatchObject({
      orderId: 'ord-1',
      orderNumber: 42,
      referenceId: 'ref-existing',
      redirectUrl: 'https://pay.example/existing',
      idempotentReplay: true,
    });
    expect(prisma.paymentIntent.create).not.toHaveBeenCalled();
    expect(xendit.createPaymentRequest).not.toHaveBeenCalled();
    expect(customers.createPendingMemberOrder).not.toHaveBeenCalled();
  });

  it('claims PaymentIntent.idempotencyKey before calling Xendit', async () => {
    const createCalls: string[] = [];
    const prisma = {
      paymentIntent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }) => {
          createCalls.push('intent');
          return {
            id: 'pi-new',
            ...data,
          };
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      customerOrder: {
        findFirst: jest.fn(),
      },
    };
    const xendit = {
      createPaymentRequest: jest.fn().mockImplementation(async () => {
        createCalls.push('xendit');
        return {
          payment_request_id: 'pr-new',
          status: 'PENDING',
        };
      }),
      extractRedirectUrl: jest.fn().mockReturnValue('https://pay.example/new'),
    };
    const customers = {
      createPendingMemberOrder: jest.fn().mockImplementation(async () => {
        createCalls.push('order');
        return {
          id: 'ord-new',
          orderNumber: 99,
          totalCents: 2500,
          placedAt: new Date(),
          status: 'pending_payment',
        };
      }),
      finalizeShopOrderAfterPayment: jest.fn(),
      addInterestTag: jest.fn(),
    };

    const service = buildService({ prisma, xendit, customers });
    const result = await service.createShopOrderCheckout(
      'c1',
      orderDto as never,
      'TOUCHNGO',
      undefined,
      undefined,
      undefined,
      'idem-key-2',
    );

    expect(createCalls).toEqual(['intent', 'order', 'xendit']);
    expect(prisma.paymentIntent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: 'idem-key-2',
          purpose: 'shop_order',
          amountCents: 2500,
        }),
      }),
    );
    expect(result.redirectUrl).toBe('https://pay.example/new');
    expect(prisma.paymentIntent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          xenditPaymentRequestId: 'pr-new',
          metadata: expect.objectContaining({
            orderId: 'ord-new',
            redirectUrl: 'https://pay.example/new',
          }),
        }),
      }),
    );
  });

  it('does not call Xendit again when a concurrent create hits unique idempotencyKey', async () => {
    const prisma = {
      paymentIntent: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'pi-winner',
            customerId: 'c1',
            purpose: 'shop_order',
            referenceId: 'ref-winner',
            status: 'PENDING',
            channelCode: 'TOUCHNGO',
            country: 'MY',
            currency: 'MYR',
            amountCents: 2500,
            xenditPaymentRequestId: 'pr-winner',
            metadata: {
              orderId: 'ord-winner',
              redirectUrl: 'https://pay.example/winner',
              subtotalCents: 2500,
              discountCents: 0,
            },
          }),
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
        update: jest.fn(),
      },
      customerOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ord-winner',
          orderNumber: 7,
        }),
      },
    };
    const xendit = {
      createPaymentRequest: jest.fn(),
      extractRedirectUrl: jest.fn(),
    };
    const customers = {
      createPendingMemberOrder: jest.fn(),
      finalizeShopOrderAfterPayment: jest.fn(),
      addInterestTag: jest.fn(),
    };

    const service = buildService({ prisma, xendit, customers });
    const result = await service.createShopOrderCheckout(
      'c1',
      orderDto as never,
      'TOUCHNGO',
      undefined,
      undefined,
      undefined,
      'idem-key-race',
    );

    expect(result).toMatchObject({
      orderId: 'ord-winner',
      referenceId: 'ref-winner',
      redirectUrl: 'https://pay.example/winner',
      idempotentReplay: true,
    });
    expect(xendit.createPaymentRequest).not.toHaveBeenCalled();
    expect(customers.createPendingMemberOrder).not.toHaveBeenCalled();
  });

  it('rejects idempotencyKey reuse across customers', async () => {
    const prisma = {
      paymentIntent: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'pi-other',
          customerId: 'other-customer',
          purpose: 'shop_order',
          status: 'PENDING',
          metadata: { orderId: 'ord-x' },
        }),
      },
    };
    const service = buildService({ prisma });
    await expect(
      service.createShopOrderCheckout(
        'c1',
        orderDto as never,
        'TOUCHNGO',
        undefined,
        undefined,
        undefined,
        'stolen-key',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
