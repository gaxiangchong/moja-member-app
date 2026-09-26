# bento-web — deprecated (26 Sep 2026)

This front-end app is **no longer developed or run**. Nothing has been deleted;
it is disabled at the edges so it stops appearing in day-to-day work.

## What was switched off

| Where | Change |
|---|---|
| `.claude/launch.json` | `bento-web` dev-server entry removed (`admin-web` on 5196 added in its place) |
| `scripts/performance-baseline.mjs` | bento build, static server and `bento-landing` page commented out — `npm run perf:baseline` now measures `client-web` only |

## What was deliberately left alone

**The bento backend is still running**, and must stay that way while any
subscription is live (there is at least one `ACTIVE` subscription):

- `src/bento/`, `src/bento-vouchers/` and the `BentoModule` wiring in `app.module.ts`
- Bento tables: `bento_subscriptions`, `bento_packages`, `bento_delivery_days`,
  `bento_weekly_opt_ins`, `bento_discount_vouchers`
- Bento admin screens (overview, orders, menu, pricing, operations, vouchers)
  and the bento pickup panel in `ops-queue-web`
- Bento revenue in the cross-channel finance reports — removing it would change
  historical totals
- `npm run bento:dev` / `npm run bento:build` in the root `package.json`, which
  still work if the app needs to be run once
- CORS origin `http://localhost:5195` and the bento payment-redirect fallback in
  `payments.service.ts`

## To bring it back

Restore the `bento-web` entry in `.claude/launch.json` and uncomment the three
bento lines in `scripts/performance-baseline.mjs`.

## To retire it fully (later)

Only once no subscription is active and the reporting history is no longer
needed live: delete `bento-web/`, remove the bento modules and admin views, and
decide separately whether to keep the bento tables for historical finance
reporting (recommended) or archive them.
