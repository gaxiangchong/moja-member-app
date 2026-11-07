import { BadRequestException } from '@nestjs/common';
import { VoucherStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';

describe('PaymentsService shop promo reservation', () => {
  let service: PaymentsService;
  let prisma: {
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
    customerVoucher: {
      update: jest.Mock;
      updateMany: jest.Mock;
      findFirst: jest.Mock;
    };
    paymentIntent: { findFirst: jest.Mock };
    loyaltyLedgerEntry: { findFirst: jest.Mock };
  };
  let loyalty: { appendLedgerEntry: jest.Mock };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
      customerVoucher: {
        update: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn(),
      },
      paymentIntent: { findFirst: jest.fn() },
      loyaltyLedgerEntry: { findFirst: jest.fn() },
    };
    loyalty = { appendLedgerEntry: jest.fn() };
    service = new PaymentsService(
      prisma as unknown as PrismaService,
      { get: jest.fn() } as unknown as ConfigService,
      {} as never,
      {} as never,
      {} as never,
      loyalty as unknown as LoyaltyService,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  describe('claimCustomerVoucherForCheckout', () => {
    const claim = (customerId: string, voucherId: string) =>
      (
        service as unknown as {
          claimCustomerVoucherForCheckout: (
            customerId: string,
            voucherId: string,
          ) => Promise<void>;
        }
      ).claimCustomerVoucherForCheckout(customerId, voucherId);

    it('locks an ISSUED voucher for checkout', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'v1',
          status: 'ISSUED',
          expires_at: null,
          updated_at: new Date(),
        },
      ]);
      prisma.customerVoucher.update.mockResolvedValue({});

      await claim('c1', 'v1');

      expect(prisma.customerVoucher.update).toHaveBeenCalledWith({
        where: { id: 'v1' },
        data: { status: VoucherStatus.LOCKED },
      });
    });

    it('rejects a fresh LOCKED voucher while another checkout is open', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'v1',
          status: 'LOCKED',
          expires_at: null,
          updated_at: new Date(),
        },
      ]);
      prisma.paymentIntent.findFirst.mockResolvedValue({ id: 'pi1' });

      await expect(claim('c1', 'v1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(claim('c1', 'v1')).rejects.toMatchObject({
        response: { code: 'VOUCHER_LOCKED' },
      });
    });

    it('rejects a freshly LOCKED voucher even with no open payment (grace window)', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'v1',
          status: 'LOCKED',
          expires_at: null,
          updated_at: new Date(),
        },
      ]);
      prisma.paymentIntent.findFirst.mockResolvedValue(null);

      await expect(claim('c1', 'v1')).rejects.toMatchObject({
        response: { code: 'VOUCHER_LOCKED' },
      });
    });

    it('reclaims a stale LOCKED voucher after the grace window', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'v1',
          status: 'LOCKED',
          expires_at: null,
          updated_at: new Date(Date.now() - 31 * 60 * 1000),
        },
      ]);
      prisma.paymentIntent.findFirst.mockResolvedValue(null);
      prisma.customerVoucher.update.mockResolvedValue({});

      await claim('c1', 'v1');

      expect(prisma.customerVoucher.update).toHaveBeenCalledWith({
        where: { id: 'v1' },
        data: { status: VoucherStatus.LOCKED },
      });
    });
  });

  describe('finalizeShopPromotions', () => {
    const finalize = (input: {
      customerId: string;
      orderId: string;
      customerVoucherId?: string;
      rewardDefinitionId?: string;
      pointsCost?: number;
    }) =>
      (
        service as unknown as {
          finalizeShopPromotions: (input: unknown) => Promise<void>;
        }
      ).finalizeShopPromotions(input);

    it('redeems a LOCKED customer voucher', async () => {
      prisma.customerVoucher.updateMany.mockResolvedValue({ count: 1 });

      await finalize({
        customerId: 'c1',
        orderId: 'o1',
        customerVoucherId: 'v1',
      });

      expect(prisma.customerVoucher.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'v1',
          customerId: 'c1',
          status: { in: [VoucherStatus.LOCKED, VoucherStatus.ISSUED] },
        },
        data: { status: VoucherStatus.REDEEMED, redeemedAt: expect.any(Date) },
      });
    });

    it('skips points deduct when checkout already reserved them', async () => {
      prisma.loyaltyLedgerEntry.findFirst.mockResolvedValue({
        id: 'led1',
        deltaPoints: -100,
      });

      await finalize({
        customerId: 'c1',
        orderId: 'o1',
        rewardDefinitionId: 'r1',
        pointsCost: 100,
      });

      expect(loyalty.appendLedgerEntry).not.toHaveBeenCalled();
    });

    it('deducts points when no reservation ledger exists (legacy intents)', async () => {
      prisma.loyaltyLedgerEntry.findFirst.mockResolvedValue(null);
      loyalty.appendLedgerEntry.mockResolvedValue({ balanceAfter: 0 });

      await finalize({
        customerId: 'c1',
        orderId: 'o1',
        rewardDefinitionId: 'r1',
        pointsCost: 100,
      });

      expect(loyalty.appendLedgerEntry).toHaveBeenCalledWith({
        customerId: 'c1',
        deltaPoints: -100,
        reason: 'checkout_redeem_r1',
        referenceType: 'customer_order',
        referenceId: 'o1',
      });
    });
  });

  describe('release on payment failure', () => {
    it('releases LOCKED voucher and reserved points', async () => {
      prisma.customerVoucher.updateMany.mockResolvedValue({ count: 1 });
      prisma.loyaltyLedgerEntry.findFirst
        .mockResolvedValueOnce({ id: 'reserve', deltaPoints: -50 })
        .mockResolvedValueOnce(null);
      loyalty.appendLedgerEntry.mockResolvedValue({ balanceAfter: 50 });
      prisma.paymentIntent = {
        findFirst: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          id: 'pi1',
          customerId: 'c1',
          purpose: 'shop_order',
          metadata: {
            customerVoucherId: 'v1',
            orderId: 'o1',
            rewardDefinitionId: 'r1',
            rewardPointsCost: 50,
            voucherLockToken: null,
          },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      } as never;

      // rebuild service with updated prisma mock shape
      const prismaWithIntent = {
        ...prisma,
        paymentIntent: {
          findFirst: jest.fn(),
          findUnique: jest.fn().mockResolvedValue({
            id: 'pi1',
            customerId: 'c1',
            purpose: 'shop_order',
            metadata: {
              customerVoucherId: 'v1',
              orderId: 'o1',
              rewardDefinitionId: 'r1',
              rewardPointsCost: 50,
            },
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const cfg = {
        get: jest.fn((key: string) =>
          key === 'XENDIT_WEBHOOK_TOKEN' ? 'tok' : undefined,
        ),
      };
      const svc = new PaymentsService(
        prismaWithIntent as unknown as PrismaService,
        cfg as unknown as ConfigService,
        {} as never,
        {} as never,
        {} as never,
        loyalty as unknown as LoyaltyService,
        { releaseVoucherLock: jest.fn() } as never,
        {} as never,
        {} as never,
      );

      await svc.handleXenditWebhook('tok', {
        event: 'payment.failure',
        data: { reference_id: 'ref-1', status: 'FAILED' },
      });

      expect(prismaWithIntent.customerVoucher.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'v1',
          customerId: 'c1',
          status: VoucherStatus.LOCKED,
        },
        data: { status: VoucherStatus.ISSUED, redeemedAt: null },
      });
      expect(loyalty.appendLedgerEntry).toHaveBeenCalledWith({
        customerId: 'c1',
        deltaPoints: 50,
        reason: 'checkout_release_r1',
        referenceType: 'customer_order',
        referenceId: 'o1',
      });
    });
  });
});
