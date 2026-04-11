import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  formatRm,
  MOCK_REWARDS,
  MOCK_VOUCHERS,
} from '../../data/mockCatalog';
import { colors, radii, spacing } from '../../constants/theme';
import type { MockReward, MockVoucher } from '../../types/shop';

type Props = {
  appliedVoucher: MockVoucher | null;
  appliedReward: MockReward | null;
  onApplyVoucher: (v: MockVoucher | null) => void;
  onApplyReward: (r: MockReward | null) => void;
};

export function VoucherRewardSelector({
  appliedVoucher,
  appliedReward,
  onApplyVoucher,
  onApplyReward,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [modal, setModal] = useState<'voucher' | 'reward' | null>(null);

  const summary =
    appliedReward != null
      ? `Reward: ${appliedReward.title}`
      : appliedVoucher != null
        ? `Voucher: ${appliedVoucher.code} — ${appliedVoucher.title}`
        : 'None applied';

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => setExpanded(!expanded)}
        style={styles.header}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <Text style={styles.title}>Voucher or reward</Text>
        <View style={styles.headerRight}>
          <Text style={styles.summary} numberOfLines={1}>
            {summary}
          </Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={colors.textMuted}
          />
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          <Text style={styles.hint}>
            Apply one voucher or one reward. Totals update instantly.
          </Text>
          <View style={styles.actions}>
            <Pressable style={styles.btn} onPress={() => setModal('voucher')}>
              <Text style={styles.btnText}>Choose voucher</Text>
            </Pressable>
            <Pressable style={styles.btnOutline} onPress={() => setModal('reward')}>
              <Text style={styles.btnOutlineText}>Redeem reward</Text>
            </Pressable>
          </View>
          {(appliedVoucher || appliedReward) && (
            <Pressable
              onPress={() => {
                onApplyVoucher(null);
                onApplyReward(null);
              }}
              style={styles.clear}
            >
              <Text style={styles.clearText}>Remove applied offer</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      <Modal visible={modal !== null} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>
                {modal === 'voucher' ? 'Your vouchers' : 'Eligible rewards'}
              </Text>
              <Pressable onPress={() => setModal(null)} hitSlop={12}>
                <Ionicons name="close" size={26} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetList}>
              {modal === 'voucher'
                ? MOCK_VOUCHERS.map((v) => (
                    <Pressable
                      key={v.id}
                      style={styles.listRow}
                      onPress={() => {
                        onApplyReward(null);
                        onApplyVoucher(v);
                        setModal(null);
                      }}
                    >
                      <Text style={styles.listTitle}>{v.title}</Text>
                      <Text style={styles.listSub}>
                        {v.code} ·{' '}
                        {v.discountType === 'percent'
                          ? `${v.value}% off`
                          : formatRm(v.value)}
                      </Text>
                    </Pressable>
                  ))
                : MOCK_REWARDS.map((r) => (
                    <Pressable
                      key={r.id}
                      style={styles.listRow}
                      onPress={() => {
                        onApplyVoucher(null);
                        onApplyReward(r);
                        setModal(null);
                      }}
                    >
                      <Text style={styles.listTitle}>{r.title}</Text>
                      <Text style={styles.listSub}>
                        {r.pointsCost} pts · {formatRm(r.valueCents)} value
                      </Text>
                    </Pressable>
                  ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    justifyContent: 'flex-end',
    maxWidth: '65%',
  },
  summary: { fontSize: 12, color: colors.textMuted, textAlign: 'right' },
  body: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  hint: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
  btn: {
    flex: 1,
    backgroundColor: colors.text,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnOutline: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    alignItems: 'center',
  },
  btnOutlineText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  clear: { marginTop: spacing.sm, alignSelf: 'center' },
  clearText: { color: colors.error, fontWeight: '600', fontSize: 13 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    maxHeight: '72%',
    paddingBottom: spacing.xl,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  sheetList: { padding: spacing.md },
  listRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  listTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  listSub: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
});
