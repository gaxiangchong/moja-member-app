import type { PrismaClient } from '@prisma/client';

export type DefinitionDiscountMeta = {
  rebateValueSen: number;
  minSpendSen: number | null;
};

type PrismaLike = Pick<
  PrismaClient,
  'voucherDefinition' | 'perksCampaignRule'
>;

/**
 * Resolve the cash discount per voucher definition for checkout / rewards.
 *
 * Primary source is the **series itself** (`VoucherDefinition.rebateValueSen`):
 * admins set the RM discount directly in "All series" with no perks campaign
 * required. If a series has no rebate of its own, we fall back to the best
 * active perks campaign rebate (legacy / advanced automation path).
 */
export async function loadDefinitionDiscountMap(
  prisma: PrismaLike,
  definitionIds: string[],
): Promise<Map<string, DefinitionDiscountMeta>> {
  const unique = [...new Set(definitionIds.filter(Boolean))];
  const map = new Map<string, DefinitionDiscountMeta>();
  if (!unique.length) return map;

  // 1) Discount defined directly on the series (preferred, simplest path).
  const defs = await prisma.voucherDefinition.findMany({
    where: { id: { in: unique }, rebateValueSen: { gt: 0 } },
    select: { id: true, rebateValueSen: true, minSpendSen: true },
  });
  for (const d of defs) {
    if (d.rebateValueSen == null) continue;
    map.set(d.id, {
      rebateValueSen: d.rebateValueSen,
      minSpendSen: d.minSpendSen,
    });
  }

  // 2) Fallback: perks campaign rebate for any series without its own value.
  const remaining = unique.filter((id) => !map.has(id));
  if (remaining.length) {
    const rules = await prisma.perksCampaignRule.findMany({
      where: {
        voucherDefinitionId: { in: remaining },
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
