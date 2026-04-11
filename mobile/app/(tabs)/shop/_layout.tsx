import { Stack } from 'expo-router';

import { colors } from '../../../constants/theme';

export default function ShopStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="product/[id]" />
      <Stack.Screen name="cart" />
      <Stack.Screen name="checkout" />
    </Stack>
  );
}
