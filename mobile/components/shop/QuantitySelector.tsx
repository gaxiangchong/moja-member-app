import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../../constants/theme';

type Props = {
  value: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
  size?: 'sm' | 'md';
};

export function QuantitySelector({
  value,
  min = 1,
  max = 99,
  onChange,
  size = 'md',
}: Props) {
  const dim = size === 'sm' ? 32 : 40;
  const down = () => onChange(Math.max(min, value - 1));
  const up = () => onChange(Math.min(max, value + 1));

  return (
    <View style={styles.row}>
      <Pressable
        onPress={down}
        disabled={value <= min}
        style={({ pressed }) => [
          styles.btn,
          { width: dim, height: dim },
          value <= min && styles.disabled,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
      >
        <Ionicons
          name="remove"
          size={size === 'sm' ? 18 : 22}
          color={value <= min ? colors.textMuted : colors.text}
        />
      </Pressable>
      <Text style={[styles.val, size === 'sm' && styles.valSm]}>{value}</Text>
      <Pressable
        onPress={up}
        disabled={value >= max}
        style={({ pressed }) => [
          styles.btn,
          { width: dim, height: dim },
          value >= max && styles.disabled,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
      >
        <Ionicons
          name="add"
          size={size === 'sm' ? 18 : 22}
          color={value >= max ? colors.textMuted : colors.text}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  btn: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  val: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  valSm: { fontSize: 15, minWidth: 24 },
});
