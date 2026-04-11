import { Ionicons } from '@expo/vector-icons';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, spacing } from '../../constants/theme';
import { CartIconWithBadge } from './CartIconWithBadge';

type Props = {
  title?: string;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onCartPress: () => void;
  cartCount: number;
  showBack?: boolean;
  onBackPress?: () => void;
  /** Hide search row (detail / cart / checkout) */
  hideSearch?: boolean;
  /** Hide cart icon */
  hideCart?: boolean;
};

export function ShopHeader({
  title = 'Shop',
  searchQuery,
  onSearchChange,
  onCartPress,
  cartCount,
  showBack,
  onBackPress,
  hideSearch,
  hideCart,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.row}>
        {showBack ? (
          <Pressable
            onPress={onBackPress}
            style={styles.iconBtn}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
        ) : (
          <View style={styles.iconSpacer} />
        )}
        <Text style={styles.title}>{title}</Text>
        {hideCart ? (
          <View style={styles.iconSpacer} />
        ) : (
          <CartIconWithBadge count={cartCount} onPress={onCartPress} />
        )}
      </View>
      {!hideSearch ? (
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={onSearchChange}
            placeholder="Search cakes, drinks…"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
            accessibilityLabel="Search products"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSpacer: { width: 40 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 4,
  },
});
