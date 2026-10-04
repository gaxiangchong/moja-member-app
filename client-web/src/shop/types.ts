export type ProductCategory = 'whole_cakes' | 'cake_slices' | 'drinks' | 'specials' | 'cookies';

/**
 * Where a product can be sent. Cakes are fresh and fragile, so they stay local
 * (pickup or a nearby courier); cookies are shelf-stable and can be posted
 * anywhere. Mirrors `src/orders/delivery-class.ts` on the server, which is the
 * one that enforces it.
 */
export type DeliveryClass = 'LOCAL_ONLY' | 'NATIONWIDE';

export function deliveryClassForProduct(product: { shippable?: boolean }): DeliveryClass {
  return product.shippable === true ? 'NATIONWIDE' : 'LOCAL_ONLY';
}

export const DELIVERY_CLASS_LABELS: Record<DeliveryClass, { title: string; tag: string }> = {
  LOCAL_ONLY: { title: 'Cakes & drinks', tag: 'Nearby only' },
  NATIONWIDE: { title: 'Cookies', tag: 'Ships nationwide' },
};

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
  imageOffsetX?: number;
  imageOffsetY?: number;
  imageScale?: number;
  basePriceCents: number;
  variants?: ProductVariant[];
  soldOut?: boolean;
  /** The admin marked this product as postable anywhere in the country. */
  shippable?: boolean;
  /** Kitchen-tracked count of this cake currently ready. `undefined` = not stock-tracked. */
  availableQty?: number;
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
  /** Missing on carts saved before shipping existed — read as LOCAL_ONLY. */
  deliveryClass?: DeliveryClass;
};

export type FulfillmentMethod = 'pickup' | 'delivery' | 'shipping';

/** Who books the courier for a delivery. */
export type DeliveryArrangement = 'SELF' | 'MOJA';

export type DeliveryDraft = {
  address: string;
  contactName: string;
  contactPhone: string;
  arrangement: DeliveryArrangement | null;
};

export type MockVoucher = {
  id: string;
  code: string;
  title: string;
  discountType: 'percent' | 'fixed';
  value: number;
  minSpendSen?: number | null;
};

export type MockReward = {
  id: string;
  title: string;
  pointsCost: number;
  discountType: 'fixed';
  valueCents: number;
  minSpendSen?: number | null;
};

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  whole_cakes: 'Whole Cakes',
  cake_slices: 'Cake Slices',
  drinks: 'Drinks',
  specials: 'Specials',
  cookies: 'Cookies',
};
