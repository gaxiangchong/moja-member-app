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
    <View style={styles.card}>
      <Image source={{ uri: line.imageUrl }} style={styles.thumb} />
      <View style={styles.mid}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={2}>
            {line.name}
          </Text>
          <Pressable
            onPress={onRemove}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Remove item"
          >
            <Ionicons name="close-circle" size={20} color={colors.border} />
          </Pressable>
        </View>
        {line.variantLabel ? (
          <Text style={styles.meta}>{line.variantLabel}</Text>
        ) : null}
        {line.notes ? (
          <Text style={styles.notes} numberOfLines={2}>
            Note: {line.notes}
          </Text>
        ) : null}
        <View style={styles.bottomRow}>
          <QuantitySelector
            value={line.qty}
            min={0}
            onChange={onQtyChange}
            size="sm"
          />
          <Text style={styles.total}>{formatRm(lineTotal)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  thumb: {
    width: 80,
    height: 80,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
  },
  mid: { flex: 1, minWidth: 0 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  name: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 20,
  },
  meta: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  notes: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  total: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.accent,
  },
});
