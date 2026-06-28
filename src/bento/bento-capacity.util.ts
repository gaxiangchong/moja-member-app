/**
 * One physical pack = one lunch or one dinner meal. Counts quantities when
 * present (lunchQty/dinnerQty), falling back to the legacy booleans so callers
 * that only select the booleans keep working.
 */
export function packsInDeliveryRow(row: {
  includesLunch: boolean;
  includesDinner: boolean;
  lunchQty?: number | null;
  dinnerQty?: number | null;
}): number {
  const lunch = row.lunchQty ?? (row.includesLunch ? 1 : 0);
  const dinner = row.dinnerQty ?? (row.includesDinner ? 1 : 0);
  return lunch + dinner;
}

export function sumScheduledPacks(
  rows: Array<{
    includesLunch: boolean;
    includesDinner: boolean;
    lunchQty?: number | null;
    dinnerQty?: number | null;
  }>,
): number {
  return rows.reduce((sum, row) => sum + packsInDeliveryRow(row), 0);
}
