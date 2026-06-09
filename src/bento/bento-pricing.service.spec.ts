import {
  BentoMealOption,
  BentoPackageCode,
  BentoRiceType,
} from '@prisma/client';
import {
  NEWCOMER_FIXED_BASE_CENTS,
  quoteBentoCheckout,
  resolveSavingsBaseline,
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
      mealCredits: 10,
      pricePerMealCents: 1600,
      fixedCheckoutCents: null,
      mealOption: BentoMealOption.LUNCH,
      riceType: BentoRiceType.BROWN,
      includeDrinkAddon: true,
    });
    expect(q.brownRiceAddonCents).toBe(10 * 200);
    expect(q.drinkAddonCents).toBe(10 * 400);
    expect(q.totalCents).toBe(10 * 1600 + 10 * 200 + 10 * 400);
  });

  it('computes DINNER-only with +RM1 per meal', () => {
    const q = quoteBentoCheckout({
      packageCode: BentoPackageCode.DAYS_15,
      mealCredits: 20,
      pricePerMealCents: 1500,
      fixedCheckoutCents: null,
      mealOption: BentoMealOption.DINNER,
      riceType: BentoRiceType.WHITE,
      includeDrinkAddon: false,
    });
    expect(q.dinnerCredits).toBe(20);
    expect(q.totalCents).toBe(20 * 1600);
    expect(q.dinnerPremiumCents).toBe(20 * 100);
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

  it('shows savings vs 1-meal baseline on longer plans', () => {
    const baseline = 1800;
    const q = quoteBentoCheckout({
      packageCode: BentoPackageCode.DAYS_30,
      mealCredits: 30,
      pricePerMealCents: 1300,
      fixedCheckoutCents: null,
      mealOption: BentoMealOption.LUNCH,
      riceType: BentoRiceType.WHITE,
      includeDrinkAddon: false,
      savingsBaselineCents: baseline,
      savingsBaselineLabel: '1 meal',
    });
    expect(q.savingsPerMealCents).toBe(baseline - 1300);
    expect(q.totalSavingsCents).toBe(500 * 30);
    expect(q.savingsBaselineLabel).toBe('1 meal');
  });

  it('resolves savings baseline from ONE_TIME package only', () => {
    const baseline = resolveSavingsBaseline([
      {
        code: BentoPackageCode.ONE_TIME,
        label: '1 meal',
        pricePerMealCents: 1800,
      },
      {
        code: BentoPackageCode.DAYS_7,
        label: '10 meals',
        pricePerMealCents: 1600,
      },
      {
        code: BentoPackageCode.DAYS_30,
        label: '30 meals',
        pricePerMealCents: 1300,
      },
    ]);
    expect(baseline.pricePerMealCents).toBe(1800);
    expect(baseline.label).toBe('1 meal');
    expect(baseline.packageCode).toBe(BentoPackageCode.ONE_TIME);
  });

  it('skips soup surcharge and drink add-ons when drinksAndSoupEnabled is false', () => {
    const q = quoteBentoCheckout({
      packageCode: BentoPackageCode.DAYS_30,
      mealCredits: 30,
      pricePerMealCents: 1300,
      fixedCheckoutCents: null,
      includeFreeSoupAndDrinks: true,
      mealOption: BentoMealOption.BOTH,
      riceType: BentoRiceType.BROWN,
      includeDrinkAddon: true,
      drinksAndSoupEnabled: false,
    });
    expect(q.dinnerPremiumCents).toBe(0);
    expect(q.drinkAddonCents).toBe(0);
    expect(q.subtotalMealsCents).toBe(30 * 1300);
    expect(q.totalCents).toBe(30 * 1300 + 30 * 200);
    expect(q.lines.some((l) => l.label.includes('soup'))).toBe(false);
    expect(q.lines.some((l) => l.label.includes('Drinks'))).toBe(false);
  });
});
