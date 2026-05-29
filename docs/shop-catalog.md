# Shop catalog (source of truth)

Product data for **mojamaison.com** and the member shop is owned by this app.

## Edit here (one place)

| File | Purpose |
|------|---------|
| `data/shop-catalog.products.json` | All products, prices, variants, images paths |
| `data/shop-catalog.layout.json` | Shop sections + homepage featured product ids |
| `data/home-popular.json` | Member app home “popular” strip (max 5 ids) |

`config/shop-catalog.*.json` are **seed copies** for new environments. After editing `data/`, you may mirror to `config/` for git backup.

Product images are **not** stored here — only paths like `/images/products/foo.jpg`. Upload files to **moja-sites** `public/images/products/`.

## Public API (moja-sites reads this)

- `GET /shop/catalog/products`
- `GET /shop/catalog/layout`
- `POST /shop/cart-handoff` — checkout handoff from storefront

Default local URL: `http://127.0.0.1:3000` (set `PORT` in `.env` if different).

## One-time import from legacy moja-sites JSON

```bash
npm run catalog:import-from-sites
```

Reads `../moja-sites/config/products.catalog.json` and writes both `config/` and `data/`.

## Refresh moja-sites fallback snapshot

After changing `data/`:

```bash
cd ../moja-sites
npm run catalog:pull
```

Updates `moja-sites/config/products.catalog.json` (used only when the API is down or at build time).

## Production

1. Deploy **moja-member-app** with catalog API reachable on HTTPS.
2. On **moja-sites** set `MEMBER_API_BASE_URL=https://your-api-host` (no trailing slash).
3. Do **not** set `CATALOG_SOURCE=local` unless you intentionally want JSON-only mode.
