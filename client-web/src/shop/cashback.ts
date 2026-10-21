import type { LoyaltyEarn } from '../api';

/** Lifetime-points thresholds, mirroring src/loyalty/member-tier.ts on the server. */
const GOLD_POINTS = 1000;
const PLATINUM_POINTS = 2000;

export type Cashback = {
  points: number;
  /** What those points are worth when redeemed, in sen. */
  valueSen: number;
  /** 1, 1.5 or 2 — the tier multiplier used. */
  multiplier: number;
};

/** Tier multiplier for a member with this many lifetime points (guests: 1×). */
export function tierMultiplier(earn: LoyaltyEarn, lifetimePoints: number | null | undefined): number {
  const m = earn.tierMultipliers ?? {};
  const pts = lifetimePoints ?? 0;
  if (pts >= PLATINUM_POINTS) return m.platinum ?? 2;
  if (pts >= GOLD_POINTS) return m.gold ?? 1.5;
  return m.silver ?? 1;
}

/**
 * Points (and their RM worth) a purchase of `amountSen` earns. Same rule as the
 * server: whole ringgit × rate × tier multiplier, rounded down.
 */
export function cashbackFor(amountSen: number, earn: LoyaltyEarn, multiplier: number): Cashback {
  const rm = Math.floor(amountSen / 100);
  const points = rm > 0 ? Math.floor(rm * earn.pointsPerRm * multiplier) : 0;
  return { points, valueSen: points * earn.pointValueSen, multiplier };
}
