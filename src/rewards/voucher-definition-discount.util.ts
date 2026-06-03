import type { PrismaClient } from '@prisma/client';

export type DefinitionDiscountMeta = {
  rebateValueSen: number;
  minSpendSen: number | null;
};

type PrismaLike = Pick<PrismaClient, 'perksCampaignRule'>;

/** Best active perks rebate per voucher definition (highest rebate wins). */
export async function loadDefinitionDiscountMap(
  prisma: PrismaLike,
  definitionIds: string[],
): Promise<Map<string, DefinitionDiscountMeta>> {
  const unique = [...new Set(definitionIds.filter(Boolean))];
  const map = new Map<string, DefinitionDiscountMeta>();
  if (!unique.length) return map;

  const rules = await prisma.perksCampaignRule.findMany({
    where: {
      voucherDefinitionId: { in: unique },
      isActive: true,
      rebateValueSen: { gt: 0 },
    },
    select: {
      voucherDefinitionId: true,
      rebateValueSen: true,
      minPurchaseAmountSen: true,
    },
    orderBy: [{ rebateValueSen: 'desc' }],
  });

  for (const r of rules) {
    if (map.has(r.voucherDefinitionId) || r.rebateValueSen == null) continue;
    map.set(r.voucherDefinitionId, {
      rebateValueSen: r.rebateValueSen,
      minSpendSen: r.minPurchaseAmountSen,
    });
  }
  return map;
}

export function discountCentsFromRebate(
  subtotalCents: number,
  meta: DefinitionDiscountMeta | undefined,
): number {
  if (!meta?.rebateValueSen) return 0;
  return Math.max(0, Math.min(meta.rebateValueSen, subtotalCents));
}
