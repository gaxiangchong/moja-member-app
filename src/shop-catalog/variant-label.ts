/**
 * Size labels ("6 inch", "8 inch", "Slice") are free text on the product, but
 * the kitchen's stock is keyed on the label: `product_stock_days` holds one row
 * per (product, variant, day). So two labels that mean the same size must never
 * both reach the grid — they would draw two columns over one count, and the
 * real stock would sit under whichever one the lookup happened to match.
 *
 * `6  Inch` and `6 inch` are the same size. Comparison therefore ignores case
 * and collapses runs of whitespace; the stored label keeps the admin's casing.
 */

/** The label as stored: trimmed, inner whitespace collapsed to single spaces. */
export function tidyVariantLabel(label: string | null | undefined): string {
  return (label ?? '').trim().replace(/\s+/g, ' ');
}

/**
 * The key two labels are compared on. Case- and spacing-insensitive, so
 * `"6  Inch"` and `"6 inch"` collide. Empty for a blank label.
 */
export function canonicalVariantLabel(
  label: string | null | undefined,
): string {
  return tidyVariantLabel(label).toLowerCase();
}

/**
 * The first label of each distinct size, in the order given. Blank labels are
 * dropped. Used wherever a list of labels becomes a row or a column, so data
 * written before the write-path check — or by an import — cannot double up.
 */
export function dedupeVariantLabels(
  labels: readonly (string | null | undefined)[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of labels) {
    const label = tidyVariantLabel(raw);
    if (!label) continue;
    const key = canonicalVariantLabel(label);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

/**
 * The first pair of labels that mean the same size, or null when every label is
 * distinct. `[firstKept, duplicate]` — the two spellings, so the message can
 * show both when they differ only in case or spacing.
 */
export function findDuplicateVariantLabel(
  labels: readonly (string | null | undefined)[],
): [string, string] | null {
  const seen = new Map<string, string>();
  for (const raw of labels) {
    const label = tidyVariantLabel(raw);
    if (!label) continue;
    const key = canonicalVariantLabel(label);
    const first = seen.get(key);
    if (first !== undefined) return [first, label];
    seen.set(key, label);
  }
  return null;
}

/** The admin-facing message for a duplicate size label. */
export function duplicateVariantLabelMessage(
  first: string,
  duplicate: string,
): string {
  const both =
    first === duplicate
      ? `two "${first}" sizes`
      : `"${first}" and "${duplicate}", which are the same size`;
  return `This product has ${both}. Each size may only appear once — the kitchen counts stock per size, so a repeat would split one count across two columns.`;
}
