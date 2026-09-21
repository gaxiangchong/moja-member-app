import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BentoVoucherService } from './bento-voucher.service';

function makeVoucher(overrides: Partial<Record<string, unknown>> = {}) {
  const now = Date.now();
  return {
    id: 'voucher-1',
    code: 'MOJA5',
    description: null,
    amountOffCents: 500,
    minSpendCents: null,
    startsAt: new Date(now - 60_000),
    endsAt: new Date(now + 60_000),
    redemptionCap: 100,
    redeemedCount: 0,
    isActive: true,
    ...overrides,
  };
}

describe('BentoVoucherService.validateForQuote', () => {
  let service: BentoVoucherService;
  let prisma: { bentoDiscountVoucher: { findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = { bentoDiscountVoucher: { findUnique: jest.fn() } };
    service = new BentoVoucherService(prisma as unknown as PrismaService);
  });

  it('returns NOT_FOUND for an unknown code', async () => {
    prisma.bentoDiscountVoucher.findUnique.mockResolvedValue(null);
    const res = await service.validateForQuote('nope', 3000);
    expect(res).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('normalizes the code to upper-case before lookup', async () => {
    prisma.bentoDiscountVoucher.findUnique.mockResolvedValue(makeVoucher());
    await service.validateForQuote('  moja5 ', 3000);
    expect(prisma.bentoDiscountVoucher.findUnique).toHaveBeenCalledWith({
      where: { code: 'MOJA5' },
    });
  });

  it('rejects an inactive voucher', async () => {
    prisma.bentoDiscountVoucher.findUnique.mockResolvedValue(
      makeVoucher({ isActive: false }),
    );
    const res = await service.validateForQuote('MOJA5', 3000);
    expect(res).toEqual({ ok: false, reason: 'INACTIVE' });
  });

  it('rejects a voucher whose window has not started', async () => {
    prisma.bentoDiscountVoucher.findUnique.mockResolvedValue(
      makeVoucher({ startsAt: new Date(Date.now() + 60_000) }),
    );
    const res = await service.validateForQuote('MOJA5', 3000);
    expect(res).toEqual({ ok: false, reason: 'NOT_STARTED' });
  });

  it('rejects an expired voucher', async () => {
    prisma.bentoDiscountVoucher.findUnique.mockResolvedValue(
      makeVoucher({ endsAt: new Date(Date.now() - 60_000) }),
    );
    const res = await service.validateForQuote('MOJA5', 3000);
    expect(res).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('rejects a fully redeemed voucher', async () => {
    prisma.bentoDiscountVoucher.findUnique.mockResolvedValue(
      makeVoucher({ redemptionCap: 5, redeemedCount: 5 }),
    );
    const res = await service.validateForQuote('MOJA5', 3000);
    expect(res).toEqual({ ok: false, reason: 'CAPACITY_FULL' });
  });

  it('rejects when below the minimum spend', async () => {
    prisma.bentoDiscountVoucher.findUnique.mockResolvedValue(
      makeVoucher({ minSpendCents: 4000 }),
    );
    const res = await service.validateForQuote('MOJA5', 3000);
    expect(res).toEqual({ ok: false, reason: 'MIN_SPEND', minSpendCents: 4000 });
  });

  it('applies the full fixed discount when the total is large enough', async () => {
    prisma.bentoDiscountVoucher.findUnique.mockResolvedValue(makeVoucher());
    const res = await service.validateForQuote('MOJA5', 3000);
    expect(res).toEqual({
      ok: true,
      voucherId: 'voucher-1',
      code: 'MOJA5',
      amountOffCents: 500,
      discountCents: 500,
      newTotalCents: 2500,
    });
  });

  it('clamps the discount so the order total never drops below RM1', async () => {
    prisma.bentoDiscountVoucher.findUnique.mockResolvedValue(
      makeVoucher({ amountOffCents: 1000 }),
    );
    const res = await service.validateForQuote('MOJA5', 400);
    // 400 - 100 floor = 300 max discount
    expect(res).toMatchObject({ ok: true, discountCents: 300, newTotalCents: 100 });
  });
});

describe('BentoVoucherService.reserve', () => {
  let service: BentoVoucherService;
  let prisma: {
    bentoDiscountVoucher: { findUnique: jest.Mock };
    bentoDiscountRedemption: { create: jest.Mock };
    $executeRaw: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      bentoDiscountVoucher: { findUnique: jest.fn() },
      bentoDiscountRedemption: { create: jest.fn() },
      $executeRaw: jest.fn(),
    };
    service = new BentoVoucherService(prisma as unknown as PrismaService);
  });

  it('claims a slot and creates a RESERVED redemption on success', async () => {
    prisma.bentoDiscountVoucher.findUnique.mockResolvedValue(makeVoucher());
    prisma.$executeRaw.mockResolvedValue(1);
    prisma.bentoDiscountRedemption.create.mockResolvedValue({ id: 'redemption-1' });

    const res = await service.reserve('MOJA5', 'customer-1', 3000);

    expect(res).toEqual({
      redemptionId: 'redemption-1',
      voucherId: 'voucher-1',
      code: 'MOJA5',
      discountCents: 500,
    });
    expect(prisma.bentoDiscountRedemption.create).toHaveBeenCalledWith({
      data: {
        voucherId: 'voucher-1',
        customerId: 'customer-1',
        discountCents: 500,
        status: 'RESERVED',
      },
    });
  });

  it('throws CAPACITY_FULL when the atomic claim updates no rows', async () => {
    prisma.bentoDiscountVoucher.findUnique.mockResolvedValue(makeVoucher());
    prisma.$executeRaw.mockResolvedValue(0);

    await expect(service.reserve('MOJA5', 'customer-1', 3000)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.bentoDiscountRedemption.create).not.toHaveBeenCalled();
  });
});

describe('BentoVoucherService.releaseUnattachedReservations', () => {
  it('releases every RESERVED redemption that never got a payment intent', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
    const releaseRedemption = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      bentoDiscountRedemption: { findMany },
    };
    const service = new BentoVoucherService(prisma as unknown as PrismaService);
    jest
      .spyOn(service, 'releaseRedemption')
      .mockImplementation(releaseRedemption);

    await service.releaseUnattachedReservations('customer-1');

    expect(findMany).toHaveBeenCalledWith({
      where: {
        customerId: 'customer-1',
        status: 'RESERVED',
        paymentIntentId: null,
      },
      select: { id: true },
    });
    expect(releaseRedemption).toHaveBeenCalledTimes(2);
    expect(releaseRedemption).toHaveBeenNthCalledWith(1, 'r1');
    expect(releaseRedemption).toHaveBeenNthCalledWith(2, 'r2');
  });
});
