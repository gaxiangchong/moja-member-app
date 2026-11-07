/**
 * Splitting the shop into "in store today" and "pre-order".
 *
 * Both signals come from the admin's Pickup Rules (`/shop/availability-rules`)
 * and the kitchen's own count (`/shop/catalog/availability`) — nothing here is
 * hardcoded, so changing the notice from 2 days to 3, or turning in-store off,
 * changes what the shop shows with no deploy.
 *
 * The two sides are NOT a partition. Pre-order holds the whole catalog, so
 * anything on the shelf today can also be booked for a later day. The in-store
 * side keeps selling after closing time, for collection on the next open day.
 * Everything priced here is display only — placing the order re-checks hours,
 * notice and stock.
 */

export type AvailabilityTab = 'today' | 'preorder';

export type AvailabilityRules = {
  today: string;
  timeZone: string;
  preorder: { days: number; categories: string[]; earliestDate: string };
  inStore: {
    enabled: boolean;
    categories: string[];
    openNow: boolean;
    reason: string | null;
    readyFrom: string | null;
    collectOn: string | null;
  };
};

/** Per-variant stock left for today, keyed by size label. */
export type TodayStock = Record<string, number>;

type ClassifiableProduct = {
  id: string;
  category: string;
  variants?: { label: string }[];
};

/** How a product sits relative to today's shelf. */
export type ProductAvailability = {
  /** On the shelf now: in-store is on, and it has stock or is a counter item. */
  inStoreToday: boolean;
  /** Needs days of notice when booked ahead. */
  needsPreorder: boolean;
  /** Sold from the kitchen's daily count, so its stock can run out. */
  stockTracked: boolean;
  /**
   * Left on today's shelf per size, for the sizes the kitchen counted. A size
   * it has not counted is absent — which is not the same as zero.
   */
  leftBySize: TodayStock;
  /** Total left today across counted sizes; null when nothing was counted. */
  totalLeftToday: number | null;
};

/**
 * Stock left per size for one product, from the availability payload. A size
 * the kitchen has not counted is absent, which is why this cannot be a plain
 * "0 means none" number.
 */
export function todayStockFor(
  availability: { products: { id: string; variants?: TodayStock }[] } | null,
  productId: string,
): TodayStock {
  return availability?.products.find((p) => p.id === productId)?.variants ?? {};
}

/**
 * Where one product belongs. `stock` is its counted sizes for today.
 *
 * A product in neither category list — cookies, drinks — is always on the
 * counter and needs no notice. A product in an in-store category is only
 * in-store while a size has stock left. `openNow` is false only when in-store
 * is switched off, not when the shop shuts for the night.
 */
export function classifyProduct(
  product: ClassifiableProduct,
  rules: AvailabilityRules | null,
  stock: TodayStock = {},
): ProductAvailability {
  const counted = Object.values(stock ?? {});
  const totalLeftToday = counted.length
    ? counted.reduce((sum, n) => sum + Math.max(0, n), 0)
    : null;

  if (!rules) {
    // Rules not loaded yet: show everything rather than flash an empty shop.
    return {
      inStoreToday: true,
      needsPreorder: false,
      stockTracked: false,
      leftBySize: stock,
      totalLeftToday,
    };
  }

  const isPreorderCategory =
    rules.preorder.days > 0 &&
    rules.preorder.categories.includes(product.category);
  const isInStoreCategory =
    rules.inStore.enabled &&
    rules.inStore.categories.includes(product.category);
  const stockTracked = isInStoreCategory;

  const inStoreToday =
    rules.inStore.openNow &&
    (isInStoreCategory
      ? // Sold from today's count: needs a size left.
        (totalLeftToday ?? 0) > 0
      : // Not counted at all. A counter item (cookies, drinks) is always
        // there; a made-to-order line never is.
        !isPreorderCategory);

  return {
    inStoreToday,
    needsPreorder: isPreorderCategory,
    stockTracked,
    leftBySize: stock,
    totalLeftToday,
  };
}

/**
 * Whether a product shows under `tab`. A product may show under both: what is
 * on the shelf today is collectable now and bookable for later.
 */
export function productInTab(
  availability: ProductAvailability,
  tab: AvailabilityTab,
): boolean {
  if (tab === 'today') return availability.inStoreToday;
  // Pre-order holds everything: the whole catalog is bookable for a later date,
  // so the shop can still take an order after in-store closes for the day.
  return true;
}

/**
 * Which sizes are on the shelf: `6 inch and 8 inch`, or `8 inch` alone.
 *
 * Deliberately no counts. "2 left" frames a freshly baked cake as a remainder
 * nobody wanted, which is the opposite of the truth — so the member is told
 * what they can walk in and buy, not how little of it is left. Quantity is
 * still enforced: the cart re-checks stock and the order reserves it, so
 * asking for more than the kitchen has is caught at checkout.
 */
export function sizesReadyLabel(leftBySize: TodayStock): string {
  const sizes = Object.entries(leftBySize)
    .filter(([, n]) => n > 0)
    .map(([label]) => label);
  if (sizes.length === 0) return '';
  if (sizes.length === 1) return `Ready in ${sizes[0]}`;
  const last = sizes[sizes.length - 1];
  return `Ready in ${sizes.slice(0, -1).join(', ')} and ${last}`;
}

/** `yyyy-mm-dd` → `Fri, 6 Nov`, in the shop's own wording. */
export function formatEarliestDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** The notice in words: `2 days' notice`, `1 day's notice`. */
export function noticeLabel(days: number): string {
  if (days <= 0) return '';
  return days === 1 ? "1 day's notice" : `${days} days' notice`;
}
