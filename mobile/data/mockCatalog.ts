import type { MockReward, MockVoucher, Product } from '../types/shop';

export const MOCK_PRODUCTS: Product[] = [
  {
    id: 'wc-basque',
    category: 'whole_cakes',
    name: 'Burnt Basque Cheesecake',
    shortDescription: 'Caramelised top, creamy center',
    description:
      'Our signature whole cake — less sweet, rich vanilla and cream cheese, torched for a deep caramel lid. Serves 8–10.',
    imageUrl:
      'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=800&q=80',
    basePriceCents: 18800,
    variants: [
      { id: 'wc-basque-6', label: '6"', priceCents: 14800 },
      { id: 'wc-basque-8', label: '8"', priceCents: 18800 },
      { id: 'wc-basque-10', label: '10"', priceCents: 24800 },
    ],
  },
  {
    id: 'wc-choc',
    category: 'whole_cakes',
    name: 'Dark Chocolate Ganache',
    shortDescription: 'Intense cocoa, silky finish',
    description:
      'Layered dark chocolate sponge with 64% ganache and a subtle sea-salt edge. Whole cake for celebrations.',
    imageUrl:
      'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=800&q=80',
    basePriceCents: 19800,
  },
  {
    id: 'cs-yuzu',
    category: 'cake_slices',
    name: 'Yuzu Meringue Slice',
    shortDescription: 'Bright citrus, soft sponge',
    description: 'Single slice — yuzu curd, light sponge, toasted Italian meringue.',
    imageUrl:
      'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=800&q=80',
    basePriceCents: 2200,
  },
  {
    id: 'cs-redvelvet',
    category: 'cake_slices',
    name: 'Red Velvet Slice',
    shortDescription: 'Classic with cream cheese frosting',
    description: 'Moist cocoa-buttermilk layers with whipped cream cheese frosting.',
    imageUrl:
      'https://images.unsplash.com/photo-1586985289686-ca1b91c2db5b?auto=format&fit=crop&w=800&q=80',
    basePriceCents: 1900,
  },
  {
    id: 'dr-coldbrew',
    category: 'drinks',
    name: 'Oat Cold Brew',
    shortDescription: 'Slow-steeped, smooth',
    description: '16oz cold brew with oat milk — pairs beautifully with cake slices.',
    imageUrl:
      'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=800&q=80',
    basePriceCents: 1450,
    variants: [
      { id: 'dr-cb-12', label: '12 oz', priceCents: 1250 },
      { id: 'dr-cb-16', label: '16 oz', priceCents: 1450 },
    ],
  },
  {
    id: 'dr-matcha',
    category: 'drinks',
    name: 'Ceremonial Matcha Latte',
    shortDescription: 'Whisked to order',
    description: 'Stone-ground matcha with your choice of milk.',
    imageUrl:
      'https://images.unsplash.com/photo-1515825838458-f2a8949f3d63?auto=format&fit=crop&w=800&q=80',
    basePriceCents: 1650,
  },
  {
    id: 'sp-duo',
    category: 'specials',
    name: 'Cake + Drink Duo',
    shortDescription: 'Slice + 12oz drink',
    description: 'Pick any slice and a 12oz drink — limited daily slots.',
    imageUrl:
      'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=800&q=80',
    basePriceCents: 3200,
  },
  {
    id: 'sp-raya',
    category: 'specials',
    name: 'Festive Gift Box',
    shortDescription: 'Seasonal petite cakes',
    description: 'Curated box of 6 petits gâteaux — pre-order only.',
    imageUrl:
      'https://images.unsplash.com/photo-1558631568-655056a29fd0?auto=format&fit=crop&w=800&q=80',
    basePriceCents: 7800,
  },
];

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

export function getProductById(id: string): Product | undefined {
  return MOCK_PRODUCTS.find((p) => p.id === id);
}

export function formatRm(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`;
}
