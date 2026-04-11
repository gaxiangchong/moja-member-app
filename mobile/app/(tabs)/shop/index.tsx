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
import { colors, spacing } from '../../../constants/theme';
import { MOCK_PRODUCTS } from '../../../data/mockCatalog';
import type { ProductCategory } from '../../../types/shop';
import { useShopStore } from '../../../store/useShopStore';

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
        contentContainerStyle={{
          paddingHorizontal: spacing.md,
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
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: spacing.xl,
    fontSize: 15,
  },
});
