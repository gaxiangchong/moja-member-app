import { useMemo, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryTabs } from '../../../components/shop/CategoryTabs';
import { ProductCard } from '../../../components/shop/ProductCard';
import { ShopHeader } from '../../../components/shop/ShopHeader';
import { colors, radii, spacing } from '../../../constants/theme';
import { MOCK_PRODUCTS } from '../../../data/mockCatalog';
import type { ProductCategory } from '../../../types/shop';
import { useShopStore } from '../../../store/useShopStore';

function PromoBanner() {
  return (
    <View style={bannerStyles.card}>
      <View style={bannerStyles.inner}>
        <Text style={bannerStyles.badge}>Fresh Today 🎉</Text>
        <Text style={bannerStyles.headline}>Handcrafted{'\n'}with love</Text>
        <Text style={bannerStyles.sub}>Made fresh every morning, ready for pickup today.</Text>
      </View>
      <Text style={bannerStyles.emoji}>🎂</Text>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  inner: { flex: 1 },
  badge: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headline: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.5,
    lineHeight: 28,
    marginBottom: spacing.sm,
  },
  sub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 18,
  },
  emoji: {
    fontSize: 72,
    marginLeft: spacing.md,
    opacity: 0.9,
  },
});

export default function ShopLandingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ProductCategory | 'all'>('all');
  const addToCart = useShopStore((s) => s.addToCart);
  const cartCount = useShopStore((s) => s.getCartItemCount());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MOCK_PRODUCTS.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.shortDescription.toLowerCase().includes(q)
      );
    });
  }, [query, category]);

  const ListHeader = (
    <View>
      <PromoBanner />
      <Text style={styles.sectionTitle}>Our Menu</Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      <ShopHeader
        searchQuery={query}
        onSearchChange={setQuery}
        onCartPress={() => router.push('/shop/cart')}
        cartCount={cartCount}
      />
      <CategoryTabs active={category} onChange={setCategory} />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{
          paddingHorizontal: spacing.md,
          paddingTop: spacing.sm,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>No products match your search.</Text>
        }
        renderItem={({ item }) => {
          const price =
            item.variants?.[0]?.priceCents ?? item.basePriceCents;
          return (
            <ProductCard
              name={item.name}
              priceCents={price}
              shortDescription={item.shortDescription}
              imageUrl={item.imageUrl}
              onView={() => router.push(`/shop/product/${item.id}`)}
              onAdd={() => {
                const v = item.variants?.[0];
                addToCart({
                  productId: item.id,
                  name: item.name,
                  imageUrl: item.imageUrl,
                  unitPriceCents: v?.priceCents ?? item.basePriceCents,
                  qty: 1,
                  variantLabel: v?.label,
                });
              }}
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  row: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.sm,
    letterSpacing: -0.3,
  },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: spacing.xl,
    fontSize: 15,
  },
});
