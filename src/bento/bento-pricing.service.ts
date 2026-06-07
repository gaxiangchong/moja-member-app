import {
  BentoMealOption,
  BentoPackageCode,
  BentoRiceType,
} from '@prisma/client';

/** 7-day plan per-meal price — baseline for savings display (RM18). */
export const BENTO_SAVINGS_BASELINE_CENTS = 1800;

/** +RM1 per dinner meal (soup included). */
export const BENTO_DINNER_PREMIUM_CENTS = 100;

export const BENTO_BROWN_RICE_CENTS = 200;

/** Optional drink add-on per meal at checkout. */
export const BENTO_DRINK_ADDON_CENTS = 400;

export const NEWCOMER_FIXED_BASE_CENTS = 3900;

export type BentoQuoteLine = {
  label: string;
  amountCents: number;
};

export type BentoQuoteInput = {
  packageCode: BentoPackageCode;
  mealCredits: number;
  pricePerMealCents: number;
  fixedCheckoutCents: number | null;
  /** 60-meal plan: no dinner soup surcharge; drinks included in plan price. */
  includeFreeSoupAndDrinks?: boolean;
  mealOption: BentoMealOption;
  riceType: BentoRiceType;
  includeDrinkAddon: boolean;
  /** When false, soup surcharges and drink add-ons are not offered. */
  drinksAndSoupEnabled?: boolean;
};

export type MealCreditSplit = {
  lunchCredits: number;
  dinnerCredits: number;
  totalMeals: number;
};

export type BentoQuoteResult = {
  lines: BentoQuoteLine[];
  subtotalMealsCents: number;
  dinnerPremiumCents: number;
  brownRiceAddonCents: number;
  drinkAddonCents: number;
  totalCents: number;
  savingsPerMealCents: number;
  totalSavingsCents: number;
  lunchCredits: number;
  dinnerCredits: number;
  mealCredits: number;
};

export function splitMealCredits(
  mealCredits: number,
  mealOption: BentoMealOption,
): MealCreditSplit {
  const n = Math.max(0, mealCredits);
  if (mealOption === BentoMealOption.LUNCH) {
    return { lunchCredits: n, dinnerCredits: 0, totalMeals: n };
  }
  if (mealOption === BentoMealOption.DINNER) {
    return { lunchCredits: 0, dinnerCredits: n, totalMeals: n };
  }
  const lunchCredits = Math.floor(n / 2);
  const dinnerCredits = n - lunchCredits;
  return { lunchCredits, dinnerCredits, totalMeals: n };
}

export function quoteBentoCheckout(input: BentoQuoteInput): BentoQuoteResult {
  const {
    packageCode,
    mealCredits,
    pricePerMealCents,
    fixedCheckoutCents,
    includeFreeSoupAndDrinks = false,
    mealOption,
    riceType,
    includeDrinkAddon,
    drinksAndSoupEnabled = true,
  } = input;

  const effectiveFreePerks =
    drinksAndSoupEnabled && includeFreeSoupAndDrinks;
  const dinnerPremiumPerMeal = effectiveFreePerks
    ? 0
    : drinksAndSoupEnabled
      ? BENTO_DINNER_PREMIUM_CENTS
      : 0;

  if (packageCode === BentoPackageCode.NEWCOMER_3 && mealOption !== BentoMealOption.LUNCH) {
    throw new Error('NEWCOMER_3 requires lunch-only meal option');
  }

  const split = splitMealCredits(mealCredits, mealOption);
  const totalMealSlots = split.lunchCredits + split.dinnerCredits;

  let subtotalMealsCents: number;
  let dinnerPremiumCents: number;

  if (fixedCheckoutCents != null && packageCode === BentoPackageCode.NEWCOMER_3) {
    subtotalMealsCents = fixedCheckoutCents;
    dinnerPremiumCents = 0;
  } else {
    subtotalMealsCents =
      split.lunchCredits * pricePerMealCents +
      split.dinnerCredits * (pricePerMealCents + dinnerPremiumPerMeal);
    dinnerPremiumCents = split.dinnerCredits * dinnerPremiumPerMeal;
  }

  const brownRiceAddonCents =
    riceType === BentoRiceType.BROWN
      ? totalMealSlots * BENTO_BROWN_RICE_CENTS
      : 0;

  const drinkAddonCents =
    !drinksAndSoupEnabled || effectiveFreePerks || !includeDrinkAddon
      ? 0
      : totalMealSlots * BENTO_DRINK_ADDON_CENTS;

  const totalCents =
    subtotalMealsCents + brownRiceAddonCents + drinkAddonCents;

  const savingsPerMealCents =
    packageCode === BentoPackageCode.NEWCOMER_3
      ? 0
      : Math.max(0, BENTO_SAVINGS_BASELINE_CENTS - pricePerMealCents);
  const totalSavingsCents = savingsPerMealCents * totalMealSlots;

  const lines: BentoQuoteLine[] = [];

  if (packageCode === BentoPackageCode.NEWCOMER_3) {
    lines.push({
      label: `Trial pack (${split.lunchCredits} lunches @ RM39)`,
      amountCents: subtotalMealsCents,
    });
  } else if (mealOption === BentoMealOption.LUNCH) {
    lines.push({
      label: `${split.lunchCredits} lunches @ RM${(pricePerMealCents / 100).toFixed(2)}`,
      amountCents: split.lunchCredits * pricePerMealCents,
    });
  } else if (mealOption === BentoMealOption.DINNER) {
    const dinnerRate = pricePerMealCents + dinnerPremiumPerMeal;
    lines.push({
      label: `${split.dinnerCredits} dinners @ RM${(dinnerRate / 100).toFixed(2)}${drinksAndSoupEnabled && !dinnerPremiumPerMeal ? ' (soup included)' : ''}`,
      amountCents: split.dinnerCredits * dinnerRate,
    });
  } else {
    lines.push({
      label: `${split.lunchCredits} lunches @ RM${(pricePerMealCents / 100).toFixed(2)}`,
      amountCents: split.lunchCredits * pricePerMealCents,
    });
    const dinnerRate = pricePerMealCents + dinnerPremiumPerMeal;
    lines.push({
      label: `${split.dinnerCredits} dinners @ RM${(dinnerRate / 100).toFixed(2)}${drinksAndSoupEnabled && dinnerPremiumPerMeal ? ' (+RM1/meal)' : drinksAndSoupEnabled ? ' (soup included)' : ''}`,
      amountCents: split.dinnerCredits * dinnerRate,
    });
  }

  if (effectiveFreePerks) {
    lines.push({
      label: 'Plan perk: free soup & drinks on all meals',
      amountCents: 0,
    });
  }

  if (brownRiceAddonCents > 0) {
    lines.push({
      label: `Brown rice (${totalMealSlots} meals @ RM2)`,
      amountCents: brownRiceAddonCents,
    });
  }
  if (drinksAndSoupEnabled && drinkAddonCents > 0) {
    lines.push({
      label: `Drinks add-on (${totalMealSlots} meals @ RM4)`,
      amountCents: drinkAddonCents,
    });
  }

  return {
    lines,
    subtotalMealsCents,
    dinnerPremiumCents,
    brownRiceAddonCents,
    drinkAddonCents,
    totalCents,
    savingsPerMealCents,
    totalSavingsCents,
    lunchCredits: split.lunchCredits,
    dinnerCredits: split.dinnerCredits,
    mealCredits,
  };
}

/** @deprecated Use quoteBentoCheckout — kept for any legacy imports */
export function mealsPerDayForOption(mealOption: BentoMealOption): number {
  return mealOption === BentoMealOption.BOTH ? 2 : 1;
}

export function quoteBentoSubscription(input: BentoQuoteInput): BentoQuoteResult {
  return quoteBentoCheckout(input);
}
