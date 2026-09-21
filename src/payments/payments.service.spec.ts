import { ConfigService } from '@nestjs/config';
import { WalletTxnType } from '@prisma/client';
import { PaymentsService } from './payments.service';

describe('PaymentsService payment finalize idempotency', () => {
  const webhookToken = 'test-webhook-token';

  function buildService(deps: {
    prisma: Record<string, unknown>;
    wallet?: { appendTransaction: jest.Mock };
    loyalty?: { appendLedgerEntry: jest.Mock };
    customers?: { finalizeShopOrderAfterPayment: jest.Mock; addInterestTag: jest.Mock };
    rewardsWorkflow?: { finalizeVoucherRedemption: jest.Mock };
    receiptEmail?: {
      sendWalletTopUpReceipt: jest.Mock;
      sendShopOrderReceipt: jest.Mock;
    };
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
      }) as never,
      {} as never,
    );
  }

  it('does not double-credit wallet when SUCCEEDED update fails then webhook retries', async () => {
    const intentId = 'intent-wallet-1';
    const referenceId = 'ref-wallet-1';
    const customerId = 'customer-1';
    let status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' = 'PENDING';
    let creditedOnce = false;

    const wallet = { appendTransaction: jest.fn().mockResolvedValue({ id: 'txn-1' }) };
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
        })),
        updateMany: jest.fn().mockImplementation(async ({ where }: { where: { status: string } }) => {
          if (where.status === status) {
            status = 'PROCESSING';
            return { count: 1 };
          }
          return { count: 0 };
        }),
        update: jest.fn().mockImplementation(async ({ data }: { data: { status: string } }) => {
          if (data.status === 'SUCCEEDED') {
            if (!creditedOnce) {
              // First finalize: wallet already credited, then SUCCEEDED write fails.
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
        findFirst: jest.fn().mockImplementation(async () =>
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
    expect(wallet.appendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId,
        type: WalletTxnType.TOPUP,
        amountCents: 5000,
        reason: 'xendit_wallet_topup',
        metadata: expect.objectContaining({ paymentIntentId: intentId }),
      }),
    );
  });

  it('does not double-deduct checkout reward points on shop finalize retry', async () => {
    const intentId = 'intent-shop-1';
    const referenceId = 'ref-shop-1';
    const customerId = 'customer-2';
    const orderId = 'order-1';
    const rewardDefinitionId = 'reward-1';
    let status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' = 'PENDING';
    let redeemedOnce = false;

    const loyalty = { appendLedgerEntry: jest.fn().mockResolvedValue({ balanceAfter: 10 }) };
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
        })),
        updateMany: jest.fn().mockImplementation(async ({ where }: { where: { status: string } }) => {
          if (where.status === status) {
            status = 'PROCESSING';
            return { count: 1 };
          }
          return { count: 0 };
        }),
        update: jest.fn().mockImplementation(async ({ data }: { data: { status: string } }) => {
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
        findFirst: jest.fn().mockImplementation(async () =>
          redeemedOnce ? { id: 'loyalty-1' } : null,
        ),
      },
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
    expect(loyalty.appendLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId,
        deltaPoints: -50,
        reason: `checkout_redeem_${rewardDefinitionId}`,
        referenceType: 'customer_order',
        referenceId: orderId,
      }),
    );
  });
});
