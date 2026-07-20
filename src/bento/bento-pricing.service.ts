import {
  BentoMealOption,
  BentoPackageCode,
  BentoRiceType,
} from '@prisma/client';

/** Fallback when no comparable packages exist in the catalog. */
export const BENTO_SAVINGS_BASELINE_CENTS = 1790;

export type SavingsBaseline = {
  pricePerMealCents: number;
  label: string;
  packageCode: BentoPackageCode;
};

export function resolveSavingsBaseline(
  packages: Array<{
    code: BentoPackageCode;
    label: string;
    pricePerMealCents: number;
    isActive?: boolean;
  }>,
): SavingsBaseline {
  const oneTime = packages.find((p) => p.code === BentoPackageCode.ONE_TIME);
  if (oneTime) {
    return {
      pricePerMealCents: oneTime.pricePerMealCents,
      label: oneTime.label,
      packageCode: BentoPackageCode.ONE_TIME,
    };
  }
  return {
    pricePerMealCents: BENTO_SAVINGS_BASELINE_CENTS,
    label: '1 meal',
    packageCode: BentoPackageCode.ONE_TIME,
  };
}

export function computePackageListSavings(
  packageCode: BentoPackageCode,
  pricePerMealCents: number,
  mealCredits: number,
  baselineCents: number,
): { savingsPerMealCents: number; totalSavingsCents: number } {
  if (packageCode === BentoPackageCode.NEWCOMER_3) {
    return { savingsPerMealCents: 0, totalSavingsCents: 0 };
  }
  const savingsPerMealCents = Math.max(0, baselineCents - pricePerMealCents);
  return {
    savingsPerMealCents,
    totalSavingsCents: savingsPerMealCents * mealCredits,
  };
}

/**
 * @deprecated Meals are now a flexible pool priced at the flat per-meal rate;
 * no dinner surcharge is collected at checkout.
 */
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
  /** Highest per-meal rate among active plans — used for savings display. */
  savingsBaselineCents?: number;
  savingsBaselineLabel?: string;
};

/**
 * Meal credits are a single flexible pool — members decide lunch vs dinner at
 * scheduling time, not at checkout. The lunch/dinner split kept here only
 * seeds the legacy `lunch_credits`/`dinner_credits` columns; scheduling
 * enforces the pooled total, never the split.
 */
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
  savingsBaselineCents: number;
  savingsBaselineLabel: string;
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
    savingsBaselineCents = BENTO_SAVINGS_BASELINE_CENTS,
    savingsBaselineLabel = '',
  } = input;

  const effectiveFreePerks =
    drinksAndSoupEnabled && includeFreeSoupAndDrinks;

  // Meals are a flexible pool (lunch or dinner is chosen at scheduling time),
  // so every credit is priced at the flat per-meal rate. The old +RM1 dinner
  // surcharge cannot be charged up front — the dinner count isn't known yet.
  const split = splitMealCredits(mealCredits, mealOption);
  const totalMealSlots = split.lunchCredits + split.dinnerCredits;

  let subtotalMealsCents: number;
  const dinnerPremiumCents = 0;

  if (fixedCheckoutCents != null && packageCode === BentoPackageCode.NEWCOMER_3) {
    subtotalMealsCents = fixedCheckoutCents;
  } else {
    subtotalMealsCents = totalMealSlots * pricePerMealCents;
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
      : Math.max(0, savingsBaselineCents - pricePerMealCents);
  const totalSavingsCents = savingsPerMealCents * totalMealSlots;

  const lines: BentoQuoteLine[] = [];

  const mealWord = totalMealSlots === 1 ? 'meal' : 'meals';
  if (packageCode === BentoPackageCode.NEWCOMER_3) {
    lines.push({
      label: `Trial pack (${totalMealSlots} ${mealWord} @ RM39)`,
      amountCents: subtotalMealsCents,
    });
  } else {
    lines.push({
      label: `${totalMealSlots} ${mealWord} @ RM${(pricePerMealCents / 100).toFixed(2)} (lunch or dinner — your choice)`,
      amountCents: subtotalMealsCents,
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
    savingsBaselineCents,
    savingsBaselineLabel,
  };
}

/** @deprecated Use quoteBentoCheckout — kept for any legacy imports */
export function mealsPerDayForOption(mealOption: BentoMealOption): number {
  return mealOption === BentoMealOption.BOTH ? 2 : 1;
}

export function quoteBentoSubscription(input: BentoQuoteInput): BentoQuoteResult {
  return quoteBentoCheckout(input);
}
