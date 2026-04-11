export type ProductCategory = 'whole_cakes' | 'cake_slices' | 'drinks' | 'specials';

export type ProductVariant = {
  id: string;
  label: string;
  priceCents: number;
};

export type Product = {
  id: string;
  category: ProductCategory;
  name: string;
  shortDescription: string;
  description: string;
  imageUrl: string;
  basePriceCents: number;
  variants?: ProductVariant[];
};

export type CartLine = {
  lineId: string;
  productId: string;
  name: string;
  imageUrl: string;
  unitPriceCents: number;
  qty: number;
  variantLabel?: string;
  notes?: string;
};

export type FulfillmentMethod = 'pickup' | 'delivery' | 'in_store';

export type MockVoucher = {
  id: string;
  code: string;
  title: string;
  discountType: 'percent' | 'fixed';
  value: number;
};

export type MockReward = {
  id: string;
  title: string;
  pointsCost: number;
  discountType: 'fixed';
  valueCents: number;
};

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  whole_cakes: 'Whole Cakes',
  cake_slices: 'Cake Slices',
  drinks: 'Drinks',
  specials: 'Specials',
};
