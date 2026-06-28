import { StyleSheet, Text, View } from 'react-native';

import { formatRm } from '../../data/mockCatalog';
import { colors, radii, spacing } from '../../constants/theme';
import type { CartLine } from '../../types/shop';

type Props = {
  lines: CartLine[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  fulfillmentLines: string[];
};

export function OrderSummaryCard({
  lines,
  subtotalCents,
  discountCents,
  totalCents,
  fulfillmentLines,
}: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Order summary</Text>

      <Text style={styles.subheading}>Items</Text>
      {lines.map((l) => (
        <View key={l.lineId} style={styles.lineRow}>
          <Text style={styles.lineName} numberOfLines={2}>
            {l.name}
            {l.variantLabel ? ` · ${l.variantLabel}` : ''} ×{l.qty}
          </Text>
          <Text style={styles.linePrice}>
            {formatRm(l.unitPriceCents * l.qty)}
          </Text>
        </View>
      ))}

      <View style={styles.divider} />

      <Text style={styles.subheading}>Fulfillment</Text>
      {fulfillmentLines.map((t, i) => (
        <Text key={i} style={styles.fulfillLine}>
          {t}
        </Text>
      ))}

      <View style={styles.divider} />

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Subtotal</Text>
        <Text style={styles.totalVal}>{formatRm(subtotalCents)}</Text>
      </View>
      {discountCents > 0 ? (
        <View style={styles.totalRow}>
          <Text style={styles.discountLabel}>Discount</Text>
          <Text style={styles.discountVal}>-{formatRm(discountCents)}</Text>
        </View>
      ) : null}
      <View style={[styles.totalRow, styles.grand]}>
        <Text style={styles.grandLabel}>Total</Text>
        <Text style={styles.grandVal}>{formatRm(totalCents)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  heading: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.md,
  },
  subheading: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  lineName: { flex: 1, fontSize: 14, color: colors.text },
  linePrice: { fontSize: 14, fontWeight: '600', color: colors.text },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  fulfillLine: { fontSize: 14, color: colors.text, marginBottom: 4 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  totalLabel: { fontSize: 15, color: colors.textMuted },
  totalVal: { fontSize: 15, fontWeight: '600', color: colors.text },
  discountLabel: { fontSize: 15, color: colors.success },
  discountVal: { fontSize: 15, fontWeight: '700', color: colors.success },
  grand: { marginTop: spacing.sm, paddingTop: spacing.sm },
  grandLabel: { fontSize: 17, fontWeight: '800', color: colors.text },
  grandVal: { fontSize: 17, fontWeight: '800', color: colors.accent },
});
