/** One physical pack = one lunch or one dinner meal. */
export function packsInDeliveryRow(row: {
  includesLunch: boolean;
  includesDinner: boolean;
}): number {
  return (row.includesLunch ? 1 : 0) + (row.includesDinner ? 1 : 0);
}

export function sumScheduledPacks(
  rows: Array<{
    includesLunch: boolean;
    includesDinner: boolean;
  }>,
): number {
  return rows.reduce((sum, row) => sum + packsInDeliveryRow(row), 0);
}
