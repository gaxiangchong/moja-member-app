/** Member tier milestones (points balance thresholds). */
export const POINT_TIER_THRESHOLDS = [1000, 3000, 5000] as const;

export const POINT_TIER_LABELS = ['Silver', 'Gold', 'Platinum'] as const;

export type PointsTierProgress = {
  pointsToNext: number;
  progressPct: number;
  nextTierLabel: string | null;
  /** Index 0–2 of the tier band the member is working toward. */
  activeTierIndex: number;
};

export function pointsTierProgress(balance: number): PointsTierProgress {
  const pts = Math.max(0, Math.floor(balance));
  if (pts >= POINT_TIER_THRESHOLDS[2]) {
    return {
      pointsToNext: 0,
      progressPct: 100,
      nextTierLabel: null,
      activeTierIndex: 2,
    };
  }
  if (pts >= POINT_TIER_THRESHOLDS[1]) {
    const span = POINT_TIER_THRESHOLDS[2] - POINT_TIER_THRESHOLDS[1];
    return {
      pointsToNext: POINT_TIER_THRESHOLDS[2] - pts,
      progressPct: Math.min(100, ((pts - POINT_TIER_THRESHOLDS[1]) / span) * 100),
      nextTierLabel: POINT_TIER_LABELS[2],
      activeTierIndex: 2,
    };
  }
  if (pts >= POINT_TIER_THRESHOLDS[0]) {
    const span = POINT_TIER_THRESHOLDS[1] - POINT_TIER_THRESHOLDS[0];
    return {
      pointsToNext: POINT_TIER_THRESHOLDS[1] - pts,
      progressPct: Math.min(100, ((pts - POINT_TIER_THRESHOLDS[0]) / span) * 100),
      nextTierLabel: POINT_TIER_LABELS[1],
      activeTierIndex: 1,
    };
  }
  return {
    pointsToNext: POINT_TIER_THRESHOLDS[0] - pts,
    progressPct: Math.min(100, (pts / POINT_TIER_THRESHOLDS[0]) * 100),
    nextTierLabel: POINT_TIER_LABELS[0],
    activeTierIndex: 0,
  };
}
