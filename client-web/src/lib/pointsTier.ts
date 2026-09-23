/**
 * Keep these thresholds in sync with `src/loyalty/member-tier.ts`.
 * Silver is everyone below 1,000 points (including 500 and below).
 * Gold starts at 1,000 (1.5× earn). Platinum starts at 2,000 (2× earn).
 */
export const POINT_TIER_THRESHOLDS = [0, 1000, 2000] as const;

export const POINT_TIER_LABELS = ['Silver', 'Gold', 'Platinum'] as const;

export const POINT_TIER_EARN = ['1×', '1.5×', '2×'] as const;

export type PointsTierProgress = {
  pointsToNext: number;
  progressPct: number;
  nextTierLabel: string | null;
  /** Index of the tier the member is in now (0 silver, 1 gold, 2 platinum). */
  activeTierIndex: number;
  earnLabel: string;
};

export function pointsTierProgress(balance: number): PointsTierProgress {
  const pts = Math.max(0, Math.floor(balance));
  if (pts >= POINT_TIER_THRESHOLDS[2]) {
    return {
      pointsToNext: 0,
      progressPct: 100,
      nextTierLabel: null,
      activeTierIndex: 2,
      earnLabel: 'Earns 2× points',
    };
  }
  if (pts >= POINT_TIER_THRESHOLDS[1]) {
    const span = POINT_TIER_THRESHOLDS[2] - POINT_TIER_THRESHOLDS[1];
    return {
      pointsToNext: POINT_TIER_THRESHOLDS[2] - pts,
      progressPct: Math.min(100, ((pts - POINT_TIER_THRESHOLDS[1]) / span) * 100),
      nextTierLabel: POINT_TIER_LABELS[2],
      activeTierIndex: 1,
      earnLabel: 'Earns 1.5× points',
    };
  }
  return {
    pointsToNext: POINT_TIER_THRESHOLDS[1] - pts,
    progressPct: Math.min(100, (pts / POINT_TIER_THRESHOLDS[1]) * 100),
    nextTierLabel: POINT_TIER_LABELS[1],
    activeTierIndex: 0,
    earnLabel: 'Earns 1× points',
  };
}
