import { BentoSubscriptionStatus } from '@prisma/client';
import { PaymentsService } from './payments.service';

describe('PaymentsService.reconcileBentoSubscriptionPayment', () => {
  function makeService() {
    const prisma = {
      bentoSubscription: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      paymentIntent: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
    };
    const xendit = {
      getPaymentRequest: jest.fn(),
    };
    const customers = {
      addInterestTag: jest.fn(),
    };
    const receiptEmail = {
      sendBentoSubscriptionReceipt: jest.fn(),
      sendBentoAdminNotification: jest.fn(),
    };
    const bentoVoucher = {
      confirmByPaymentIntent: jest.fn(),
    };
    const service = new PaymentsService(
      prisma as never,
      { get: jest.fn() } as never,
      xendit as never,
      {} as never,
      customers as never,
      {} as never,
      {} as never,
      receiptEmail as never,
      bentoVoucher as never,
    );

    return {
      service,
      prisma,
      xendit,
    };
  }

  function pendingBentoIntent() {
    return {
      id: 'intent-1',
      customerId: 'customer-1',
      referenceId: 'ref-1',
      purpose: 'bento_subscription',
      status: 'PENDING',
      xenditPaymentRequestId: 'pr-1',
      metadata: { subscriptionIds: ['sub-1'] },
    };
  }

  it('activates a cancelled subscription when its payment request later succeeds', async () => {
    const { service, prisma, xendit } = makeService();
    const intent = pendingBentoIntent();
    const xenditResponse = { status: 'SUCCEEDED' };
    prisma.bentoSubscription.findUnique.mockResolvedValue({
      paymentIntentId: intent.id,
    });
    prisma.paymentIntent.findUnique.mockResolvedValue(intent);
    prisma.paymentIntent.updateMany.mockResolvedValue({ count: 1 });
    prisma.bentoSubscription.findMany.mockResolvedValue([
      { id: 'sub-1', status: BentoSubscriptionStatus.CANCELLED },
    ]);
    prisma.bentoSubscription.updateMany.mockResolvedValue({ count: 1 });
    prisma.paymentIntent.update.mockResolvedValue({
      ...intent,
      status: 'SUCCEEDED',
    });
    xendit.getPaymentRequest.mockResolvedValue(xenditResponse);

    await service.reconcileBentoSubscriptionPayment('sub-1');

    expect(prisma.bentoSubscription.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['sub-1'] },
        paymentIntentId: intent.id,
        status: {
          in: [
            BentoSubscriptionStatus.PENDING_PAYMENT,
            BentoSubscriptionStatus.CANCELLED,
          ],
        },
      },
      data: { status: BentoSubscriptionStatus.ACTIVE },
    });
    expect(prisma.paymentIntent.update).toHaveBeenCalledWith({
      where: { id: intent.id },
      data: {
        status: 'SUCCEEDED',
        metadata: { subscriptionIds: ['sub-1'], xendit: xenditResponse },
      },
    });
  });

  it('does not mark a payment succeeded when no referenced subscription can be finalized', async () => {
    const { service, prisma, xendit } = makeService();
    const intent = pendingBentoIntent();
    prisma.bentoSubscription.findUnique.mockResolvedValue({
      paymentIntentId: intent.id,
    });
    prisma.paymentIntent.findUnique.mockResolvedValue(intent);
    prisma.paymentIntent.updateMany.mockResolvedValue({ count: 1 });
    prisma.bentoSubscription.findMany.mockResolvedValue([]);
    xendit.getPaymentRequest.mockResolvedValue({ status: 'SUCCEEDED' });

    await service.reconcileBentoSubscriptionPayment('sub-1');

    expect(prisma.bentoSubscription.updateMany).not.toHaveBeenCalled();
    expect(prisma.paymentIntent.update).toHaveBeenCalledWith({
      where: { id: intent.id },
      data: { status: 'PENDING' },
    });
    expect(
      prisma.paymentIntent.update.mock.calls.some(
        ([call]) => call.data?.status === 'SUCCEEDED',
      ),
    ).toBe(false);
  });
});
