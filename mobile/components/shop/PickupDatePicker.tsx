import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../../constants/theme';

type Props = {
  value: string | null;
  onChange: (isoYmd: string | null) => void;
};

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmd(s: string | null): Date {
  if (!s) return new Date();
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function PickupDatePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const display = value ?? 'Select date';
  const dateObj = parseYmd(value);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.box}>
        <Text style={styles.label}>Pickup date</Text>
        <Text style={styles.hint}>
          On device builds, use the date picker. For web dev, type YYYY-MM-DD.
        </Text>
        <Pressable
          style={styles.webBtn}
          onPress={() => {
            const next = window.prompt('Pickup date (YYYY-MM-DD)', value ?? toYmd(new Date()));
            if (next && /^\d{4}-\d{2}-\d{2}$/.test(next)) onChange(next);
          }}
        >
          <Text style={styles.webBtnText}>{display}</Text>
        </Pressable>
      </View>
    );
  }

  const min = new Date();
  min.setHours(0, 0, 0, 0);

  return (
    <View style={styles.box}>
      <Text style={styles.label}>Pickup date</Text>
      <Pressable onPress={() => setOpen(true)} style={styles.trigger}>
        <Text style={value ? styles.triggerText : styles.placeholder}>{display}</Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={dateObj}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={min}
          onChange={(event, d) => {
            if (Platform.OS === 'android') setOpen(false);
            if (event.type === 'dismissed') return;
            if (d) onChange(toYmd(d));
          }}
        />
      ) : null}
      {Platform.OS === 'ios' && open ? (
        <Pressable onPress={() => setOpen(false)} style={styles.done}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginBottom: spacing.md },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  hint: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.xs },
  trigger: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  triggerText: { fontSize: 16, color: colors.text, fontWeight: '600' },
  placeholder: { fontSize: 16, color: colors.textMuted },
  webBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  webBtnText: { fontSize: 16, color: colors.accent, fontWeight: '600' },
  done: { alignSelf: 'flex-end', marginTop: spacing.sm },
  doneText: { color: colors.accent, fontWeight: '700' },
});
