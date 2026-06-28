import type { MockReward, MockVoucher } from '../types';

export const MOCK_VOUCHERS: MockVoucher[] = [
  {
    id: 'v-welcome10',
    code: 'WELCOME10',
    title: '10% off your order',
    discountType: 'percent',
    value: 10,
  },
  {
    id: 'v-cake5',
    code: 'CAKE5',
    title: 'RM 5 off cakes',
    discountType: 'fixed',
    value: 500,
  },
];

export const MOCK_REWARDS: MockReward[] = [
  {
    id: 'r-slice',
    title: 'Free cake slice',
    pointsCost: 450,
    discountType: 'fixed',
    valueCents: 2200,
  },
  {
    id: 'r-drink',
    title: 'Free 12oz drink',
    pointsCost: 300,
    discountType: 'fixed',
    valueCents: 1250,
  },
];

export function formatRm(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`;
}
