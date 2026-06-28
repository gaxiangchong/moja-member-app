import { BadRequestException } from '@nestjs/common';
import {
  BentoDinnerVariant,
  BentoMealOption,
  BentoPackageCode,
  BentoRiceType,
} from '@prisma/client';
import { BentoService } from './bento.service';
import type { BentoCheckoutDto } from './dto/bento-subscription.dto';

const newcomerPackage = {
  id: 'pkg-newcomer',
  code: BentoPackageCode.NEWCOMER_3,
  label: 'Trial pack',
  durationDays: 14,
  mealCredits: 3,
  pricePerMealCents: 1300,
  fixedCheckoutCents: 3900,
  includeFreeSoupAndDrinks: false,
  isActive: true,
};

function makeService() {
  const prisma = {
    bentoPackage: {
      findUnique: jest.fn().mockResolvedValue(newcomerPackage),
    },
    bentoSubscription: {
      count: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const payments = {
    createBentoSubscriptionCheckout: jest.fn(),
  };
  const service = new BentoService(
    prisma as any,
    payments as any,
    {} as any,
    {} as any,
    { drinksAndSoupEnabled: jest.fn() } as any,
    {} as any,
    {} as any,
  );
  return { service, prisma, payments };
}

describe('BentoService checkout', () => {
  it('rejects multi-set newcomer trial checkout before creating payment state', async () => {
    const { service, prisma, payments } = makeService();
    const dto: BentoCheckoutDto = {
      packageCode: BentoPackageCode.NEWCOMER_3,
      mealOption: BentoMealOption.LUNCH,
      lunchVariant: BentoDinnerVariant.NONVEG,
      dinnerVariant: BentoDinnerVariant.NONVEG,
      riceType: BentoRiceType.WHITE,
      includeDrinkAddon: false,
      sets: 2,
      channelCode: 'TOUCHNGO',
    };

    try {
      await service.checkout('customer-1', dto);
      throw new Error('Expected checkout to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toMatchObject({
        code: 'BENTO_NEWCOMER_SINGLE_SET_ONLY',
      });
    }
    expect(prisma.bentoSubscription.count).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(payments.createBentoSubscriptionCheckout).not.toHaveBeenCalled();
  });
});
