import { ConfigService } from '@nestjs/config';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { SalesplayService } from '../salesplay/salesplay.service';
import { ShopCatalogService } from '../shop-catalog/shop-catalog.service';
import { WalletService } from '../wallet/wallet.service';
import { CustomersService } from './customers.service';

describe('CustomersService.maybeRewardReferrerOnFirstOrder', () => {
  const buyerId = '11111111-1111-4111-8111-111111111111';
  const referrerId = '22222222-2222-4222-8222-222222222222';
  const orderId = '33333333-3333-4333-8333-333333333333';

  let tx: {
    customer: { findUnique: jest.Mock };
    customerOrder: { count: jest.Mock };
    loyaltyLedgerEntry: { findFirst: jest.Mock };
    $executeRaw: jest.Mock;
  };
  let loyalty: { appendLedgerEntry: jest.Mock };
  let config: { get: jest.Mock };
  let service: CustomersService;
  let callOrder: string[];

  beforeEach(() => {
    callOrder = [];
    tx = {
      customer: {
        findUnique: jest.fn().mockResolvedValue({
          id: buyerId,
          referredByCustomerId: referrerId,
        }),
      },
      customerOrder: {
        count: jest.fn().mockImplementation(async () => {
          callOrder.push('count');
          return 1;
        }),
      },
      loyaltyLedgerEntry: {
        findFirst: jest.fn().mockImplementation(async () => {
          callOrder.push('ledgerLookup');
          return null;
        }),
      },
      $executeRaw: jest.fn().mockImplementation(async () => {
        callOrder.push('forUpdate');
        return 1;
      }),
    };
    loyalty = {
      appendLedgerEntry: jest.fn().mockImplementation(async () => {
        callOrder.push('append');
        return { balanceAfter: 100 };
      }),
    };
    config = {
      get: jest.fn((key: string) =>
        key === 'REFERRAL_REWARD_POINTS' ? '100' : undefined,
      ),
    };
    service = new CustomersService(
      {} as PrismaService,
      loyalty as unknown as LoyaltyService,
      {} as WalletService,
      {} as SalesplayService,
      {} as ShopCatalogService,
      config as unknown as ConfigService,
    );
  });

  function reward() {
    return (
      service as unknown as {
        maybeRewardReferrerOnFirstOrder: (
          txClient: typeof tx,
          buyerCustomerId: string,
          paidOrderId: string,
        ) => Promise<void>;
      }
    ).maybeRewardReferrerOnFirstOrder(tx, buyerId, orderId);
  }

  it('locks the buyer row before counting paid orders or checking the ledger', async () => {
    await reward();

    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(callOrder.indexOf('forUpdate')).toBeGreaterThanOrEqual(0);
    expect(callOrder.indexOf('forUpdate')).toBeLessThan(
      callOrder.indexOf('count'),
    );
    expect(callOrder.indexOf('forUpdate')).toBeLessThan(
      callOrder.indexOf('ledgerLookup'),
    );
    expect(callOrder.indexOf('ledgerLookup')).toBeLessThan(
      callOrder.indexOf('append'),
    );
    expect(loyalty.appendLedgerEntry).toHaveBeenCalledWith(
      {
        customerId: referrerId,
        deltaPoints: 100,
        reason: 'referral_reward',
        referenceType: 'referral',
        referenceId: buyerId,
      },
      tx,
    );
  });

  it('does not credit when another paid order already exists after the lock', async () => {
    tx.customerOrder.count.mockImplementation(async () => {
      callOrder.push('count');
      return 2;
    });

    await reward();

    expect(callOrder).toEqual(['forUpdate', 'count']);
    expect(tx.loyaltyLedgerEntry.findFirst).not.toHaveBeenCalled();
    expect(loyalty.appendLedgerEntry).not.toHaveBeenCalled();
  });

  it('does not credit when a referral ledger row already exists after the lock', async () => {
    tx.loyaltyLedgerEntry.findFirst.mockImplementation(async () => {
      callOrder.push('ledgerLookup');
      return { id: 'existing-reward' };
    });

    await reward();

    expect(callOrder).toEqual(['forUpdate', 'count', 'ledgerLookup']);
    expect(loyalty.appendLedgerEntry).not.toHaveBeenCalled();
  });

  it('skips locking and credit when the buyer has no referrer', async () => {
    tx.customer.findUnique.mockResolvedValue({
      id: buyerId,
      referredByCustomerId: null,
    });

    await reward();

    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.customerOrder.count).not.toHaveBeenCalled();
    expect(loyalty.appendLedgerEntry).not.toHaveBeenCalled();
  });
});
