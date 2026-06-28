import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../../constants/theme';
import {
  PICKUP_TIME_SLOTS,
  pickupTimeSlotLabel,
  type PickupTimeSlot,
} from '../../lib/pickupTimeSlots';

type Props = {
  value: string | null;
  onChange: (hhmm: string | null) => void;
  /** Field label (e.g. pickup vs delivery rider time) */
  label?: string;
  /** Fixed pickup windows; omit for free-form entry (e.g. delivery rider time). */
  slots?: PickupTimeSlot[] | null;
};

function dateFromHhmm(hhmm: string | null): Date {
  const d = new Date();
  if (hhmm && /^\d{2}:\d{2}$/.test(hhmm)) {
    const [h, m] = hhmm.split(':').map(Number);
    d.setHours(h, m, 0, 0);
  } else {
    d.setHours(12, 0, 0, 0);
  }
  return d;
}

function toHhmm(d: Date): string {
  const h = `${d.getHours()}`.padStart(2, '0');
  const m = `${d.getMinutes()}`.padStart(2, '0');
  return `${h}:${m}`;
};

function PickupSlotPicker({
  value,
  onChange,
  label,
  slots,
}: Required<Pick<Props, 'value' | 'onChange' | 'label' | 'slots'>>) {
  return (
    <View style={styles.box}>
      <Text style={styles.label}>{label}</Text>
      {slots.map((slot) => {
        const selected = value === slot.value;
        return (
          <Pressable
            key={slot.value}
            onPress={() => onChange(slot.value)}
            style={[styles.slot, selected && styles.slotSelected]}
          >
            <Text style={[styles.slotText, selected && styles.slotTextSelected]}>
              {slot.label}
            </Text>
          </Pressable>
        );
      })}
      {value && !slots.some((s) => s.value === value) ? (
        <Text style={styles.legacyNote}>
          Previously selected:{' '}
          {pickupTimeSlotLabel(value) !== value ? pickupTimeSlotLabel(value) : value}
        </Text>
      ) : null}
    </View>
  );
}

function FreeformTimePicker({ value, onChange, label }: Pick<Props, 'value' | 'onChange' | 'label'>) {
  const [open, setOpen] = useState(false);
  const display = value ?? 'Select time';

  if (Platform.OS === 'web') {
    return (
      <View style={styles.box}>
        <Text style={styles.label}>{label}</Text>
        <Pressable
          style={styles.webBtn}
          onPress={() => {
            const next = window.prompt(`${label} (HH:MM, 24h)`, value ?? '14:00');
            if (next && /^\d{1,2}:\d{2}$/.test(next)) {
              const [h, m] = next.split(':').map(Number);
              if (h >= 0 && h < 24 && m >= 0 && m < 60) {
                onChange(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
              }
            }
          }}
        >
          <Text style={styles.webBtnText}>{display}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={() => setOpen(true)} style={styles.trigger}>
        <Text style={value ? styles.triggerText : styles.placeholder}>{display}</Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={dateFromHhmm(value)}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, d) => {
            if (Platform.OS === 'android') setOpen(false);
            if (event.type === 'dismissed') return;
            if (d) onChange(toHhmm(d));
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

export function PickupTimePicker({
  value,
  onChange,
  label = 'Pickup time',
  slots = PICKUP_TIME_SLOTS,
}: Props) {
  if (slots && slots.length > 0) {
    return (
      <PickupSlotPicker
        value={value}
        onChange={onChange}
        label={label}
        slots={slots}
      />
    );
  }
  return <FreeformTimePicker value={value} onChange={onChange} label={label} />;
}

const styles = StyleSheet.create({
  box: { marginBottom: spacing.md },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  slot: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    marginBottom: spacing.xs,
  },
  slotSelected: {
    borderColor: colors.accent,
    backgroundColor: `${colors.accent}18`,
  },
  slotText: { fontSize: 15, color: colors.text },
  slotTextSelected: { fontWeight: '700', color: colors.accent },
  legacyNote: {
    marginTop: spacing.xs,
    fontSize: 12,
    color: colors.textMuted,
  },
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
