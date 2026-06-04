import {
  BentoMealOption,
  BentoPackageCode,
  BentoRiceType,
} from '@prisma/client';
import {
  BENTO_SAVINGS_BASELINE_CENTS,
  NEWCOMER_FIXED_BASE_CENTS,
  quoteBentoCheckout,
  splitMealCredits,
} from './bento-pricing.service';

describe('splitMealCredits', () => {
  it('splits 30 meals as 15 lunch + 15 dinner for BOTH', () => {
    expect(splitMealCredits(30, BentoMealOption.BOTH)).toEqual({
      lunchCredits: 15,
      dinnerCredits: 15,
      totalMeals: 30,
    });
  });
});

describe('quoteBentoCheckout', () => {
  it('computes ONE_TIME lunch white rice at RM18', () => {
    const q = quoteBentoCheckout({
      packageCode: BentoPackageCode.ONE_TIME,
      mealCredits: 1,
      pricePerMealCents: 1800,
      fixedCheckoutCents: null,
      mealOption: BentoMealOption.LUNCH,
      riceType: BentoRiceType.WHITE,
      includeDrinkAddon: false,
    });
    expect(q.totalCents).toBe(1800);
    expect(q.lunchCredits).toBe(1);
    expect(q.dinnerCredits).toBe(0);
  });

  it('computes 30-meal BOTH with dinner +RM1 per dinner meal', () => {
    const q = quoteBentoCheckout({
      packageCode: BentoPackageCode.DAYS_30,
      mealCredits: 30,
      pricePerMealCents: 1300,
      fixedCheckoutCents: null,
      mealOption: BentoMealOption.BOTH,
      riceType: BentoRiceType.WHITE,
      includeDrinkAddon: false,
    });
    expect(q.lunchCredits).toBe(15);
    expect(q.dinnerCredits).toBe(15);
    expect(q.subtotalMealsCents).toBe(15 * 1300 + 15 * 1400);
    expect(q.dinnerPremiumCents).toBe(15 * 100);
    expect(q.totalCents).toBe(15 * 1300 + 15 * 1400);
  });

  it('computes 60-meal plan without dinner premium or drink charges', () => {
    const q = quoteBentoCheckout({
      packageCode: BentoPackageCode.DAYS_60,
      mealCredits: 60,
      pricePerMealCents: 1300,
      fixedCheckoutCents: null,
      includeFreeSoupAndDrinks: true,
      mealOption: BentoMealOption.BOTH,
      riceType: BentoRiceType.WHITE,
      includeDrinkAddon: true,
    });
    expect(q.lunchCredits).toBe(30);
    expect(q.dinnerCredits).toBe(30);
    expect(q.dinnerPremiumCents).toBe(0);
    expect(q.drinkAddonCents).toBe(0);
    expect(q.subtotalMealsCents).toBe(60 * 1300);
    expect(q.totalCents).toBe(60 * 1300);
  });

  it('adds brown rice and drinks per meal slot on standard plans', () => {
    const q = quoteBentoCheckout({
      packageCode: BentoPackageCode.DAYS_7,
      mealCredits: 7,
      pricePerMealCents: 1600,
      fixedCheckoutCents: null,
      mealOption: BentoMealOption.LUNCH,
      riceType: BentoRiceType.BROWN,
      includeDrinkAddon: true,
    });
    expect(q.brownRiceAddonCents).toBe(7 * 200);
    expect(q.drinkAddonCents).toBe(7 * 400);
    expect(q.totalCents).toBe(7 * 1600 + 7 * 200 + 7 * 400);
  });

  it('computes DINNER-only with +RM1 per meal', () => {
    const q = quoteBentoCheckout({
      packageCode: BentoPackageCode.DAYS_15,
      mealCredits: 15,
      pricePerMealCents: 1500,
      fixedCheckoutCents: null,
      mealOption: BentoMealOption.DINNER,
      riceType: BentoRiceType.WHITE,
      includeDrinkAddon: false,
    });
    expect(q.dinnerCredits).toBe(15);
    expect(q.totalCents).toBe(15 * 1600);
    expect(q.dinnerPremiumCents).toBe(15 * 100);
  });

  it('computes newcomer RM39 lunch base with add-ons', () => {
    const q = quoteBentoCheckout({
      packageCode: BentoPackageCode.NEWCOMER_3,
      mealCredits: 3,
      pricePerMealCents: 1300,
      fixedCheckoutCents: NEWCOMER_FIXED_BASE_CENTS,
      mealOption: BentoMealOption.LUNCH,
      riceType: BentoRiceType.BROWN,
      includeDrinkAddon: true,
    });
    expect(q.subtotalMealsCents).toBe(NEWCOMER_FIXED_BASE_CENTS);
    expect(q.brownRiceAddonCents).toBe(600);
    expect(q.drinkAddonCents).toBe(1200);
    expect(q.totalCents).toBe(3900 + 600 + 1200);
    expect(q.savingsPerMealCents).toBe(0);
  });

  it('shows savings vs RM18 baseline on longer plans', () => {
    const q = quoteBentoCheckout({
      packageCode: BentoPackageCode.DAYS_30,
      mealCredits: 30,
      pricePerMealCents: 1300,
      fixedCheckoutCents: null,
      mealOption: BentoMealOption.LUNCH,
      riceType: BentoRiceType.WHITE,
      includeDrinkAddon: false,
    });
    expect(q.savingsPerMealCents).toBe(BENTO_SAVINGS_BASELINE_CENTS - 1300);
    expect(q.totalSavingsCents).toBe(500 * 30);
  });
});
