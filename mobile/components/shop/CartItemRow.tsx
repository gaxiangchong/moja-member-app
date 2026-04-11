import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatRm } from '../../data/mockCatalog';
import { colors, radii, spacing } from '../../constants/theme';
import type { CartLine } from '../../types/shop';
import { QuantitySelector } from './QuantitySelector';

type Props = {
  line: CartLine;
  onQtyChange: (qty: number) => void;
  onRemove: () => void;
};

export function CartItemRow({ line, onQtyChange, onRemove }: Props) {
  const lineTotal = line.unitPriceCents * line.qty;

  return (
    <View style={styles.row}>
      <Image source={{ uri: line.imageUrl }} style={styles.thumb} />
      <View style={styles.mid}>
        <Text style={styles.name} numberOfLines={2}>
          {line.name}
        </Text>
        {line.variantLabel ? (
          <Text style={styles.meta}>{line.variantLabel}</Text>
        ) : null}
        {line.notes ? (
          <Text style={styles.notes} numberOfLines={2}>
            Note: {line.notes}
          </Text>
        ) : null}
        <Text style={styles.unit}>{formatRm(line.unitPriceCents)} each</Text>
        <View style={styles.qtyRow}>
          <QuantitySelector
            value={line.qty}
            min={0}
            onChange={onQtyChange}
            size="sm"
          />
          <Pressable
            onPress={onRemove}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Remove item"
          >
            <Ionicons name="trash-outline" size={20} color={colors.error} />
          </Pressable>
        </View>
      </View>
      <Text style={styles.total}>{formatRm(lineTotal)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radii.sm,
    backgroundColor: colors.accentSoft,
  },
  mid: { flex: 1, minWidth: 0 },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  meta: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  notes: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
  },
  unit: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  total: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    alignSelf: 'flex-start',
  },
});
