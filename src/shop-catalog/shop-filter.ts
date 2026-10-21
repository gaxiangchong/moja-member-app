/**
 * The four filter chips on the member app's shop page. Independent of the
 * product `category` (whole cakes / slices / specials …), which drives
 * delivery and stock rules and stays as it is.
 */
export const SHOP_FILTERS = ['cheesecake', 'cream_cake', 'cookies', 'drinks'] as const;
export type ShopFilter = (typeof SHOP_FILTERS)[number];

export function isShopFilter(v: unknown): v is ShopFilter {
  return typeof v === 'string' && (SHOP_FILTERS as readonly string[]).includes(v);
}

/**
 * The filter a product shows under: the one an admin picked, otherwise a
 * guess from its category, id and name. Null keeps it out of every chip
 * (it still shows under "All").
 */
export function resolveShopFilter(p: {
  shopFilter?: string | null;
  category: string;
  id: string;
  name: string;
}): ShopFilter | null {
  if (isShopFilter(p.shopFilter)) return p.shopFilter;
  const text = `${p.id} ${p.name}`.toLowerCase();
  if (p.category === 'drinks') return 'drinks';
  if (p.category === 'cookies' || text.includes('cookie')) return 'cookies';
  if (text.includes('cheese') || text.includes('basque')) return 'cheesecake';
  if (p.category === 'whole_cakes' || p.category === 'cake_slices') return 'cream_cake';
  return null;
}
