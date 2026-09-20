import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { SalesplayService } from '../salesplay/salesplay.service';
import { ShopCatalogService } from '../shop-catalog/shop-catalog.service';
import { WalletService } from '../wallet/wallet.service';
import { CustomersService } from './customers.service';

function uniqueViolation(target: string) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
    meta: { target: [target] },
  });
}

function walkInMember(
  overrides: Partial<{
    id: string;
    phoneE164: string;
    email: string | null;
    referralCode: string | null;
    kitchenPickupCode: string | null;
  }> = {},
) {
  return {
    id: 'cust-walkin',
    phoneE164: '+60123456789',
    email: null,
    referralCode: 'ABCD1234',
    kitchenPickupCode: '100001',
    ...overrides,
  };
}

describe('CustomersService.ensureCustomerForPhone', () => {
  let service: CustomersService;
  let prisma: {
    customer: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let loyalty: { ensureWallet: jest.Mock };
  let wallet: { ensureWallet: jest.Mock };

  beforeEach(() => {
    prisma = {
      customer: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    loyalty = { ensureWallet: jest.fn().mockResolvedValue(undefined) };
    wallet = { ensureWallet: jest.fn().mockResolvedValue(undefined) };
    service = new CustomersService(
      prisma as unknown as PrismaService,
      loyalty as unknown as LoyaltyService,
      wallet as unknown as WalletService,
      { syncCustomer: jest.fn().mockResolvedValue(null) } as unknown as SalesplayService,
      {} as ShopCatalogService,
      { get: jest.fn() } as unknown as ConfigService,
    );
  });

  it('returns an existing fully-initialized member instead of creating a duplicate', async () => {
    const existing = walkInMember();
    prisma.customer.findUnique.mockResolvedValue(existing);

    const result = await service.ensureCustomerForPhone(existing.phoneE164);

    expect(result).toEqual(existing);
    expect(prisma.customer.create).not.toHaveBeenCalled();
    expect(loyalty.ensureWallet).toHaveBeenCalledWith(existing.id);
    expect(wallet.ensureWallet).toHaveBeenCalledWith(existing.id);
  });

  it('does not overwrite an existing referral code when OTP verify supplies one', async () => {
    const existing = walkInMember({ referralCode: 'STAFFREF1' });
    prisma.customer.findUnique.mockResolvedValue(existing);

    const result = await service.ensureCustomerForPhone(existing.phoneE164, {
      referralCode: 'NEWID',
    });

    expect(result).toEqual(existing);
    expect(prisma.customer.create).not.toHaveBeenCalled();
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('reuses the raced row when a concurrent signup already claimed the phone', async () => {
    const raced = walkInMember({ id: 'cust-first' });
    prisma.customer.findUnique
      .mockResolvedValueOnce(null) // findByPhoneE164 before create
      .mockResolvedValueOnce(null) // generateUniqueReferralCode clash check
      .mockResolvedValueOnce(raced) // findByPhoneE164 after P2002
      .mockResolvedValueOnce(raced); // findByIdOrThrow
    prisma.customer.create.mockRejectedValue(uniqueViolation('phoneE164'));

    const result = await service.ensureCustomerForPhone(raced.phoneE164);

    expect(result).toEqual(raced);
    expect(prisma.customer.create).toHaveBeenCalledTimes(1);
    expect(loyalty.ensureWallet).toHaveBeenCalledWith(raced.id);
    expect(wallet.ensureWallet).toHaveBeenCalledWith(raced.id);
  });
});
