import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { colors, radii, spacing } from '../../constants/theme';
import type { ProductCategory } from '../../types/shop';

const ORDER: ProductCategory[] = [
  'whole_cakes',
  'cake_slices',
  'drinks',
  'specials',
];

const LABELS: Record<ProductCategory | 'all', string> = {
  all: '🍽️ All',
  whole_cakes: '🎂 Whole Cakes',
  cake_slices: '🍰 Slices',
  drinks: '☕ Drinks',
  specials: '⭐ Specials',
};

type Props = {
  active: ProductCategory | 'all';
  onChange: (c: ProductCategory | 'all') => void;
};

export function CategoryTabs({ active, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      <Chip
        label={LABELS.all}
        selected={active === 'all'}
        onPress={() => onChange('all')}
      />
      {ORDER.map((key) => (
        <Chip
          key={key}
          label={LABELS[key]}
          selected={active === key}
          onPress={() => onChange(key)}
        />
      ))}
    </ScrollView>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  chipTextSelected: {
    color: '#fff',
  },
});
