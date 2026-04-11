import type { Prisma } from '@prisma/client';

/** Definitions eligible for the member-app rewards redeemable catalog. */
export function memberRewardsCatalogWhere(
  now: Date = new Date(),
): Prisma.VoucherDefinitionWhereInput {
  return {
    isActive: true,
    showInRewardsCatalog: true,
    AND: [
      { OR: [{ rewardValidFrom: null }, { rewardValidFrom: { lte: now } }] },
      { OR: [{ rewardValidUntil: null }, { rewardValidUntil: { gte: now } }] },
    ],
  };
}
