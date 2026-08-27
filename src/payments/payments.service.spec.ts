import { ConfigService } from '@nestjs/config';
import { WalletTxnType } from '@prisma/client';
import { PaymentsService } from './payments.service';

describe('PaymentsService payment finalize lease + idempotency', () => {
  const webhookToken = 'test-webhook-token';

  function buildService(deps: {
    prisma: Record<string, unknown>;
    wallet?: { appendTransaction: jest.Mock };
    loyalty?: { appendLedgerEntry: jest.Mock };
    customers?: {
      finalizeShopOrderAfterPayment: jest.Mock;
      addInterestTag: jest.Mock;
    };
    rewardsWorkflow?: { finalizeVoucherRedemption: jest.Mock };
    receiptEmail?: {
      sendWalletTopUpReceipt: jest.Mock;
      sendShopOrderReceipt: jest.Mock;
      sendBentoSubscriptionReceipt: jest.Mock;
      sendBentoAdminNotification: jest.Mock;
    };
    bentoVoucher?: { confirmByPaymentIntent: jest.Mock };
  }) {
    const config = {
      get: (key: string) =>
        key === 'XENDIT_WEBHOOK_TOKEN' ? webhookToken : undefined,
    } as unknown as ConfigService;
    return new PaymentsService(
      deps.prisma as never,
      config,
      {} as never,
      (deps.wallet ?? { appendTransaction: jest.fn() }) as never,
      (deps.customers ?? {
        finalizeShopOrderAfterPayment: jest.fn(),
        addInterestTag: jest.fn(),
      }) as never,
      (deps.loyalty ?? { appendLedgerEntry: jest.fn() }) as never,
      (deps.rewardsWorkflow ?? {
        finalizeVoucherRedemption: jest.fn(),
      }) as never,
      (deps.receiptEmail ?? {
        sendWalletTopUpReceipt: jest.fn(),
        sendShopOrderReceipt: jest.fn(),
        sendBentoSubscriptionReceipt: jest.fn(),
        sendBentoAdminNotification: jest.fn(),
      }) as never,
      (deps.bentoVoucher ?? {
        confirmByPaymentIntent: jest.fn(),
      }) as never,
    );
  }

  it('does not double-credit wallet when SUCCEEDED update fails then webhook retries', async () => {
    const intentId = 'intent-wallet-1';
    const referenceId = 'ref-wallet-1';
    const customerId = 'customer-1';
    let status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' = 'PENDING';
    let creditedOnce = false;

    const wallet = {
      appendTransaction: jest.fn().mockResolvedValue({ id: 'txn-1' }),
    };
    const prisma = {
      paymentIntent: {
        findUnique: jest.fn().mockImplementation(async () => ({
          id: intentId,
          referenceId,
          customerId,
          purpose: 'wallet_topup',
          amountCents: 5000,
          status,
          xenditPaymentRequestId: 'pr-1',
          metadata: {},
          updatedAt: new Date(),
        })),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest
          .fn()
          .mockImplementation(
            async ({ where }: { where: { status?: string } }) => {
              if (where.status === 'PENDING' && status === 'PENDING') {
                status = 'PROCESSING';
                return { count: 1 };
              }
              return { count: 0 };
            },
          ),
        update: jest
          .fn()
          .mockImplementation(async ({ data }: { data: { status: string } }) => {
            if (data.status === 'SUCCEEDED') {
              if (!creditedOnce) {
                creditedOnce = true;
                status = 'PENDING';
                throw new Error('db blip marking succeeded');
              }
              status = 'SUCCEEDED';
              return {};
            }
            status = data.status as typeof status;
            return {};
          }),
      },
      storedWalletLedgerEntry: {
        findFirst: jest
          .fn()
          .mockImplementation(async () =>
            creditedOnce ? { id: 'ledger-1' } : null,
          ),
      },
    };

    const service = buildService({ prisma, wallet });
    const body = {
      event: 'payment.capture',
      data: {
        reference_id: referenceId,
        status: 'SUCCEEDED',
        payment_id: 'pay-1',
      },
    };

    await expect(
      service.handleXenditWebhook(webhookToken, body),
    ).rejects.toThrow('db blip marking succeeded');
    expect(wallet.appendTransaction).toHaveBeenCalledTimes(1);

    await service.handleXenditWebhook(webhookToken, body);
    expect(wallet.appendTransaction).toHaveBeenCalledTimes(1);
    expect(status).toBe('SUCCEEDED');
  });

  it('reclaims stale PROCESSING wallet intent without double-crediting', async () => {
    const intentId = 'intent-wallet-stale';
    const referenceId = 'ref-wallet-stale';
    const customerId = 'customer-stale';
    let status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' = 'PROCESSING';
    let updatedAt = new Date(Date.now() - 5 * 60 * 1000);
    let creditedOnce = true; // crash after credit left PROCESSING

    const wallet = {
      appendTransaction: jest.fn().mockResolvedValue({ id: 'txn-2' }),
    };
    const prisma = {
      paymentIntent: {
        findUnique: jest.fn().mockImplementation(async () => ({
          id: intentId,
          referenceId,
          customerId,
          purpose: 'wallet_topup',
          amountCents: 3000,
          status,
          xenditPaymentRequestId: 'pr-stale',
          metadata: {},
          updatedAt,
        })),
        findFirst: jest.fn().mockImplementation(async ({ where }) => {
          if (
            where?.status === 'PROCESSING' &&
            status === 'PROCESSING' &&
            updatedAt < where.updatedAt.lt
          ) {
            return { id: intentId, metadata: {} };
          }
          return null;
        }),
        updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
          if (where.status === 'PENDING') return { count: 0 };
          if (
            where.status === 'PROCESSING' &&
            status === 'PROCESSING' &&
            updatedAt < where.updatedAt.lt
          ) {
            updatedAt = new Date();
            if (data.metadata) {
              return { count: 1 };
            }
          }
          return { count: 0 };
        }),
        update: jest
          .fn()
          .mockImplementation(async ({ data }: { data: { status: string } }) => {
            status = data.status as typeof status;
            updatedAt = new Date();
            return {};
          }),
      },
      storedWalletLedgerEntry: {
        findFirst: jest
          .fn()
          .mockImplementation(async () =>
            creditedOnce ? { id: 'ledger-stale' } : null,
          ),
      },
    };

    const service = buildService({ prisma, wallet });
    await service.handleXenditWebhook(webhookToken, {
      event: 'payment.capture',
      data: {
        reference_id: referenceId,
        status: 'SUCCEEDED',
        payment_id: 'pay-stale',
      },
    });

    expect(wallet.appendTransaction).not.toHaveBeenCalled();
    expect(status).toBe('SUCCEEDED');
  });

  it('does not reclaim a fresh PROCESSING lease', async () => {
    const intentId = 'intent-wallet-fresh';
    const referenceId = 'ref-wallet-fresh';
    const status = 'PROCESSING';
    const updatedAt = new Date(); // just locked

    const wallet = {
      appendTransaction: jest.fn().mockResolvedValue({ id: 'txn-3' }),
    };
    const prisma = {
      paymentIntent: {
        findUnique: jest.fn().mockResolvedValue({
          id: intentId,
          referenceId,
          customerId: 'customer-fresh',
          purpose: 'wallet_topup',
          amountCents: 1000,
          status,
          xenditPaymentRequestId: 'pr-fresh',
          metadata: {},
          updatedAt,
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn(),
      },
      storedWalletLedgerEntry: {
        findFirst: jest.fn(),
      },
    };

    const service = buildService({ prisma, wallet });
    await service.handleXenditWebhook(webhookToken, {
      event: 'payment.capture',
      data: {
        reference_id: referenceId,
        status: 'SUCCEEDED',
      },
    });

    expect(wallet.appendTransaction).not.toHaveBeenCalled();
    expect(prisma.paymentIntent.update).not.toHaveBeenCalled();
  });

  it('does not double-deduct checkout reward points on shop finalize retry', async () => {
    const intentId = 'intent-shop-1';
    const referenceId = 'ref-shop-1';
    const customerId = 'customer-2';
    const orderId = 'order-1';
    const rewardDefinitionId = 'reward-1';
    let status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' = 'PENDING';
    let redeemedOnce = false;

    const loyalty = {
      appendLedgerEntry: jest.fn().mockResolvedValue({ balanceAfter: 10 }),
    };
    const customers = {
      finalizeShopOrderAfterPayment: jest.fn().mockResolvedValue(undefined),
      addInterestTag: jest.fn(),
    };
    const prisma = {
      paymentIntent: {
        findUnique: jest.fn().mockImplementation(async () => ({
          id: intentId,
          referenceId,
          customerId,
          purpose: 'shop_order',
          amountCents: 2000,
          status,
          metadata: {
            orderId,
            rewardDefinitionId,
            rewardPointsCost: 50,
            voucherLockToken: null,
            customerVoucherId: null,
          },
          updatedAt: new Date(),
        })),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest
          .fn()
          .mockImplementation(
            async ({ where }: { where: { status?: string } }) => {
              if (where.status === 'PENDING' && status === 'PENDING') {
                status = 'PROCESSING';
                return { count: 1 };
              }
              return { count: 0 };
            },
          ),
        update: jest
          .fn()
          .mockImplementation(async ({ data }: { data: { status: string } }) => {
            if (data.status === 'SUCCEEDED') {
              if (!redeemedOnce) {
                redeemedOnce = true;
                status = 'PENDING';
                throw new Error('db blip marking shop succeeded');
              }
              status = 'SUCCEEDED';
              return {};
            }
            status = data.status as typeof status;
            return {};
          }),
      },
      loyaltyLedgerEntry: {
        findFirst: jest
          .fn()
          .mockImplementation(async () =>
            redeemedOnce ? { id: 'loyalty-1' } : null,
          ),
      },
      customerVoucher: { updateMany: jest.fn() },
    };

    const service = buildService({ prisma, loyalty, customers });
    const body = {
      event: 'payment.capture',
      data: {
        reference_id: referenceId,
        status: 'SUCCEEDED',
      },
    };

    await expect(
      service.handleXenditWebhook(webhookToken, body),
    ).rejects.toThrow('db blip marking shop succeeded');
    expect(loyalty.appendLedgerEntry).toHaveBeenCalledTimes(1);

    await service.handleXenditWebhook(webhookToken, body);
    expect(loyalty.appendLedgerEntry).toHaveBeenCalledTimes(1);
    expect(status).toBe('SUCCEEDED');
  });

  it('reclaims stale PROCESSING bento intent and activates subscription', async () => {
    const intentId = 'intent-bento-stale';
    const referenceId = 'ref-bento-stale';
    const subscriptionId = 'sub-1';
    let status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' = 'PROCESSING';
    let updatedAt = new Date(Date.now() - 10 * 60 * 1000);

    const bentoVoucher = { confirmByPaymentIntent: jest.fn() };
    const customers = {
      finalizeShopOrderAfterPayment: jest.fn(),
      addInterestTag: jest.fn(),
    };
    const prisma = {
      paymentIntent: {
        findUnique: jest.fn().mockImplementation(async () => ({
          id: intentId,
          referenceId,
          customerId: 'customer-bento',
          purpose: 'bento_subscription',
          amountCents: 9900,
          status,
          metadata: { subscriptionIds: [subscriptionId] },
          updatedAt,
        })),
        findFirst: jest.fn().mockImplementation(async ({ where }) => {
          if (
            where?.status === 'PROCESSING' &&
            status === 'PROCESSING' &&
            updatedAt < where.updatedAt.lt
          ) {
            return {
              id: intentId,
              metadata: { subscriptionIds: [subscriptionId] },
            };
          }
          return null;
        }),
        updateMany: jest.fn().mockImplementation(async ({ where }) => {
          if (where.status === 'PENDING') return { count: 0 };
          if (
            where.status === 'PROCESSING' &&
            status === 'PROCESSING' &&
            updatedAt < where.updatedAt.lt
          ) {
            updatedAt = new Date();
            return { count: 1 };
          }
          return { count: 0 };
        }),
        update: jest
          .fn()
          .mockImplementation(async ({ data }: { data: { status: string } }) => {
            status = data.status as typeof status;
            return {};
          }),
      },
      bentoSubscription: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const service = buildService({ prisma, customers, bentoVoucher });
    await service.handleXenditWebhook(webhookToken, {
      event: 'payment.capture',
      data: { reference_id: referenceId, status: 'SUCCEEDED' },
    });

    expect(prisma.bentoSubscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: [subscriptionId] },
          status: 'PENDING_PAYMENT',
        },
        data: { status: 'ACTIVE' },
      }),
    );
    expect(status).toBe('SUCCEEDED');
  });
});
