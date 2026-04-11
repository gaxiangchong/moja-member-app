# Operations — order queue (customer display)

Single-purpose web app for your **operations / kitchen line**: shows **new member shop orders** as large cards (pickup window, lines, total), **Done** marks them complete, and a **history** list opens **full transaction detail** in a new browser window.

## Run (development)

1. On the API server, set **`OPS_QUEUE_API_KEY`** (see repo root `.env.example`) and include this app’s origin in **`CLIENT_WEB_ORIGIN`** (e.g. `http://localhost:5194`).
2. Apply DB migrations so `customer_orders.completed_at` exists.
3. **Credentials:** the app saves the key in **`localStorage`** (not `sessionStorage`) so **“Open detail”** tabs on the same browser origin can call the API. Optional: set **`VITE_OPS_API_KEY`** in `ops-queue-web/.env` to the same value as the server key for auto-fill (never commit real secrets).
4. Install and start this app:

```bash
cd ops-queue-web
npm install
npm run dev
```

Open **http://localhost:5194**, paste the API base URL and ops key, then **Connect**.

## Production

- Build static assets: `npm run build`, serve `dist/` from any static host or CDN.
- Point **`VITE_API_BASE_URL`** at your public API URL at build time (or rely on same-host reverse proxy).
- Use HTTPS and a long random **`OPS_QUEUE_API_KEY`**; treat it like a shared staff secret (rotate if a device is lost).

## API (same Nest app)

| Method | Path | Header |
|--------|------|--------|
| `GET` | `/ops/queue/orders` | `x-ops-api-key: <OPS_QUEUE_API_KEY>` |
| `GET` | `/ops/queue/orders/:id` | same |
| `PATCH` | `/ops/queue/orders/:id/complete` | same |

Pending orders have `status = placed`. **Done** sets `status = completed` and `completedAt`.
