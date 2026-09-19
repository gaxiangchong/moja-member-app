import { BentoSubscriptionStatus } from '@prisma/client';
import { PaymentsService } from './payments.service';

describe('PaymentsService bento payment finalization', () => {
  const buildService = (overrides: Record<string, unknown> = {}) => {
    const intent = {
      id: 'intent-1',
      customerId: 'customer-1',
      referenceId: 'ref-1',
      purpose: 'bento_subscription',
      status: 'PENDING',
      metadata: { subscriptionIds: ['sub-1', 'sub-2'] },
    };
    const tx = {
      bentoSubscription: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'sub-1',
            paymentIntentId: intent.id,
            status: BentoSubscriptionStatus.ACTIVE,
          },
          {
            id: 'sub-2',
            paymentIntentId: intent.id,
            status: BentoSubscriptionStatus.ACTIVE,
          },
        ]),
      },
      paymentIntent: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      paymentIntent: {
        findUnique: jest.fn().mockResolvedValue(intent),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(async (cb: (txArg: typeof tx) => unknown) =>
        cb(tx),
      ),
      ...overrides,
    };
    const config = {
      get: jest.fn((key: string) =>
        key === 'XENDIT_WEBHOOK_TOKEN' ? 'token-1' : undefined,
      ),
    };
    const service = new PaymentsService(
      prisma as never,
      config as never,
      {} as never,
      {} as never,
      { addInterestTag: jest.fn() } as never,
      {} as never,
      {} as never,
      {
        sendBentoSubscriptionReceipt: jest.fn(),
        sendBentoAdminNotification: jest.fn(),
      } as never,
      { confirmByPaymentIntent: jest.fn() } as never,
    );

    return { intent, prisma, service, tx };
  };

  it('activates cancelled subscriptions that belong to the successful intent', async () => {
    const { intent, service, tx } = buildService();

    await service.handleXenditWebhook('token-1', {
      event: 'payment.capture',
      data: { reference_id: intent.referenceId, status: 'SUCCEEDED' },
    });

    expect(tx.bentoSubscription.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['sub-1', 'sub-2'] },
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
    expect(tx.paymentIntent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: intent.id },
        data: expect.objectContaining({ status: 'SUCCEEDED' }),
      }),
    );
  });

  it('does not mark the payment succeeded if any linked subscription is missing', async () => {
    const { intent, prisma, service, tx } = buildService();
    tx.bentoSubscription.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        paymentIntentId: intent.id,
        status: BentoSubscriptionStatus.ACTIVE,
      },
    ]);

    await expect(
      service.handleXenditWebhook('token-1', {
        event: 'payment.capture',
        data: { reference_id: intent.referenceId, status: 'SUCCEEDED' },
      }),
    ).rejects.toThrow('did not activate all linked subscriptions');

    expect(tx.paymentIntent.update).not.toHaveBeenCalled();
    expect(prisma.paymentIntent.update).toHaveBeenCalledWith({
      where: { id: intent.id },
      data: { status: 'PENDING' },
    });
  });
});
