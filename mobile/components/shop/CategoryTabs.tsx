import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { colors, radii, spacing } from '../../constants/theme';
import type { ProductCategory } from '../../types/shop';
import { CATEGORY_LABELS } from '../../types/shop';

const ORDER: ProductCategory[] = [
  'whole_cakes',
  'cake_slices',
  'drinks',
  'specials',
];

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
        label="All"
        selected={active === 'all'}
        onPress={() => onChange('all')}
      />
      {ORDER.map((key) => (
        <Chip
          key={key}
          label={CATEGORY_LABELS[key]}
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
    paddingVertical: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  chipTextSelected: {
    color: colors.accent,
  },
});
