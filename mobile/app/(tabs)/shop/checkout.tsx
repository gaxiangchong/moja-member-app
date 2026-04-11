import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DeliveryCompanySelector } from '../../../components/shop/DeliveryCompanySelector';
import { FulfillmentSelector } from '../../../components/shop/FulfillmentSelector';
import { OrderSummaryCard } from '../../../components/shop/OrderSummaryCard';
import { PickupDatePicker } from '../../../components/shop/PickupDatePicker';
import { PickupTimePicker } from '../../../components/shop/PickupTimePicker';
import { ShopHeader } from '../../../components/shop/ShopHeader';
import { VoucherRewardSelector } from '../../../components/shop/VoucherRewardSelector';
import { colors, radii, spacing } from '../../../constants/theme';
import {
  fulfillmentSummaryLines,
  validateCheckout,
} from '../../../lib/checkoutValidation';
import { useShopStore } from '../../../store/useShopStore';

export default function CheckoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [attempted, setAttempted] = useState(false);

  const cart = useShopStore((s) => s.cart);
  const fulfillmentMethod = useShopStore((s) => s.fulfillmentMethod);
  const setFulfillmentMethod = useShopStore((s) => s.setFulfillmentMethod);
  const pickupDate = useShopStore((s) => s.pickupDate);
  const pickupTime = useShopStore((s) => s.pickupTime);
  const setPickupDate = useShopStore((s) => s.setPickupDate);
  const setPickupTime = useShopStore((s) => s.setPickupTime);
  const deliveryCompany = useShopStore((s) => s.deliveryCompany);
  const deliveryPickupTime = useShopStore((s) => s.deliveryPickupTime);
  const setDeliveryCompany = useShopStore((s) => s.setDeliveryCompany);
  const setDeliveryPickupTime = useShopStore((s) => s.setDeliveryPickupTime);
  const appliedVoucher = useShopStore((s) => s.appliedVoucher);
  const appliedReward = useShopStore((s) => s.appliedReward);
  const applyVoucher = useShopStore((s) => s.applyVoucher);
  const applyReward = useShopStore((s) => s.applyReward);
  const getSubtotalCents = useShopStore((s) => s.getSubtotalCents);
  const getDiscountCents = useShopStore((s) => s.getDiscountCents);
  const getTotalCents = useShopStore((s) => s.getTotalCents);
  const resetAfterOrder = useShopStore((s) => s.resetAfterOrder);
  const cartCount = useShopStore((s) => s.getCartItemCount());

  useEffect(() => {
    if (cart.length === 0) {
      router.replace('/shop');
    }
  }, [cart.length, router]);

  const draft = useMemo(
    () => ({
      cart,
      fulfillmentMethod,
      pickupDate,
      pickupTime,
      deliveryCompany,
      deliveryPickupTime,
    }),
    [
      cart,
      fulfillmentMethod,
      pickupDate,
      pickupTime,
      deliveryCompany,
      deliveryPickupTime,
    ],
  );

  const validation = useMemo(() => validateCheckout(draft), [draft]);
  const fulfillLines = fulfillmentSummaryLines(
    fulfillmentMethod,
    pickupDate,
    pickupTime,
    deliveryCompany,
    deliveryPickupTime,
  );

  const subtotal = getSubtotalCents();
  const discount = getDiscountCents();
  const total = getTotalCents();

  const placeOrder = () => {
    setAttempted(true);
    if (!validation.valid) {
      Alert.alert('Check your order', validation.errors.join('\n'));
      return;
    }
    Alert.alert(
      'Order received',
      'Payment step is not connected yet. This is a demo confirmation — your cart will be cleared.',
      [
        {
          text: 'OK',
          onPress: () => {
            resetAfterOrder();
            router.replace('/shop');
          },
        },
      ],
    );
  };

  return (
    <View style={styles.screen}>
      <ShopHeader
        title="Checkout"
        showBack
        onBackPress={() => router.back()}
        hideSearch
        hideCart
        searchQuery=""
        onSearchChange={() => {}}
        onCartPress={() => {}}
        cartCount={cartCount}
      />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.md,
          paddingBottom: insets.bottom + 120,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.lead}>
          Review your order, choose how you receive it, then apply an offer.
        </Text>

        <OrderSummaryCard
          lines={cart}
          subtotalCents={subtotal}
          discountCents={discount}
          totalCents={total}
          fulfillmentLines={fulfillLines}
        />

        <Text style={styles.sectionTitle}>Fulfillment</Text>
        <FulfillmentSelector
          value={fulfillmentMethod}
          onChange={setFulfillmentMethod}
        />

        {fulfillmentMethod === 'pickup' ? (
          <View style={styles.block}>
            <PickupDatePicker value={pickupDate} onChange={setPickupDate} />
            <PickupTimePicker value={pickupTime} onChange={setPickupTime} />
          </View>
        ) : null}

        {fulfillmentMethod === 'delivery' ? (
          <View style={styles.block}>
            <DeliveryCompanySelector
              value={deliveryCompany}
              onChange={setDeliveryCompany}
            />
            <PickupTimePicker
              label="Expected rider pickup time"
              value={deliveryPickupTime}
              onChange={setDeliveryPickupTime}
            />
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Offers</Text>
        <VoucherRewardSelector
          appliedVoucher={appliedVoucher}
          appliedReward={appliedReward}
          onApplyVoucher={applyVoucher}
          onApplyReward={applyReward}
        />

        {attempted && !validation.valid ? (
          <View style={styles.errors}>
            {validation.errors.map((e, i) => (
              <Text key={i} style={styles.errLine}>
                • {e}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.totalBanner}>
          <Text style={styles.totalLabel}>Amount due</Text>
          <Text style={styles.totalAmt}>
            RM {(total / 100).toFixed(2)}
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
        <Pressable style={styles.placeBtn} onPress={placeOrder}>
          <Text style={styles.placeTxt}>Place order</Text>
        </Pressable>
        <Text style={styles.legal}>
          Payment gateway placeholder — you will not be charged.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  lead: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  block: { marginTop: spacing.md },
  errors: {
    backgroundColor: '#FEF2F2',
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errLine: { color: colors.error, fontSize: 14, marginBottom: 4 },
  totalBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
  },
  totalLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  totalAmt: { fontSize: 22, fontWeight: '800', color: colors.accent },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  placeBtn: {
    backgroundColor: colors.text,
    paddingVertical: spacing.md,
    borderRadius: radii.full,
    alignItems: 'center',
  },
  placeTxt: { color: '#fff', fontSize: 17, fontWeight: '800' },
  legal: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
