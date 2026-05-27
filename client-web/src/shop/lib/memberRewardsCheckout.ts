import type { MemberRewardsPayload } from '../../api';
import type { MockReward, MockVoucher } from '../types';

/** Issued vouchers the member can pick at checkout (same pool as Perks → Vouchers, active). */
export function checkoutIssuedVouchers(data: MemberRewardsPayload | null | undefined): MockVoucher[] {
  if (!data?.vouchers?.length) return [];
  const now = Date.now();
  return data.vouchers
    .filter((v) => {
      const st = String(v.status || '').toUpperCase();
      if (st !== 'ISSUED' && st !== 'ACTIVE') return false;
      if (v.expiresAt && new Date(v.expiresAt).getTime() <= now) return false;
      return true;
    })
    .map((v) => ({
      id: v.id,
      code: v.definition.code,
      title: v.definition.title,
      discountType: 'fixed' as const,
      /** Rebate not exposed on definition yet — total stays line sum until backend adds amounts. */
      value: 0,
    }));
}

/** Match a typed code against issued vouchers in the member wallet (case-insensitive). */
export function findIssuedVoucherByCode(
  data: MemberRewardsPayload | null | undefined,
  codeRaw: string,
): MockVoucher | null {
  const norm = codeRaw.trim().toUpperCase();
  if (!norm) return null;
  return checkoutIssuedVouchers(data).find((v) => v.code.toUpperCase() === norm) ?? null;
}

/** Points catalog rewards (same pool as Perks → Rewards). */
export function checkoutCatalogRewards(data: MemberRewardsPayload | null | undefined): MockReward[] {
  if (!data?.rewards?.length) return [];
  return data.rewards
    .filter((r) => r.isActive && r.pointsCost != null && r.pointsCost > 0)
    .map((r) => ({
      id: r.id,
      title: r.title,
      pointsCost: r.pointsCost!,
      discountType: 'fixed' as const,
      valueCents: 0,
    }));
}
