# Moja Member — mobile (Shop module)

Expo (SDK 54) app with **Shop only**: browse cakes & drinks, cart, checkout with fulfillment (pickup / delivery), and voucher or reward application. **No WebView** — fully in-app UI with mock catalog data.

## Run

```bash
cd mobile
npm install
npx expo start
```

Then open in **Expo Go** (iOS/Android) or an emulator.

## Structure

| Path | Purpose |
|------|---------|
| `app/(tabs)/shop/` | Shop stack: landing, product `[id]`, cart, checkout |
| `app/(tabs)/_layout.tsx` | Bottom tab **Shop** (single tab for now) |
| `components/shop/` | Reusable Shop UI (header, cards, pickers, voucher modal, etc.) |
| `store/useShopStore.ts` | Zustand: cart + checkout fields + totals |
| `data/mockCatalog.ts` | Mock products, vouchers, rewards |
| `lib/checkoutValidation.ts` | Required-field validation before place order |

## Place order

Tapping **Place order** validates fulfillment fields, then shows a **demo** alert (no payment). Cart and checkout state reset after confirm.

## Native date/time

`@react-native-community/datetimepicker` is used on iOS/Android. On **web**, prompts are used as a dev fallback.
