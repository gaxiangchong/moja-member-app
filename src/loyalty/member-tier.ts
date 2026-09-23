/**
 * Membership tier from the current points balance.
 *
 * - Silver: below 1,000 points. 500 and below is always Silver.
 * - Gold: 1,000 and above, until Platinum. Earns 1.5× purchase points.
 * - Platinum: 2,000 and above. Earns 2× purchase points.
 *
 * The multiplier applies to spend (shop checkout and in-store receipts).
 * Birthday gifts, referrals, and manual adjustments stay flat.
 */

export const GOLD_POINTS = 1000;
export const PLATINUM_POINTS = 2000;

export const TIER_POINTS_MULTIPLIER = {
  silver: 1,
  gold: 1.5,
  platinum: 2,
} as const;

export type MemberTierName = keyof typeof TIER_POINTS_MULTIPLIER;

export function tierForPoints(balance: number): MemberTierName {
  const pts = Math.max(0, Math.floor(balance));
  if (pts >= PLATINUM_POINTS) return 'platinum';
  if (pts >= GOLD_POINTS) return 'gold';
  return 'silver';
}

export function tierPointsMultiplier(tier: MemberTierName): number {
  return TIER_POINTS_MULTIPLIER[tier];
}

/**
 * Points for a purchase. `amountRm` is already floored to whole ringgit,
 * matching the base earn rule (RM 45.90 @ 1 pt/RM = 45, then × tier).
 */
export function purchasePoints(input: {
  amountRm: number;
  pointsPerRm: number;
  balanceBefore: number;
}): { points: number; tier: MemberTierName; multiplier: number } {
  const tier = tierForPoints(input.balanceBefore);
  const multiplier = tierPointsMultiplier(tier);
  const amountRm = Math.floor(input.amountRm);
  const rate = input.pointsPerRm;
  if (amountRm <= 0 || !Number.isFinite(rate) || rate <= 0) {
    return { points: 0, tier, multiplier };
  }
  return {
    points: Math.floor(amountRm * rate * multiplier),
    tier,
    multiplier,
  };
}
