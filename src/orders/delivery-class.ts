/**
 * Where a product can be sent. Cakes are fresh and fragile, so they are only
 * collected or couriered locally; shelf-stable products (cookies) can also be
 * posted anywhere in the country. The admin decides per product with its
 * "shippable" flag, whatever category it is in.
 */
export type DeliveryClass = 'LOCAL_ONLY' | 'NATIONWIDE';

/** Anything not marked shippable stays local, the safe default. */
export function deliveryClassFor(
  shippable: boolean | null | undefined,
): DeliveryClass {
  return shippable === true ? 'NATIONWIDE' : 'LOCAL_ONLY';
}

/** The products in an order that cannot go by parcel (including ones the catalog no longer has). */
export function localOnlyProductIds(
  lines: { productId: string }[],
  shippableByProductId: Map<string, boolean>,
): string[] {
  return [
    ...new Set(
      lines
        .filter(
          (l) =>
            deliveryClassFor(shippableByProductId.get(l.productId)) ===
            'LOCAL_ONLY',
        )
        .map((l) => l.productId),
    ),
  ];
}
