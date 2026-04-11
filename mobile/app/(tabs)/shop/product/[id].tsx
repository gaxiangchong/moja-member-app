import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { QuantitySelector } from '../../../../components/shop/QuantitySelector';
import { ShopHeader } from '../../../../components/shop/ShopHeader';
import { colors, radii, spacing } from '../../../../constants/theme';
import { formatRm, getProductById } from '../../../../data/mockCatalog';
import { useShopStore } from '../../../../store/useShopStore';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const product = useMemo(() => getProductById(String(id)), [id]);

  const [variantId, setVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (product?.variants?.[0]?.id) {
      setVariantId(product.variants[0].id);
    } else {
      setVariantId(null);
    }
    setQty(1);
    setNotes('');
  }, [product?.id]);

  const addToCart = useShopStore((s) => s.addToCart);
  const cartCount = useShopStore((s) => s.getCartItemCount());

  if (!product) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.miss}>Product not found.</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const variant = product.variants?.find((v) => v.id === variantId);
  const unitPriceCents = variant?.priceCents ?? product.basePriceCents;

  return (
    <View style={styles.screen}>
      <ShopHeader
        title="Product"
        showBack
        onBackPress={() => router.back()}
        hideSearch
        searchQuery=""
        onSearchChange={() => {}}
        onCartPress={() => router.push('/shop/cart')}
        cartCount={cartCount}
      />
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 100,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Image
            source={{ uri: product.imageUrl }}
            style={styles.heroImg}
            resizeMode="cover"
          />
        </View>
        <View style={styles.pad}>
          <Text style={styles.name}>{product.name}</Text>
          <Text style={styles.price}>{formatRm(unitPriceCents)}</Text>
          <Text style={styles.desc}>{product.description}</Text>

          {product.variants && product.variants.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.label}>Size / option</Text>
              <View style={styles.chips}>
                {product.variants.map((v) => (
                  <Pressable
                    key={v.id}
                    onPress={() => setVariantId(v.id)}
                    style={[
                      styles.chip,
                      variantId === v.id && styles.chipOn,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipTxt,
                        variantId === v.id && styles.chipTxtOn,
                      ]}
                    >
                      {v.label} · {formatRm(v.priceCents)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.label}>Special notes (optional)</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. message on cake, less sweet…"
              placeholderTextColor={colors.textMuted}
              style={styles.notes}
              multiline
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Quantity</Text>
            <QuantitySelector value={qty} onChange={setQty} />
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
        <Pressable
          style={styles.cta}
          onPress={() => {
            addToCart({
              productId: product.id,
              name: product.name,
              imageUrl: product.imageUrl,
              unitPriceCents,
              qty,
              variantLabel: variant?.label,
              notes: notes.trim() || undefined,
            });
            router.push('/shop/cart');
          }}
        >
          <Text style={styles.ctaText}>Add to cart · {formatRm(unitPriceCents * qty)}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { justifyContent: 'center', alignItems: 'center' },
  miss: { fontSize: 16, color: colors.textMuted },
  backBtn: { marginTop: spacing.md },
  backTxt: { color: colors.accent, fontWeight: '700' },
  hero: {
    backgroundColor: colors.accentSoft,
    aspectRatio: 1.05,
  },
  heroImg: { width: '100%', height: '100%' },
  pad: { padding: spacing.md },
  name: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  price: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.accent,
    marginTop: spacing.xs,
  },
  desc: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  section: { marginTop: spacing.lg },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  chipTxt: { fontSize: 13, fontWeight: '600', color: colors.text },
  chipTxtOn: { color: colors.accent },
  notes: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
    textAlignVertical: 'top',
  },
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
  cta: {
    backgroundColor: colors.text,
    paddingVertical: spacing.md,
    borderRadius: radii.full,
    alignItems: 'center',
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
