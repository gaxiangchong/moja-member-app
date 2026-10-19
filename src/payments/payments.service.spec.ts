import { UnauthorizedException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

const WEBHOOK_TOKEN = 'test-webhook-token';

type IntentState = {
  id: string;
  customerId: string;
  referenceId: string;
  purpose: string;
  status: string;
  amountCents: number;
  currency: string;
  country: string;
  channelCode: string;
  xenditPaymentRequestId: string;
  metadata: Record<string, unknown>;
  updatedAt: Date;
};

function makeIntent(overrides: Partial<IntentState> = {}): IntentState {
  return {
    id: 'intent-1',
    customerId: 'cust-1',
    referenceId: 'ref-1',
    purpose: 'wallet_topup',
    status: 'PENDING',
    amountCents: 1000,
    currency: 'MYR',
    country: 'MY',
    channelCode: 'TOUCHNGO',
    xenditPaymentRequestId: 'pr-1',
    metadata: {},
    updatedAt: new Date('2026-09-05T00:00:00.000Z'),
    ...overrides,
  };
}

function makeService(intent: IntentState) {
  const prisma = {
    paymentIntent: {
      findUnique: jest.fn(
        async ({
          where,
        }: {
          where: { id?: string; referenceId?: string };
        }) => {
          if (where.id && where.id !== intent.id) return null;
          if (where.referenceId && where.referenceId !== intent.referenceId) {
            return null;
          }
          return { ...intent };
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: {
            id?: string;
            referenceId?: string;
            status?: string | { in?: string[]; not?: string };
          };
          data: Partial<IntentState>;
        }) => {
          if (where.referenceId && where.referenceId !== intent.referenceId) {
            return { count: 0 };
          }
          if (where.id && where.id !== intent.id) return { count: 0 };
          const statusFilter = where.status;
          if (typeof statusFilter === 'string') {
            if (intent.status !== statusFilter) return { count: 0 };
          } else if (statusFilter?.in) {
            if (!statusFilter.in.includes(intent.status)) return { count: 0 };
          } else if (statusFilter?.not && intent.status === statusFilter.not) {
            return { count: 0 };
          }
          Object.assign(intent, data);
          return { count: 1 };
        },
      ),
      update: jest.fn(async ({ data }: { data: Partial<IntentState> }) => {
        Object.assign(intent, data);
        return { ...intent };
      }),
    },
    bentoSubscription: {
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    customerOrder: {
      findUnique: jest.fn(async () => ({ orderNumber: 42 })),
    },
    customerVoucher: {
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
  };
  const config = {
    get: jest.fn((key: string) =>
      key === 'XENDIT_WEBHOOK_TOKEN' ? WEBHOOK_TOKEN : undefined,
    ),
  };
  const wallet = { appendTransaction: jest.fn(async () => ({})) };
  const customers = {
    finalizeShopOrderAfterPayment: jest.fn(async () => undefined),
    addInterestTag: jest.fn(async () => undefined),
  };
  const loyalty = { appendLedgerEntry: jest.fn(async () => undefined) };
  const rewardsWorkflow = {
    releaseVoucherLock: jest.fn(async () => undefined),
    finalizeVoucherRedemption: jest.fn(async () => null),
  };
  const receiptEmail = {
    sendWalletTopUpReceipt: jest.fn(),
    sendShopOrderReceipt: jest.fn(),
    sendBentoSubscriptionReceipt: jest.fn(),
    sendBentoAdminNotification: jest.fn(),
  };
  const bentoVoucher = {
    confirmByPaymentIntent: jest.fn(async () => undefined),
    releaseByPaymentIntent: jest.fn(async () => undefined),
  };
  const xendit = {
    getPaymentRequest: jest.fn(),
  };
  const service = new PaymentsService(
    prisma as never,
    config as never,
    xendit as never,
    wallet as never,
    customers as never,
    loyalty as never,
    rewardsWorkflow as never,
    receiptEmail as never,
    bentoVoucher as never,
  );
  return {
    service,
    prisma,
    wallet,
    customers,
    xendit,
    bentoVoucher,
  };
}

function successPayload(purposeExtra: Record<string, unknown> = {}) {
  return {
    event: 'payment.capture',
    data: {
      reference_id: 'ref-1',
      status: 'SUCCEEDED',
      payment_id: 'pay-1',
      ...purposeExtra,
    },
  };
}

function failurePayload() {
  return {
    event: 'payment.failure',
    data: {
      reference_id: 'ref-1',
      status: 'FAILED',
      failure_code: 'USER_ABANDONED',
    },
  };
}

describe('PaymentsService.handleXenditWebhook failure-then-success', () => {
  it('rejects a missing webhook token', async () => {
    const { service } = makeService(makeIntent());
    await expect(
      service.handleXenditWebhook(undefined, successPayload()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('credits a wallet top-up after payment.failure then payment.capture', async () => {
    const intent = makeIntent({ purpose: 'wallet_topup' });
    const { service, wallet } = makeService(intent);

    await service.handleXenditWebhook(WEBHOOK_TOKEN, failurePayload());
    expect(intent.status).toBe('FAILED');
    expect(wallet.appendTransaction).not.toHaveBeenCalled();

    await service.handleXenditWebhook(WEBHOOK_TOKEN, successPayload());
    expect(wallet.appendTransaction).toHaveBeenCalledTimes(1);
    expect(wallet.appendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust-1',
        amountCents: 1000,
        reason: 'xendit_wallet_topup',
      }),
    );
    expect(intent.status).toBe('SUCCEEDED');
  });

  it('finalizes a shop order after payment.failure then payment.capture', async () => {
    const intent = makeIntent({
      purpose: 'shop_order',
      metadata: { orderId: 'order-1' },
    });
    const { service, customers } = makeService(intent);

    await service.handleXenditWebhook(WEBHOOK_TOKEN, failurePayload());
    expect(intent.status).toBe('FAILED');
    expect(customers.finalizeShopOrderAfterPayment).not.toHaveBeenCalled();

    await service.handleXenditWebhook(WEBHOOK_TOKEN, successPayload());
    expect(customers.finalizeShopOrderAfterPayment).toHaveBeenCalledWith(
      'order-1',
    );
    expect(intent.status).toBe('SUCCEEDED');
  });

  it('activates a bento subscription after payment.failure then payment.capture', async () => {
    const intent = makeIntent({
      purpose: 'bento_subscription',
      metadata: { subscriptionId: 'sub-1' },
    });
    const { service, prisma, bentoVoucher } = makeService(intent);

    await service.handleXenditWebhook(WEBHOOK_TOKEN, failurePayload());
    expect(intent.status).toBe('FAILED');
    expect(bentoVoucher.releaseByPaymentIntent).toHaveBeenCalledWith(
      'intent-1',
    );
    expect(prisma.bentoSubscription.updateMany).not.toHaveBeenCalled();

    await service.handleXenditWebhook(WEBHOOK_TOKEN, successPayload());
    expect(prisma.bentoSubscription.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['sub-1'] }, status: 'PENDING_PAYMENT' },
      data: { status: 'ACTIVE' },
    });
    expect(intent.status).toBe('SUCCEEDED');
  });

  it('does not double-credit a wallet that already succeeded', async () => {
    const intent = makeIntent({ purpose: 'wallet_topup', status: 'SUCCEEDED' });
    const { service, wallet } = makeService(intent);

    await service.handleXenditWebhook(WEBHOOK_TOKEN, successPayload());
    expect(wallet.appendTransaction).not.toHaveBeenCalled();
    expect(intent.status).toBe('SUCCEEDED');
  });
});

describe('PaymentsService.getMyPaymentIntentStatus', () => {
  it('recovers a FAILED wallet top-up when Xendit later reports SUCCEEDED', async () => {
    const intent = makeIntent({ purpose: 'wallet_topup', status: 'FAILED' });
    const { service, wallet, xendit } = makeService(intent);
    xendit.getPaymentRequest.mockResolvedValue({
      status: 'SUCCEEDED',
      payment_id: 'pay-1',
    });

    const result = await service.getMyPaymentIntentStatus('cust-1', 'ref-1');
    expect(wallet.appendTransaction).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('SUCCEEDED');
  });

  it('leaves a FAILED intent failed when Xendit still reports FAILED', async () => {
    const intent = makeIntent({ purpose: 'wallet_topup', status: 'FAILED' });
    const { service, wallet, xendit } = makeService(intent);
    xendit.getPaymentRequest.mockResolvedValue({ status: 'FAILED' });

    const result = await service.getMyPaymentIntentStatus('cust-1', 'ref-1');
    expect(wallet.appendTransaction).not.toHaveBeenCalled();
    expect(result.status).toBe('FAILED');
  });
});

describe('PaymentsService.reconcileBentoSubscriptionPayment', () => {
  it('activates a bento sub whose intent was marked FAILED', async () => {
    const intent = makeIntent({
      purpose: 'bento_subscription',
      status: 'FAILED',
      metadata: { subscriptionIds: ['sub-1'] },
    });
    const { service, prisma, xendit } = makeService(intent);
    prisma.bentoSubscription.findUnique = jest.fn(async () => ({
      paymentIntentId: 'intent-1',
    }));
    xendit.getPaymentRequest.mockResolvedValue({ status: 'SUCCEEDED' });

    await service.reconcileBentoSubscriptionPayment('sub-1');
    expect(prisma.bentoSubscription.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['sub-1'] }, status: 'PENDING_PAYMENT' },
      data: { status: 'ACTIVE' },
    });
    expect(intent.status).toBe('SUCCEEDED');
  });
});
