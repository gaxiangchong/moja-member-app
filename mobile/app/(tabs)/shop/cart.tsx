import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CartItemRow } from '../../../components/shop/CartItemRow';
import { ShopHeader } from '../../../components/shop/ShopHeader';
import { colors, radii, spacing } from '../../../constants/theme';
import { formatRm } from '../../../data/mockCatalog';
import { useShopStore } from '../../../store/useShopStore';

export default function CartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cart = useShopStore((s) => s.cart);
  const setLineQty = useShopStore((s) => s.setLineQty);
  const removeLine = useShopStore((s) => s.removeLine);
  const subtotal = useShopStore((s) => s.getSubtotalCents());
  const cartCount = useShopStore((s) => s.getCartItemCount());

  return (
    <View style={styles.screen}>
      <ShopHeader
        title="Cart"
        showBack
        onBackPress={() => router.back()}
        hideSearch
        hideCart
        searchQuery=""
        onSearchChange={() => {}}
        onCartPress={() => router.push('/shop/cart')}
        cartCount={cartCount}
      />
      {cart.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySub}>Browse cakes and drinks to get started.</Text>
          <Pressable
            style={styles.browse}
            onPress={() => router.replace('/shop')}
          >
            <Text style={styles.browseTxt}>Continue shopping</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: spacing.md,
              paddingBottom: insets.bottom + 120,
            }}
          >
            {cart.map((line) => (
              <CartItemRow
                key={line.lineId}
                line={line}
                onQtyChange={(q) => {
                  if (q <= 0) removeLine(line.lineId);
                  else setLineQty(line.lineId, q);
                }}
                onRemove={() => removeLine(line.lineId)}
              />
            ))}
            <View style={styles.subRow}>
              <Text style={styles.subLabel}>Subtotal</Text>
              <Text style={styles.subVal}>{formatRm(subtotal)}</Text>
            </View>
            <Text style={styles.count}>
              {cart.reduce((n, l) => n + l.qty, 0)} items
            </Text>
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
            <Pressable
              style={styles.checkout}
              onPress={() => router.push('/shop/checkout')}
            >
              <Text style={styles.checkoutTxt}>Checkout</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  emptyWrap: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  emptySub: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  browse: {
    marginTop: spacing.lg,
    backgroundColor: colors.text,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.full,
  },
  browseTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
  subRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  subLabel: { fontSize: 16, fontWeight: '700', color: colors.text },
  subVal: { fontSize: 18, fontWeight: '800', color: colors.accent },
  count: { fontSize: 13, color: colors.textMuted, marginTop: spacing.xs },
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
  checkout: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: radii.full,
    alignItems: 'center',
  },
  checkoutTxt: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
