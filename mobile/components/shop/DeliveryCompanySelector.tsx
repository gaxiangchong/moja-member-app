import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radii, spacing } from '../../constants/theme';

const PRESETS = ['Lalamove', 'GrabExpress', 'Customer-arranged rider'] as const;

type Props = {
  value: string | null;
  onChange: (s: string | null) => void;
};

export function DeliveryCompanySelector({ value, onChange }: Props) {
  const isPreset = value != null && PRESETS.includes(value as (typeof PRESETS)[number]);
  const [otherText, setOtherText] = useState(!isPreset && value ? value : '');
  const [otherMode, setOtherMode] = useState(!isPreset && !!value);

  useEffect(() => {
    if (isPreset) {
      setOtherMode(false);
      setOtherText('');
    }
  }, [value, isPreset]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Delivery platform / company</Text>
      <View style={styles.chips}>
        {PRESETS.map((p) => (
          <Pressable
            key={p}
            onPress={() => {
              setOtherMode(false);
              setOtherText('');
              onChange(p);
            }}
            style={[styles.chip, value === p && styles.chipOn]}
          >
            <Text style={[styles.chipTxt, value === p && styles.chipTxtOn]}>{p}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => {
            setOtherMode(true);
            onChange(otherText.trim() || null);
          }}
          style={[styles.chip, otherMode && styles.chipOn]}
        >
          <Text style={[styles.chipTxt, otherMode && styles.chipTxtOn]}>Other</Text>
        </Pressable>
      </View>
      {otherMode ? (
        <TextInput
          value={otherText}
          onChangeText={(t) => {
            setOtherText(t);
            onChange(t.trim() || null);
          }}
          placeholder="Type platform name (required)"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  chipTxt: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  chipTxtOn: { color: colors.accent },
  input: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
});
