# Moja Member — October 2026 Launch Roadmap

Written 2026-09-19. Target: public launch of online cake ordering by **31 Oct 2026**
(~6 working weeks). Ordering + pickup is the top priority; everything else is
sequenced behind it.

---

## 1. Where we are today (audited from the code, branch `feature/moja2_0`)

### ✅ Running end-to-end

| Area | What exists | Where |
| --- | --- | --- |
| Member auth | WhatsApp OTP (Meta / Twilio) for first registration + forgot-PIN, 6-digit PIN login, email OTP, guest browsing with login deferred to checkout | `src/auth`, `client-web/src/App.tsx` |
| Shop catalog | Products/variants, layout, featured, popular, home-ads carousel; admin editor; SalesPlay product-code mapping | `src/shop-catalog`, `admin-web/src/views/SalesCatalog.tsx` |
| Cart & checkout | Fulfilment = **In store** or **Self pickup** (date + 4 fixed slots), voucher *or* points-reward applied at checkout | `client-web/src/shop/ShopFlow.tsx`, `lib/checkoutValidation.ts` |
| Payment | Xendit Payments v3 (cards, e-wallets), webhook-confirmed, idempotent `PaymentIntent`, demo mode for testing | `src/payments` |
| Order pipeline | `pending_payment → placed → completed/collected`; sequential `orderNumber` doubles as pickup code; receipt email; loyalty points earned; referral reward; campaign triggers (new member / min purchase / referral count) | `customers.service.ts` → `finalizeShopOrderAfterPayment` |
| Kitchen stock | Per-product `availableQty`, kitchen staff screen to set it, sold-out shown in shop, server rejects `CAKE_OUT_OF_STOCK`, decremented on paid order | `ops-kitchen.controller.ts`, `ops-queue-web/src/KitchenWindowApp.tsx` |
| Ops queue | Order queue, scan-to-collect, bento pickup, kitchen stock, staff timesheet | `ops-queue-web` |
| SalesPlay | Online orders **pushed to POS**; POS receipts + credit notes ingested (webhook + pull/backfill/reconcile); dedupe of online orders settled in-store (`originOnlineOrderId`); in-store spend earns points (no double-award) | `src/salesplay`, `docs/sales-consolidation-plan.md` |
| Finance | Cross-channel revenue overview, unified transactions ledger + CSV, daily close, POS sync health | `src/admin/admin-reports.controller.ts`, admin **Finance** group |
| CRM & campaigns | Customer profile (birthday, gender, address, tier, tags, consent, notes), segmentation + campaign runs, voucher campaigns (WELCOME / BIRTHDAY / REFERRAL / WINBACK / SPEND_EARN / CUSTOM), perks rules (new-member, min-spend, tier, top-up, referrals, re-engagement), gift codes, wallet + loyalty ledgers, birthday email voucher, email campaigns, import/export, audit log, admin JWT + roles + approvals | `src/rewards-workflow`, `src/segmentation`, `src/mailer` |
| Bento | Separate subscription product line (menus, delivery days, vouchers, refunds) | `src/bento` |
| Admin UI | Embedded dashboard (`/admin-dashboard`) + new React `admin-web` SPA (phase 1, covers most views) | `src/ui`, `admin-web` |
| Mobile | Expo SDK 54 scaffold, **Shop only, mock data, no API, demo "place order"** | `mobile/` |

### ⚠️ Gaps against the stated goals

| Goal | Gap |
| --- | --- |
| Luckin-style order → pick up | No `preparing` / `ready` states; customer is not told when the order is ready (no push / WhatsApp; email is receipt-only); customer order tab polls every 12 s but has nothing new to show. |
| Cake availability set by kitchen | Stock is **one global number per product**, not per pickup date — a cake ordered for Saturday consumes today's count. No slot capacity, no lead-time / cut-off rules, no daily reset. Catalog + stock are stored in **JSON files under `data/`** written from multiple requests → race conditions, and lost on ephemeral hosts. |
| Delivery via Lalamove | Not started. Checkout says "We don't offer delivery"; cart-handoff DTO allows only `pickup`; no delivery address at checkout; no fee quote; no driver dispatch or tracking. |
| Offline ↔ online cake sales sync | Sales/revenue sync is done. **Stock is not**: an in-store cake sale on SalesPlay does not reduce online `availableQty`. |
| CRM upsell (purchase-with-purchase) | No PWP / add-on offer mechanism at checkout. Existing campaign types cover new-user, birthday, spend-earn, referral, win-back. |
| Dietary preferences | No field on `Customer`; nothing captured at signup or on products (allergens). |
| Complaints / suggestions | No feedback module (member submit, admin inbox). |
| Owner view of member behaviour | Customer list + orders + finance exist, but no per-member "360" (spend by channel, favourite products, frequency/recency, last visit) and no cohort/RFM view. |
| iOS / Android | Expo app is a mock; no shared API client with `client-web`. |

---

## 2. Phases

Dates assume ~1 developer full-time. Phases 0–1 are the launch-critical path;
2–3 are "launch with if ready, else first patch"; 4 is post-launch unless the
small items are pulled forward.

### Phase 0 — Launch hardening (19 Sep → 26 Sep)  ★ must

Things that will bite in production regardless of features.

1. ✅ **Move catalog + stock from JSON files to Postgres** — done 19 Sep. `shop_products` (columns + `document` JSON, `available_qty` as the single stock source), layout / popular / moja-sites upload in `app_settings`. Stock changes are atomic `UPDATE … GREATEST(0, available_qty - qty)` and the paid-order decrement runs inside the order-finalize transaction. Legacy JSON files are imported once on first boot. Per-date stock (`ProductStockDay`) comes in Phase 1.
2. ◐ Production env checklist (code side done 19 Sep: `DATA_DIR`, readiness gate, `GET /health/readiness`; account side pending — owner): Xendit live keys + webhook token, WhatsApp **production template approval** (Meta review takes days — submit now), `CLIENT_WEB_ORIGIN`, admin JWT secret, persistent `data/` volume for images (or S3/R2).
3. ✅ **PWA** — done 20 Sep. `manifest.webmanifest`, generated icons (192/512/maskable/apple-touch), hand-rolled `sw.js` (shell precache, network-first navigations, cache-first hashed assets, stale-while-revalidate images, API never cached), in-app "Add to home screen" banner with iOS fallback text, `?tab=shop` shortcut. Bump `CACHE_VERSION` in `sw.js` when the precache list changes.
4. Smoke-test runbook from `docs/DEPLOYMENT.md` §12 executed on the real host; Xendit sandbox → live cut-over; SalesPlay webhook pointed at production.
5. ✅ Decided 19 Sep: **Capacitor wrap of `client-web`** for the store apps (Phase 5); `mobile/` (Expo) is not developed further.

### Phase 1 — Pickup ordering, production-grade (22 Sep → 10 Oct)  ★ must

The Luckin/Zus loop: order & pay in app → kitchen prepares → customer notified → collect with code.

**Backend**
- Order lifecycle: `pending_payment → placed → preparing → ready → collected` (+ `cancelled`, `refunded`). Add `readyAt`, `collectedAt`, `cancelledAt`, `fulfilmentType` (`in_store | pickup | delivery`), `scheduledFor` (date + slot) as real columns instead of the free-text `fulfillmentSummary`.
- **Per-date stock**: `ProductStockDay(productId, businessDate, qty, reservedQty)`. Kitchen sets availability per day (default from a weekly template); checkout reserves against the chosen pickup date; expire reservations on abandoned payment (TTL job). Keep the "no date = today" path for in-store.
- ✅ Pickup rules in `app_settings` (`shop_pickup_rules`): lead time (default 2 h before the slot), optional cut-off clock per slot, per-slot capacity, store hours, closed weekdays and dates. Checkout shows which slots are still open and why. Enforced again when the order is created.
- ✅ Notify on `ready`: WhatsApp utility template (`WhatsappMessagingService`) with email fallback until the template is approved. Also on `placed` (WhatsApp only; the receipt email is the confirmation) and `cancelled`. Abandoned unpaid checkouts are not notified.
- Cancel/refund: member cancel before `preparing`; admin refund via Xendit refund API; stock released; points/vouchers reversed (compensating ledger entries).

**Ops (kitchen)**
- Queue screen actions: *Start preparing* / *Mark ready* / *Collected* with slot grouping and today/tomorrow tabs. Sound/badge on new paid order.
- Kitchen stock screen becomes a 7-day grid.

**Member**
- Order status screen with live steps (placed → preparing → ready → collected), pickup code big and scannable, "add to calendar", reorder button.
- ✅ Checkout: availability shown per date/slot; disabled slots explained; lead-time message.

**Acceptance:** place → pay → kitchen sees it within 5 s → mark ready → member gets WhatsApp → scan collect → SalesPlay shows the online order → finance daily close matches Xendit.

### Phase 2 — Delivery via Lalamove (6 Oct → 24 Oct)  ◐ stretch for launch

Design so the dispatcher is pluggable (`DeliveryProvider` interface: `quote`, `create`, `cancel`, `webhook`) — Lalamove first, GrabExpress / own rider later.

#### Pricing model (decided 23 Sep 2026)

**The customer is charged at checkout and pays nothing to the driver.** Lalamove
API jobs bill our own business wallet — the rider is not a payment terminal, so
door-side cash would mean no record, no reconciliation, and change disputes.

**The price the customer sees is our own zone table, not the live Lalamove
quote.** The deciding constraint is timing: the cake is not baked at checkout,
so the rider is only booked when the order turns `ready` — minutes to days
later. A Lalamove quotation expires in minutes, so *any* quote shown at
checkout is stale by dispatch, and the real cost can be higher (peak, weather,
surge). Charging our own banded fee gives a stable customer-facing price, no
expiry problem, insulation from surge, and a "free delivery above RM X"
marketing lever we control.

The Lalamove quotation API is still called at checkout, but as an **internal
serviceability + cost check**, not as the price: it confirms the address is
deliverable and records the estimated cost on the order. At dispatch we
re-quote and book for real. When actual cost exceeds the charged fee by more
than a configured threshold, log it and surface it in admin — after a month of
real data the table gets adjusted from actuals rather than guesses.

Fee table lives in `AppSetting` (`delivery.zones`), editable in admin:

| Band | Fee | Notes |
| --- | --- | --- |
| 0–5 km | RM 8 | placeholder — set from real quotes |
| 5–10 km | RM 12 | |
| 10–15 km | RM 18 | |
| > 15 km | unavailable | outside service radius |

- **Vehicle tier branches on cart contents, not just distance.** Whole cakes
  need a car/MPV (a motorcycle destroys them) at roughly double the
  motorcycle fee; slices, cookies and drinks can go by motorcycle. The table
  therefore carries a per-tier fee, and the cart picks the tier from the
  strictest product in it.
- Free delivery above a configurable order subtotal.

#### Build steps

1. **Address capture** at checkout (saved addresses on `Customer`, Google Places or free-text + map pin), delivery date/slot, phone for rider.
2. **Fee at checkout**: `POST /shop/delivery/quote` → resolve distance band + vehicle tier → return **our** fee; in the background call Lalamove *Get Quotation* to validate serviceability and store `estimatedCostCents`. Reject out-of-radius addresses here.
3. **`deliveryFeeCents` becomes a first-class order field.** `validateMemberOrderTotals` currently enforces `total = lines − discount` (`customers.service.ts:798`) and must become `total = lines − discount + deliveryFee`. **Loyalty points are earned on goods only, never on the delivery fee** — otherwise we pay rewards on money that passes straight to Lalamove. The fee is a separate line in finance reports and is *not* pushed to SalesPlay as a product.
4. **Dispatch after payment & readiness**: order goes `ready` → ops presses *Call rider* (or auto at slot − X min) → re-quote → Lalamove *Place Order* → store `deliveryOrderId`, share link. Never dispatch before `ready`: an early rider incurs waiting fees and may cancel.
5. **Webhook** (`ORDER_STATUS_CHANGED`, `DRIVER_ASSIGNED`, `ORDER_AMOUNT_CHANGED`) → update `Delivery` row → member timeline (assigned / picked up / delivered) + WhatsApp on *out for delivery* and *delivered*. `ORDER_AMOUNT_CHANGED` feeds the cost-variance log.
6. **Failure path**: rider not found / delivery failed → ops re-dispatch, or switch to pickup with a **partial refund of just the delivery fee** (Xendit partial refund). Design this before launch, not after the first bad Saturday.
7. **Wallet**: Lalamove is prepaid — a drained wallet fails dispatch silently. Add a balance check to the readiness report and an admin alert.
8. Sandbox account first, then production keys, behind `FEATURE_DELIVERY`.

**Open questions for Lalamove onboarding** (do not design around guesses):
exact quotation validity window, and whether the account gets scheduled-order
support in Malaysia or on-demand only.

**Acceptance:** fee table drives the charged price; Lalamove quote logged as cost; order tracked to delivered; partial-refund path tested; finance ledger shows delivery fee as its own line and points exclude it.

### Phase 3 — SalesPlay stock sync (13 Oct → 24 Oct)  ◐ small, high value

- On POS receipt ingest, map `PosReceiptLine.productCode` → catalog product via existing `salesplayProductCode` and **decrement today's `ProductStockDay`** (skip lines whose receipt is `originOnlineOrderId` — already decremented at checkout).
- Nightly reconcile: kitchen count vs (opening − POS − online); show variance in the kitchen screen.
- Optional: push stock to SalesPlay inventory if the account uses it (confirm in SalesPlay back office first; API coverage for inventory is thin).

### Phase 4 — CRM upsell & voice-of-customer (20 Oct → mid Nov)  ○ post-launch; small items can go early

Small (1–2 days each, safe to pull into October):
- **Dietary preferences & allergens**: `Customer.dietaryPreferences[]` (vegetarian, no-egg, halal-only, nut-allergy, low-sugar, …) captured at profile/onboarding; `Product.allergens[]` / `dietaryTags[]` in catalog; shop filter + warning at add-to-cart; segment filter in campaigns.
- **Feedback / complaints**: `Feedback(customerId, orderId?, kind: complaint|suggestion|praise, rating, text, photos?, status, adminReply)`. Member: "Rate this order" after `collected` / `delivered` + free-form from profile. Admin: inbox, assign, reply (email/WhatsApp), tag to product. Emits an audit log.

Medium:
- **Purchase-with-purchase**: new campaign template `PWP` — rule (cart contains X or subtotal ≥ Y) → offer add-on product at price Z; shown as a one-tap "Add for RM Z" card in cart; applied as a discounted order line so SalesPlay push and finance stay exact. Also `BUNDLE` (buy 2 get 1).
- **Customer 360** in admin: total spend by channel, orders, AOV, first/last purchase, favourite products, points/wallet, vouchers held, feedback, dietary flags, RFM segment. Cohort/RFM report + CSV export in **Customer reports**.
- Post-purchase automation: "haven't visited in 30 days" win-back is already a perks rule — wire it to a scheduled campaign run.

### Phase 5 — Native apps & channels (Nov 2026 →)  ○ after launch

Decision to make in Phase 0:

| Option | Effort | Notes |
| --- | --- | --- |
| **A. Capacitor wrap of `client-web`** (recommended for first store release) | ~1–2 weeks | Same code, store listing, push via FCM/APNs plugin, deep links. Gets you on both stores by December. |
| B. Continue Expo `mobile/` | 6–10 weeks | Native feel; needs a shared API client/types package (`packages/api-client`) extracted from `client-web` first, then rebuild auth, orders, rewards, profile. |

Either way, do these now so the door stays open: keep all business rules server-side (already true), don't rely on `localStorage` for anything but session token / draft cart, add a `/me/devices` push-token endpoint stub, and version the API (`/v1`).

Also in this phase: push notifications (order ready / delivery / campaigns), WhatsApp marketing (consent + templates), scheduled campaign runs, Lalamove multi-drop.

---

## 3. What "available in October" realistically means

- **Committed:** Phase 0 + Phase 1 — order online, pay, pick up, kitchen-controlled daily availability, ready notifications, PWA on the phone, SalesPlay/finance already consistent.
- **Likely:** Phase 3 (POS stock decrement) and the two small Phase 4 items (dietary prefs, feedback) — each is 1–2 days once Phase 1's schema lands.
- **Stretch:** Phase 2 delivery. Build the address + quote + dispatch path behind a feature flag (`FEATURE_DELIVERY`) so it can ship in the first November patch without blocking launch.
- **Not in October:** native store apps, PWP campaigns, Customer 360.

## 4. Risks to watch

1. WhatsApp template approval lead time (order-ready notifications depend on it) — submit in week 1; email fallback covers the gap.
2. JSON-file catalog/stock (Phase 0.1) — highest-probability production incident if left as is.
3. Lalamove production onboarding (KYC, wallet top-up) can take 1–2 weeks — start the application in parallel with Phase 1.
4. Two admin UIs (embedded + `admin-web`) — freeze new admin features to `admin-web` only to avoid double work.
