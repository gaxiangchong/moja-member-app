# Moja Bento (bento-web)

Customer-facing web app for Moja Bento meal subscriptions. Shares the same NestJS API and PostgreSQL database as the Moja member app — one phone number, one account.

## Run locally

1. Start the API (from repo root):

   ```bash
   npm run start:dev
   ```

2. Ensure CORS includes the bento app origin in `.env`:

   ```env
   CLIENT_WEB_ORIGIN=http://localhost:5193,http://localhost:5194,http://localhost:5195
   ```

3. Install and run bento-web:

   ```bash
   cd bento-web && npm install && npm run dev
   ```

   Or from repo root: `npm run bento:dev`

4. Open [http://localhost:5195](http://localhost:5195)

## Environment

Copy `.env.example` to `.env`:

```env
VITE_API_BASE_URL=http://localhost:3153
```

## Features

- Same email OTP + PIN registration as Moja member (`/auth/*`)
- Bento-themed login background (`public/images/bento-bg.png` — replace with your own artwork)
- Meal plans: 1 / 7 / 15 / 30 meals (per-meal tier pricing); newcomer 3 lunches RM39 (first purchase only)
- Lunch only, dinner only (+RM1/meal), or both (e.g. 15+15 for 30 meals)
- Vegetarian choice for lunch and dinner separately; brown rice +RM2/meal; optional drinks +RM4/meal at checkout
- **Pay first** (fixed plan quote) → **schedule pickup days** after payment in My Bento
- Savings display vs RM18 baseline on longer plans
- Checkout via Xendit, or **bypass payment** when API has `PAYMENTS_DEMO_MODE=true` (shows “Continue without payment”)

## API endpoints used

- `GET /bento/packages`, `GET /bento/menu`
- `POST /bento/subscriptions/quote`, `POST /bento/subscriptions/checkout`
- `GET /bento/subscriptions/me`
- `POST /payments/demo/complete-bento-subscription` (demo mode only)
