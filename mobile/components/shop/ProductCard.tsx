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
          <Text style={styles.desc} numberOfLines={2}>
            {shortDescription}
          </Text>
        ) : null}
        <View style={styles.row}>
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
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 4,
    marginBottom: spacing.md,
  },
  pressed: { opacity: 0.92 },
  imageWrap: {
    aspectRatio: 1.15,
    backgroundColor: colors.accentSoft,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  body: {
    padding: spacing.md,
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  desc: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.accent,
  },
  addBtn: {
    backgroundColor: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
  },
  addBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
