# Xendit Payment Setup Guide (Step-by-Step)

This guide is written as a slow checklist so you can follow one step at a time.

It covers:

1. Member app `.env` setup
2. Xendit dashboard setup (API key + webhook + channels)
3. Local testing and verification
4. Common mistakes and fixes

---

## 1) Before you start

Prepare these first:

- A Xendit account with access to **test mode**.
- This repo running locally:
  - API (Nest): default `http://localhost:3153`
  - Member web: default `http://localhost:5193`
- A public URL tool for local webhook testing (example: `ngrok` or Cloudflare Tunnel), because Xendit cannot call `localhost` directly.

---

## 2) Fill `.env` in this project

Open the root `.env` file in `moja-member-app` and make sure these fields are set:

```env
# Xendit
XENDIT_SECRET_KEY=xnd_development_...your_test_secret_key...
XENDIT_WEBHOOK_TOKEN=your-long-random-shared-token
XENDIT_COUNTRY=MY
XENDIT_CURRENCY=MYR
XENDIT_DEFAULT_CHANNEL_CODE=TOUCHNGO
XENDIT_SHOP_CHANNEL_CODES=TOUCHNGO,SHOPEEPAY,FPX
XENDIT_API_VERSION=2024-11-11
# Required for card Components session (HTTPS only)
XENDIT_COMPONENTS_ORIGINS=https://your-https-member-web.example

# Member app public base used for payment return URL
MEMBER_APP_PUBLIC_URL=http://localhost:5193

# Keep demo mode OFF when testing real Xendit redirect
PAYMENTS_DEMO_MODE=false
```

Client web (`client-web/.env`) optionally includes:

```env
VITE_XENDIT_PUBLIC_KEY=xnd_public_development_...your_public_key...
```

### What each key means

- `XENDIT_SECRET_KEY`: server-to-server credential used by backend to create payment requests.
- `XENDIT_WEBHOOK_TOKEN`: verification token. Must exactly match what you set in Xendit webhook config.
- `XENDIT_SHOP_CHANNEL_CODES`: methods shown in checkout dropdown (must be enabled/available in your Xendit test account and country).
- `XENDIT_API_VERSION`: API version sent in `api-version` header for `/v3/payment_requests` (currently `2024-11-11`).
- `XENDIT_COMPONENTS_ORIGINS`: HTTPS origin(s) used for Xendit Components session (`components_configuration.origins`).
- `PAYMENTS_DEMO_MODE=false`: use actual Xendit hosted payment page.
  - If `true`, app skips Xendit and shows in-app demo completion instead.
- `VITE_XENDIT_PUBLIC_KEY`: optional legacy/fallback key. Current implementation uses Xendit Components SDK key issued by backend session endpoint.

> Important: never put `XENDIT_SECRET_KEY` in frontend code or `VITE_*` variables.

---

## 3) Xendit dashboard setup (test mode)

Use the dashboard in **test/development mode**.

## 3.1 Get your test Secret Key

1. Sign in to Xendit Dashboard.
2. Go to developer/API settings (usually under **Developers**).
3. Find **API Keys**.
4. Copy the **Secret Key** for test mode.
5. Paste into `.env` as:
   - `XENDIT_SECRET_KEY=...`

## 3.2 Configure webhook endpoint

Your backend webhook route is fixed to:

- `POST /webhooks/xendit`

So your full webhook URL is:

- `https://<your-public-api-host>/webhooks/xendit`

For local testing, use a tunnel:

1. Start API locally (`npm run start:dev` in repo root).
2. Start tunnel to port 3153, example:
   - `ngrok http 3153`
3. Copy HTTPS URL from ngrok, e.g.:
   - `https://abc123.ngrok-free.app`
4. Webhook URL in Xendit becomes:
   - `https://abc123.ngrok-free.app/webhooks/xendit`
   - `https://9c2e-117-20-154-116.ngrok-free.app/webhooks/xendit`

## 3.3 Set callback token in Xendit

When creating/editing webhook in Xendit:

1. Find field like **Callback Verification Token** / **Webhook Token**.
2. Enter your token (same string as `.env` `XENDIT_WEBHOOK_TOKEN`).
3. Save.

If tokens do not match exactly, webhook will be rejected with unauthorized.

## 3.4 Enable payment methods/channels for test

In Xendit dashboard, ensure test account has methods you want (country dependent), for example:

- `TOUCHNGO`
- `SHOPEEPAY`
- `FPX`

Then set the same list in `.env`:

```env
XENDIT_SHOP_CHANNEL_CODES=TOUCHNGO,SHOPEEPAY,FPX
```

If method names differ in your account, copy the exact channel codes from Xendit docs/dashboard and use those codes.

> Current implementation note: do not include `CARDS` yet. Card channel requires `channel_properties.card_details` (or tokenized card flow), which is not implemented in this repo today.

---

## 4) Restart app after env changes

Any time you edit `.env`, restart backend:

1. Stop `npm run start:dev`
2. Start again: `npm run start:dev`

(Frontend usually does not need restart for backend-only env changes, but restarting both is fine if unsure.)

---

## 5) End-to-end test flow

Use this exact test sequence:

1. Log in to member app.
2. Go to **Shop**.
3. Add items to cart.
4. Checkout and select payment method.
5. Click **Continue to payment**.
6. You should be redirected to Xendit hosted payment page.
7. Complete payment with Xendit test scenario.
8. Xendit sends webhook to `/webhooks/xendit`.
9. App receives capture event and finalizes order from `pending_payment` to `placed`.
10. Return to app and check order in **Orders** tab.

### Card checkout flow (tokenized)

For card payments in this repo:

1. In checkout, choose **Card (tokenized)**.
2. Click **Prepare card form** (backend creates `POST /sessions` in `COMPONENTS` mode with `CARDS` channel).
3. Fill card details in the embedded Xendit form.
4. Click **Generate card token**.
5. Continue checkout. Backend creates `/v3/payment_requests` using the generated `payment_token_id`.

---

## 6) Quick verification checklist

- [ ] `XENDIT_SECRET_KEY` filled (test key, not production key)
- [ ] `XENDIT_WEBHOOK_TOKEN` filled
- [ ] Xendit webhook URL points to `.../webhooks/xendit`
- [ ] Xendit webhook token matches `.env`
- [ ] `PAYMENTS_DEMO_MODE=false`
- [ ] `XENDIT_SHOP_CHANNEL_CODES` matches available test channels
- [ ] `XENDIT_API_VERSION=2024-11-11`
- [ ] `CLIENT_WEB_ORIGIN` contains the checkout origin used by the member app (for Components sessions)
- [ ] API restarted after `.env` changes
- [ ] Checkout redirects to Xendit successfully

---

## 7) Troubleshooting

## Problem: "Xendit is not configured. Set XENDIT_SECRET_KEY"

Cause: `XENDIT_SECRET_KEY` missing or server not restarted after update.

Fix:

1. Fill key in `.env`.
2. Restart backend.

## Problem: Payment page opens, but order not confirmed

Cause: webhook not reaching your API or token mismatch.

Fix:

1. Check webhook URL is public and ends with `/webhooks/xendit`.
2. Confirm tunnel is still active (if local).
3. Verify callback token in Xendit equals `XENDIT_WEBHOOK_TOKEN`.

## Problem: "Channel not enabled" or no methods in dropdown

Cause: invalid/unsupported channel code list.

Fix:

1. Check channels available in your Xendit test account/country.
2. Update `XENDIT_SHOP_CHANNEL_CODES` with exact valid codes.
3. Restart backend.

## Problem: "API version in header is required"

Cause: backend request to Xendit is missing `api-version`, or version is not valid for the endpoint.

Fix:

1. Set `XENDIT_API_VERSION=2024-11-11` in `.env`.
2. Restart backend.

## Problem: "channel_properties must have required property 'card_details'"

Cause: selected channel is card (`CARDS` / `CREDIT_CARD`) but this project currently supports redirect-based wallet/bank channels only.

Fix:

1. Remove `CARDS` from `XENDIT_DEFAULT_CHANNEL_CODE` and `XENDIT_SHOP_CHANNEL_CODES`.
2. Use channels like `TOUCHNGO`, `SHOPEEPAY`, `FPX`.
3. Restart backend.

## Problem: "API endpoint and method is not supported for 'TOUCHNGO_MY' channel code with country 'MY'"

Cause: this project previously used legacy suffix format (`*_MY`) while current Xendit Payments API expects channel codes without country suffix for these methods.

Fix:

1. Set `XENDIT_DEFAULT_CHANNEL_CODE=TOUCHNGO`.
2. Set `XENDIT_SHOP_CHANNEL_CODES=TOUCHNGO,SHOPEEPAY,FPX`.
3. Restart backend.

Note: backend now auto-normalizes legacy aliases (`TOUCHNGO_MY` -> `TOUCHNGO`, `SHOPEEPAY_MY` -> `SHOPEEPAY`, `FPX_MY` -> `FPX`) to avoid breakage.

## Problem: Card checkout says payment token is required / invalid

Cause: checkout was submitted without `payment_token_id`, or token is expired/invalid.

Fix:

1. Re-run **Prepare card form** and **Generate card token** to get a fresh `pt-...`.
2. Ensure Xendit **Cards** channel is active in test mode and your account can create Components sessions.
3. Verify app origin is allowed for Components session (comes from backend `CLIENT_WEB_ORIGIN` / member app URL).
4. Retry checkout.

## Problem: "components_configuration.origins need to use HTTPS"

Cause: Xendit Components rejects `http://` origins (including localhost) in session configuration.

Fix:

1. Expose your frontend via HTTPS (for local dev, use ngrok / Cloudflare Tunnel).
2. Set `XENDIT_COMPONENTS_ORIGINS` to that HTTPS origin, e.g. `https://abc123.ngrok-free.app`.
3. Restart backend and retry card form initialization.

## Problem: Still seeing demo payment screen instead of Xendit redirect

Cause: `PAYMENTS_DEMO_MODE=true`.

Fix:

1. Set `PAYMENTS_DEMO_MODE=false`.
2. Restart backend.

---

## 8) Production cutover notes (later)

When moving from test to production:

1. Replace `XENDIT_SECRET_KEY` with production secret key.
2. Use production webhook URL (public HTTPS domain).
3. Use production webhook token (new random token).
4. Confirm production channel codes and country/currency values.
5. Keep strict secret handling (secret manager, not committed files).

