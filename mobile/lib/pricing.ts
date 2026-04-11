import type { MockReward, MockVoucher } from '../types/shop';

export function cartSubtotalCents(
  lines: { unitPriceCents: number; qty: number }[],
): number {
  return lines.reduce((sum, l) => sum + l.unitPriceCents * l.qty, 0);
}

export function computeDiscountCents(
  subtotalCents: number,
  voucher: MockVoucher | null,
  reward: MockReward | null,
): number {
  if (reward) {
    return Math.min(reward.valueCents, subtotalCents);
  }
  if (voucher) {
    if (voucher.discountType === 'percent') {
      return Math.min(
        Math.floor((subtotalCents * voucher.value) / 100),
        subtotalCents,
      );
    }
    return Math.min(voucher.value, subtotalCents);
  }
  return 0;
}
