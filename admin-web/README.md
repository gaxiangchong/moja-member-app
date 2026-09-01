# Moja Admin (admin-web)

New admin dashboard, replacing the legacy server-rendered `GET /admin-dashboard`
page (`src/ui/admin-dashboard.controller.ts`, ~11.9k lines of inline HTML/JS in
one NestJS controller). This app talks to the same NestJS API as everything
else in this repo — no new backend endpoints were added for the migration;
this app just calls the existing `src/admin/*` controllers from real React
components instead of hand-rolled DOM manipulation.

The legacy dashboard keeps running unchanged at `/admin-dashboard` throughout
the migration — nothing here is a breaking change.

## Run locally

1. Start the API (from repo root):

   ```bash
   npm run start:dev
   ```

2. Install and run admin-web:

   ```bash
   cd admin-web && npm install && npm run dev
   ```

   Or from repo root: `npm run admin:dev`

3. Open [http://localhost:5196](http://localhost:5196) and sign in with an
   `AdminUser` email/password (same credentials as the legacy dashboard).

## Environment

Copy `.env.example` to `.env`:

```env
VITE_API_BASE_URL=http://localhost:3153
```

## Migration status

Sidebar navigation mirrors the legacy dashboard's full menu structure
(`src/menu.ts`) so the target end-state is visible even before every section
is migrated. Anything not yet in `IMPLEMENTED_VIEWS` (`src/menu.ts`) shows a
"not migrated yet" placeholder linking back to the legacy dashboard.

Migrated so far:
- Dashboard → Overview
- Customers → All customers

Suggested migration order (smallest/most self-contained first — see the
research summary this was planned from): Customers (orders), Reports,
Finance, Campaigns/Loyalty/Vouchers, Mailer, Employees, Audit, then the two
largest sections last: Settings (shop catalog/layout/popular items/home ads)
and Bento (menu/pricing/orders/scheduling/vouchers).

Menu group/item visibility is read from the same `admin-dashboard.config.json`
the legacy dashboard already uses (via `GET /admin-dashboard/config.json`),
so anything ops has hidden there stays hidden here too.
