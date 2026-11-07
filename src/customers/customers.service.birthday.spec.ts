import { ConfigService } from '@nestjs/config';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { SalesplayService } from '../salesplay/salesplay.service';
import { ShopCatalogService } from '../shop-catalog/shop-catalog.service';
import { WalletService } from '../wallet/wallet.service';
import {
  birthdayRewardYearKey,
  CustomersService,
} from './customers.service';

describe('birthdayRewardYearKey', () => {
  it('stores the calendar year in referenceType (not a UUID-shaped year)', () => {
    expect(birthdayRewardYearKey(2026)).toBe('birthday:2026');
    // Must never be a bare year string — LoyaltyLedgerEntry.referenceId is @db.Uuid.
    expect(birthdayRewardYearKey(2026)).not.toBe('2026');
  });
});

describe('CustomersService.maybeGrantBirthdayReward', () => {
  const customerId = '11111111-1111-4111-8111-111111111111';
  let prisma: {
    customer: { findUnique: jest.Mock };
    loyaltyLedgerEntry: { findFirst: jest.Mock };
  };
  let loyalty: { appendLedgerEntry: jest.Mock; getWalletSummary: jest.Mock };
  let config: { get: jest.Mock };
  let service: CustomersService;

  beforeEach(() => {
    prisma = {
      customer: { findUnique: jest.fn() },
      loyaltyLedgerEntry: { findFirst: jest.fn() },
    };
    loyalty = {
      appendLedgerEntry: jest.fn().mockResolvedValue({ balanceAfter: 150 }),
      getWalletSummary: jest.fn(),
    };
    config = {
      get: jest.fn((key: string) =>
        key === 'BIRTHDAY_REWARD_POINTS' ? '150' : undefined,
      ),
    };
    service = new CustomersService(
      prisma as unknown as PrismaService,
      loyalty as unknown as LoyaltyService,
      {} as WalletService,
      {} as SalesplayService,
      {} as ShopCatalogService,
      config as unknown as ConfigService,
    );
  });

  function grant(customerIdArg: string) {
    return (
      service as unknown as {
        maybeGrantBirthdayReward: (id: string) => Promise<void>;
      }
    ).maybeGrantBirthdayReward(customerIdArg);
  }

  it('credits once using a non-UUID year key on referenceType', async () => {
    const now = new Date();
    prisma.customer.findUnique.mockResolvedValue({
      id: customerId,
      birthday: new Date(Date.UTC(1990, now.getUTCMonth(), 15)),
    });
    prisma.loyaltyLedgerEntry.findFirst.mockResolvedValue(null);

    await grant(customerId);

    const yearKey = birthdayRewardYearKey(now.getUTCFullYear());
    expect(prisma.loyaltyLedgerEntry.findFirst).toHaveBeenCalledWith({
      where: {
        customerId,
        reason: 'birthday_reward',
        referenceType: yearKey,
      },
      select: { id: true },
    });
    expect(loyalty.appendLedgerEntry).toHaveBeenCalledWith({
      customerId,
      deltaPoints: 150,
      reason: 'birthday_reward',
      referenceType: yearKey,
      referenceId: null,
    });
  });

  it('does not double-credit when this year key already exists', async () => {
    const now = new Date();
    prisma.customer.findUnique.mockResolvedValue({
      id: customerId,
      birthday: new Date(Date.UTC(1990, now.getUTCMonth(), 15)),
    });
    prisma.loyaltyLedgerEntry.findFirst.mockResolvedValue({ id: 'existing' });

    await grant(customerId);

    expect(loyalty.appendLedgerEntry).not.toHaveBeenCalled();
  });

  it('does not throw when the preflight ledger lookup fails', async () => {
    const now = new Date();
    prisma.customer.findUnique.mockResolvedValue({
      id: customerId,
      birthday: new Date(Date.UTC(1990, now.getUTCMonth(), 15)),
    });
    prisma.loyaltyLedgerEntry.findFirst.mockRejectedValue(
      new Error('invalid input syntax for type uuid: "2026"'),
    );

    await expect(grant(customerId)).resolves.toBeUndefined();
    expect(loyalty.appendLedgerEntry).not.toHaveBeenCalled();
  });

  it('skips when birthday month does not match', async () => {
    const now = new Date();
    const otherMonth = (now.getUTCMonth() + 1) % 12;
    prisma.customer.findUnique.mockResolvedValue({
      id: customerId,
      birthday: new Date(Date.UTC(1990, otherMonth, 15)),
    });

    await grant(customerId);

    expect(prisma.loyaltyLedgerEntry.findFirst).not.toHaveBeenCalled();
    expect(loyalty.appendLedgerEntry).not.toHaveBeenCalled();
  });
});
