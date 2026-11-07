/**
 * Keep in step with `src/shop-catalog/variant-label.ts` on the server.
 *
 * Size labels are free text per product, and the kitchen's stock is keyed on
 * the label. The server already drops a size a single product repeats, but the
 * column list here is the union across *every* product — so one cake spelling
 * it "6 inch" and another "6  Inch" still arrives as two distinct labels. They
 * are one column, and each product's cells must be looked up under that
 * product's own spelling.
 */

/** Trimmed, inner whitespace collapsed. */
export function tidyVariantLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ');
}

/** The key two labels are compared on: case- and spacing-insensitive. */
export function canonicalVariantLabel(label: string): string {
  return tidyVariantLabel(label).toLowerCase();
}

/** A product's sizes, or `['']` for one unsized "Each" row. */
export function sizesOf(product: { variants: string[] }): string[] {
  return product.variants.length > 0 ? product.variants : [''];
}

/**
 * This product's own spelling of `column`, or null when it has no such size.
 * Null means the cell is "—"; anything else is what the stock is keyed under.
 */
export function ownLabelFor(
  product: { variants: string[] },
  column: string,
): string | null {
  const want = canonicalVariantLabel(column);
  return (
    sizesOf(product).find((v) => canonicalVariantLabel(v) === want) ?? null
  );
}
