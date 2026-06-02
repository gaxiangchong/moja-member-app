# How to update a product image

The simple, one-screen flow.

> **TL;DR**: Open the admin dashboard → Shop catalog → click the product → click **Upload image** → done. The same image is then served to **both** the member app and moja-sites.

---

## What changed (June 2026)

You no longer need to:

- ❌ Drop image files into `public/images/products/` and redeploy.
- ❌ Type or paste an `imageUrl` path.
- ❌ Edit any JSON.

Instead:

- ✅ Pick a file from your PC in the admin dashboard.
- ✅ Click **Upload image**.
- ✅ The new picture appears immediately on the member app and (on next refresh) on moja-sites.

The "Optional catalog JSON upload" file picker on the **Sync from moja-sites** screen has also been removed — sync always reads from the fixed server path / `MOJA_SITES_CATALOG_URL`.

---

## Step-by-step

### 1. Open the product

1. Go to **`https://api.mojamaison.com/admin-dashboard`** (or `http://localhost:3153/admin-dashboard` in dev) and sign in.
2. Left side nav → **Shop catalog → Products**.
3. Find the product in the list and click the **Edit** (pencil) icon — or just click the row.

### 2. (First time only) Save the product

If you're creating a brand-new product, fill in the basic fields (Name, Category, etc.) and click **Save product** first. The Upload button needs the product to exist so it knows where to attach the image.

For existing products, skip this step.

### 3. Upload the new image

1. Scroll to the **Product image** section. You'll see a thumbnail (or "No image") on the left and the file controls on the right.
2. Click the file picker (or drag & drop) and select your image.
3. Click **Upload image**.
4. After ~1 second you'll see "Image uploaded." and the thumbnail will refresh.

That's it. The new image is now live.

> **Image guidelines**
> - Format: PNG, JPEG, WEBP, or GIF.
> - Size: max **5 MB**.
> - Recommended dimensions: ~**1200×1200 px** for whole cakes, ~**800×800 px** for slices/drinks.
> - Compress with [Squoosh](https://squoosh.app/) if your file is heavy.

### 4. Verify

1. Open the member app on the **Shop** tab.
2. Hard-refresh (Ctrl+Shift+R / Cmd+Shift+R).
3. The new image should appear on the product card.

---

## Removing an image

1. Open the product in the admin dashboard.
2. Under **Product image**, click **Remove image**.
3. Confirm the prompt. The image disappears and the product falls back to "no image".

---

## How does this work for both moja-sites and the member app?

The uploaded file is stored on the API server at:

```
data/uploads/products/<product-id>-<timestamp>.<ext>
```

…and exposed publicly at:

```
https://api.mojamaison.com/uploads/products/<filename>
```

The catalog stores the relative path `/uploads/products/<filename>` in the product's `imageUrl` field.

- The **member app** prefixes that with the API base URL via `resolveApiAssetUrl(...)` and renders it.
- **moja-sites** can either:
  - read the same URL directly (it's a public asset), or
  - run **Sync from moja-sites** → **Apply sync** to pull the URL into its own catalog.

Either way, the image lives in **one place** (the member API) and both surfaces read from it.

---

## Persistence note (production deployments)

The upload directory `data/uploads/` is **server-local**. On hosts with ephemeral filesystems (Render, Railway, Fly.io, etc.) you must mount a persistent disk at `data/` or your uploads will disappear on the next deploy.

See [`DEPLOYMENT.md` § "Persistent storage for `data/`"](./DEPLOYMENT.md) for the exact volume-mount config per host.

If your existing product images live in `public/images/products/...` (the legacy committed-file path), they keep working — they're served at `https://api.mojamaison.com/images/products/<filename>` from the repo. You only need to switch to **Upload image** when you want to change them.

---

## Sync from moja-sites (manual edits always win)

The admin dashboard → **Shop catalog → Sync from moja-sites** pulls a catalog file (uploaded once via the admin UI, or fetched from `MOJA_SITES_CATALOG_URL`) into the live member catalog.

### How conflicts are resolved

Any field you have edited in the admin dashboard — price, photo, variants, badge, sold-out flag, etc. — is **automatically locked** for that product. Sync will never overwrite locked fields. You'll see:

- A 🔒 **EDITED** badge next to the product name in the catalog table.
- A "Manual edits protected from sync" panel inside the product edit form, listing exactly which fields are locked.
- In the Preview Sync table: any locked diff is shown struck-through with a `LOCKED` tag and the row is marked `PROTECTED` instead of `UPDATE`. Apply Sync will leave it untouched.

This means:

- **Update a price in admin → run sync** → your price stays, sync touches everything else.
- **Upload a new product photo in admin → run sync** → your photo stays, sync still updates other products.
- **You never need to "win the race" with sync** — admin edits are always the source of truth once made.

### Letting sync take over a product again

If you decide a product should follow whatever is in moja-sites again (e.g. you no longer want a custom price):

1. Open the product in **Shop catalog → Edit product**.
2. In the yellow **"Manual edits protected from sync"** panel near the bottom, click **"Allow sync to overwrite this product"**.
3. The next sync will refresh that product from moja-sites.

You can also reset all overrides programmatically by calling `POST /admin/shop-catalog/products/:id/reset-sync-overrides`.

### Catalog source priority

The API looks for the moja-sites catalog in this order:

1. `MOJA_SITES_CATALOG_URL` — public JSON URL (overrides everything else when reachable).
2. `data/products.catalog.json` — uploaded once via the admin UI; lives on your persistent disk.
3. `MOJA_SITES_CATALOG_PATH` — absolute filesystem path on the API host.
4. `config/products.catalog.json` — committed in the repo (if any).
5. `../moja-sites/config/products.catalog.json` — sibling-repo fallback for local dev.

For Render: just upload the file once via the admin UI (no env vars needed).

---

## Troubleshooting

**Upload button does nothing / "Save the product first" appears**
You're on a brand-new product that hasn't been saved yet. Click **Save product**, then upload.

**"Unsupported image type"**
Convert to PNG, JPEG, WEBP, or GIF.

**"Image too large"**
Compress to under 5 MB. Use Squoosh or `magick mogrify -resize 1200x1200 -quality 85`.

**Image still old after upload**
Hard-refresh the browser (Ctrl+Shift+R). The API responds with a fresh URL on every upload (it includes a timestamp), so the browser cache should not be the issue — it's almost always a stale tab.

**Image disappeared after a redeploy**
Your server doesn't have a persistent volume on `data/`. See [`DEPLOYMENT.md`](./DEPLOYMENT.md).

**moja-sites still shows the old image**
moja-sites caches its own catalog. Either redeploy moja-sites or run **Sync from moja-sites → Apply sync** if you've made the member API the source of truth.

---

## Reference: file & code locations

| Concern | Path |
|---|---|
| Uploaded files on disk | `data/uploads/products/` |
| Public URL prefix | `/uploads/products/` *(served by `src/main.ts`)* |
| Live catalog | `data/shop-catalog.products.json` |
| Seed defaults (in git) | `config/shop-catalog.products.json` |
| Upload route | `POST /admin/shop-catalog/products/:id/image` |
| Clear route | `DELETE /admin/shop-catalog/products/:id/image` |
| Service code | `src/shop-catalog/shop-catalog.service.ts` (`attachProductImage`, `clearProductImage`) |
| Admin UI | `src/ui/admin-dashboard.controller.ts` (`scImageFile`, `scImageUploadBtn`, `scImageClearBtn`) |
