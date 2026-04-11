import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../../constants/theme';
import type { FulfillmentMethod } from '../../types/shop';

type Props = {
  value: FulfillmentMethod | null;
  onChange: (m: FulfillmentMethod) => void;
};

export function FulfillmentSelector({ value, onChange }: Props) {
  return (
    <View style={styles.row}>
      <Option
        label="Self Pickup"
        description="Collect at our bakery"
        selected={value === 'pickup'}
        onPress={() => onChange('pickup')}
      />
      <Option
        label="Delivery"
        description="Arrange your own rider"
        selected={value === 'delivery'}
        onPress={() => onChange('delivery')}
      />
    </View>
  );
}

function Option({
  label,
  description,
  selected,
  onPress,
}: {
  label: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, selected && styles.cardSelected]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
      <Text style={styles.desc}>{description}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  card: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  labelSelected: { color: colors.accent },
  desc: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 16,
  },
});
