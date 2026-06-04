import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatRm } from '../../data/mockCatalog';
import { colors, radii, spacing } from '../../constants/theme';

type Props = {
  name: string;
  priceCents: number;
  shortDescription?: string;
  imageUrl: string;
  onView: () => void;
  onAdd: () => void;
};

export function ProductCard({
  name,
  priceCents,
  shortDescription,
  imageUrl,
  onView,
  onAdd,
}: Props) {
  return (
    <Pressable
      onPress={onView}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${formatRm(priceCents)}`}
    >
      <View style={styles.imageWrap}>
        <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        {shortDescription ? (
          <Text style={styles.desc} numberOfLines={1}>
            {shortDescription}
          </Text>
        ) : null}
        <View style={styles.footer}>
          <Text style={styles.price}>{formatRm(priceCents)}</Text>
          <Pressable
            onPress={(e) => {
              e?.stopPropagation?.();
              onAdd();
            }}
            style={styles.addBtn}
            accessibilityRole="button"
            accessibilityLabel={`Add ${name} to cart`}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    overflow: 'hidden',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 3,
    marginBottom: spacing.sm,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  imageWrap: {
    aspectRatio: 1,
    backgroundColor: colors.accentSoft,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  body: {
    padding: spacing.sm,
    paddingBottom: spacing.sm,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 18,
    marginBottom: 2,
  },
  desc: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 15,
    marginBottom: spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  price: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.accent,
  },
  addBtn: {
    width: 30,
    height: 30,
    borderRadius: radii.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
