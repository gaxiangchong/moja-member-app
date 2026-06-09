export type BentoPackageCode =
  | 'ONE_TIME'
  | 'DAYS_7'
  | 'DAYS_15'
  | 'DAYS_30'
  | 'DAYS_60'
  | 'NEWCOMER_3';
export type BentoMealOption = 'LUNCH' | 'DINNER' | 'BOTH';
export type BentoRiceType = 'WHITE' | 'BROWN';
export type BentoDietVariant = 'VEG' | 'NONVEG';

export type BentoPackage = {
  id: string;
  code: BentoPackageCode;
  label: string;
  durationDays: number;
  mealCredits: number;
  pricePerMealCents: number;
  pricePerMealRm: number;
  fixedCheckoutCents: number | null;
  isNewcomer?: boolean;
  newcomerLunchOnly?: boolean;
  includeFreeSoupAndDrinks?: boolean;
  perksLabel?: string | null;
  savingsPerMealCents?: number;
  totalSavingsCents?: number;
};

export type BentoSavingsBaseline = {
  pricePerMealCents: number;
  pricePerMealRm: number;
  label: string;
  packageCode: BentoPackageCode;
};

export type PurchaseCapacityInfo = {
  canPurchase: boolean;
  requiredPacks: number;
  availablePacksInWindow: number;
  windowDays: number;
  windowStartDate: string;
  windowEndDate: string;
  nextAvailableDate: string | null;
  daysUntilAvailable: number | null;
  dailyCapacityPacks: number;
  ordersPaused: boolean;
};

export type BentoQuote = {
  lines: Array<{ label: string; amountCents: number }>;
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
  package: BentoPackage;
  purchaseAvailability?: PurchaseCapacityInfo;
};

export type BentoSchedulingMeta = {
  minLeadDays: number;
  earliestDate: string;
  windowEndDate: string;
  allowLunch: boolean;
  allowDinner: boolean;
  lunchScheduled: number;
  dinnerScheduled: number;
};

export type BentoSubscription = {
  id: string;
  mealOption: BentoMealOption;
  lunchVariant: BentoDietVariant;
  dinnerVariant: BentoDietVariant;
  riceType: BentoRiceType;
  includeDrinkAddon: boolean;
  mealCreditsTotal: number;
  lunchCredits: number;
  dinnerCredits: number;
  startDate: string | null;
  endDate: string | null;
  totalCents: number;
  totalRm: number;
  status: string;
  needsSchedule: boolean;
  scheduling?: BentoSchedulingMeta;
  createdAt: string;
  package: BentoPackage;
  deliveries: Array<{
    id: string;
    deliveryDate: string;
    includesLunch: boolean;
    includesDinner: boolean;
    status: string;
  }>;
};

export type OrderDraft = {
  packageCode: BentoPackageCode | null;
  mealOption: BentoMealOption;
  lunchVariant: BentoDietVariant;
  dinnerVariant: BentoDietVariant;
  riceType: BentoRiceType;
  includeDrinkAddon: boolean;
};

export function formatRm(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`;
}

/** Human-readable scheduling window shown in the plan picker. */
export function formatPlanDuration(days: number): string {
  return days === 1 ? '1 day' : `${days} days`;
}

/** @deprecated use BentoDietVariant */
export type BentoDinnerVariant = BentoDietVariant;
