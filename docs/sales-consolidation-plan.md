# Sales Data Consolidation Plan — SalesPlay + Client Web + Bento → Member App

Goal: make the member-app the single place to see and manage all sales/financial
data across the three channels, and upgrade the admin dashboard for financial
management.

## 1. Current state (evaluated 2026-07-08)

| Channel | Where sales live today | In member-app DB? |
| --- | --- | --- |
| In-store POS (SalesPlay) | SalesPlay back office only | **No** — webhook receipts are converted to loyalty points and the receipt itself is discarded (`src/salesplay/salesplay-webhook.service.ts`) |
| Client web (cake shop) | `CustomerOrder` / `CustomerOrderLine` (+ Xendit `PaymentIntent`) | Yes — and already **pushed to SalesPlay** as online orders (`customers.service.ts` → `pushOnlineOrder`, `salesplaySystemUniqueId` stored) |
| Bento app | `BentoSubscription` + Xendit `PaymentIntent` | Yes — not pushed to SalesPlay |

So two of the three channels are already in our Postgres. Consolidation =
**ingest SalesPlay in-store receipts** + **build a unified reporting layer**.

SalesPlay API supports this (https://help.salesplay.com/help/rest-api-access-for-integration):

- `GET /receipts` — pull receipts, cursor pagination, max 250/page.
- Webhooks for **receipts** and **credit notes** (refunds) — receipts webhook is
  already wired into us (`/salesplay/webhook?token=…`).
- Rate limit: 300 requests / 300 seconds — more than enough (75k receipts per
  5-minute window at 250/page).

### Recommended architecture

Keep each channel's existing tables as the source of truth. Add **new tables
only for POS receipts**, then build a unified reporting service that queries
all three sources and tags each row with a `channel`
(`POS` | `ONLINE_SHOP` | `BENTO`). Do **not** copy online/bento orders into a
new "all sales" table — double bookkeeping drifts.

### ⚠️ Critical correctness issue: deduplication

Client-web orders are pushed into SalesPlay as online orders. When the POS
processes them they become SalesPlay **receipts** and will come back to us via
webhook/pull. Without dedupe, that revenue is **counted twice** (once as
`CustomerOrder`, once as POS receipt).

- Match inbound receipts against `CustomerOrder.salesplaySystemUniqueId` /
  `orderNumber` (`order_reference_number`) / `order_reference_id` and mark them
  `originOnlineOrderId` → excluded from POS channel totals.
- **Verify loyalty double-award**: online orders already earn points at
  completion (`customers.service.ts:891`); if the POS receipt for that same
  order carries the member, the webhook would award points again. Add the same
  origin check to the loyalty path.

---

## 2. Features to implement

### Phase 1 — Persist POS sales (webhook ingest)

New Prisma models:

- `PosReceipt`: `salesplayReceiptId` (unique), `receiptNumber`, `shopId`,
  `terminal`, `businessDate` (MYT date), `grossCents`, `discountCents`,
  `taxCents`, `netCents`, `paymentType`, `customerId?` (FK, matched via
  existing phone/salesplayCustomerId logic), `originOnlineOrderId?` (dedupe),
  `source` (`webhook` | `pull`), `rawPayload Json`, timestamps.
- `PosReceiptLine`: product code, name, qty, unit price, line total.
- `PosCreditNote`: refunds/voids (from credit-note webhook + pull).
- `SalesplaySyncState`: pull cursor, `lastPulledAt`, `lastWebhookAt`.

Changes:

- Extend `SalesplayWebhookService.processReceipt` to upsert the receipt
  (idempotent by `salesplayReceiptId` — SalesPlay retries up to 200×) before
  the loyalty logic. Always store `rawPayload`: the receipt JSON schema is not
  publicly documented, so capture-first, tighten field mapping after the first
  live payloads (debug logging for this already exists).
- Handle `credit_notes.*` webhook events (currently ignored).
- Implement the dedupe match above.

### Phase 2 — Pull sync, backfill, reconciliation ✅ (implemented)

Implemented in `salesplay-pull.service.ts` + GET pagination on
`SalesplayService`. Config flags (all default off): `SALESPLAY_PULL_ENABLED`,
`SALESPLAY_RECONCILE_ENABLED`, `SALESPLAY_RECONCILE_INTERVAL_HOURS` (24),
`SALESPLAY_RECONCILE_LOOKBACK_DAYS` (3), `SALESPLAY_BACKFILL_FROM` (defaults to
`salesStartDate`), `SALESPLAY_PULL_PAGE_SIZE` (250), and undocumented-API
overrides `SALESPLAY_PULL_CURSOR_PARAM` / `SALESPLAY_PULL_FROM_PARAM`. Admin
endpoints: `GET /admin/reports/pos/sync-health`, `POST /admin/reports/pos/pull`.

Original spec:

- `SalesplayPullService`: `GET /receipts` with cursor pagination.
  - One-time **historical backfill** (decide window — see open decisions).
  - **Nightly reconciliation** to catch missed webhooks (webhooks are
    token-in-URL only, unsigned; the pull is our integrity net).
  - Background loop via the same `setInterval` pattern as the mailer
    dispatcher (`mailer.service.ts:56`), or adopt `@nestjs/schedule`.
- Sync-health admin endpoint: last webhook at, last pull at, receipts ingested
  today, unmatched-customer count, dedupe hits.

### Phase 3 — Unified reporting API ✅ (implemented)

Implemented in `finance-report.service.ts`. Endpoints:
`GET /admin/reports/finance-overview` (per-channel totals, merged revenue
series, payment-method mix, refunds, top products, prior-period deltas) and
`GET /admin/reports/transactions` (paged UNION ledger across all three
channels with date/channel/method/customer/amount filters + CSV export).
`daily-commerce` now returns a per-channel breakdown (`channels` +
`allChannels*`) while keeping the original online-shop fields for
compatibility. Verified end-to-end against the dev DB (boot, all routes mapped,
POS receipt → correct totals/series/AOV/top-products, then cleaned up).

Notes / deviations:
- Bento has no refund timestamp (only `createdAt` + `status`), so bento refunds
  are attributed to the subscription's purchase date.
- POS buckets on its MYT business date; online/bento bucket on UTC timestamps
  (matching the existing analytics). Range totals are unaffected; day-boundary
  bucketing can differ by up to 8h.
- The `pos`/`all` categories on the older `sales-analytics` endpoint were not
  added — `finance-overview` supersedes that need.

Original spec:

- Extend `sales-analytics` categories: `pos` and `all` (currently
  `cake` | `bento`), with channel breakdown in the series.
- New `GET /admin/reports/finance-overview`: consolidated revenue series
  (day/week/month), per-channel totals, payment-method breakdown, refunds,
  AOV, top products across channels, prior-period comparison.
- New `GET /admin/reports/transactions`: unified paged ledger across the three
  sources with `channel` tag; filters: date range, channel, payment method,
  customer, amount; CSV/XLSX export (reuse `exceljs` + export-job infra).
- Extend **daily commerce close** to all channels (today it only covers cake
  `CustomerOrder`s) and compute the business day in `Asia/Kuala_Lumpur`
  consistently (POS trades on MYT days; `DailySalesClose` is UTC today).

### Phase 4 — Dashboard "Finance" UI ✅ (implemented)

New "Finance" nav group in the admin dashboard with four views: Revenue
overview (KPI strip with prior-period deltas, stacked-by-channel bar chart,
channel/payment-method breakdowns, cross-channel top products), All
transactions (unified paged ledger with channel/amount filters + CSV export),
Daily close (all-channel day totals + close-books action), and POS sync health
(connection state, last webhook/pull, manual reconcile/backfill buttons).
Registered in both the built-in default config and `admin-dashboard.config.json`
(whitelist). Verified in the browser against the dev DB with seeded receipts:
totals, chart, filters, pagination, close-day, and pull buttons all exercised;
demo data removed afterwards.

Timezone fix shipped with this phase: `pos_receipts.business_date` is a
Postgres DATE — comparing it against timestamp params casts at the *DB
server's* timezone, which shifted every POS day filter by 8h on a MYT server.
All business-date filters now use `(param AT TIME ZONE 'UTC')::date`, and the
finance-overview series buckets are computed as deterministic UTC instants so
the three channels always merge onto the same period regardless of server tz.

Original spec:

New nav group in `src/ui/admin-dashboard.controller.ts`:

- **Revenue overview** — KPI tiles (total revenue, revenue per channel,
  orders, AOV, refunds), stacked-by-channel trend chart with day/week/month
  buckets and vs-previous-period deltas.
- **Transactions** — the unified ledger with filters, drill-down to line
  items, and export buttons.
- **Daily close** — all-channel daily summary (POS + online + bento) with the
  close-books action; replaces/extends the current cake-only daily commerce
  view.
- **Refunds** — credit notes + bento refunds + Xendit-refunded intents in one
  list.
- **Sync health** — SalesPlay connection status, last webhook/pull, unmatched
  receipts, manual "pull now" button.

### Phase 5 — Hardening & extras

- Alert (email via new mailer) when a business day passes with zero POS
  receipts (webhook silently broken).
- Product mapping table SalesPlay product code ↔ shop-catalog product, for
  true cross-channel product-level reporting.
- Monthly finance export (P&L-style summary) as XLSX.
- Later: settlement reconciliation of Xendit payouts vs recorded online sales.

---

## 3. Open decisions

1. **Backfill window** — how far back to import SalesPlay receipts (all
   history vs. from `salesStartDate` reporting cutoff)?
2. **Bento → SalesPlay push?** Recommend **no** — bento stays app-only;
   pushing it to POS would just create more dedupe surface.
3. Product-level cross-channel reporting needed at launch, or totals first?
4. Refund handling depth at launch (display-only vs. affecting closed days).

## 4. Risks

- SalesPlay receipt JSON shape undocumented → Phase 1 is deliberately
  capture-first (store raw payload, refine mapping from live data).
- Unmatched walk-in receipts (no member) are normal — they still count toward
  revenue, only the customer link is null.
- Rate limits are generous; pull sync is not at risk.

## 5. Rough effort

| Phase | Effort |
| --- | --- |
| 1 — Webhook ingest + models + dedupe | 2–3 days |
| 2 — Pull sync + backfill + reconciliation | 2 days |
| 3 — Unified reporting API | 2–3 days |
| 4 — Finance dashboard UI | 3–4 days |
| 5 — Hardening | 1–2 days |
