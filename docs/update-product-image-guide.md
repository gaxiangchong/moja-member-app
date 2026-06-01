# How to update a product image

Quick, no-jargon recipe for swapping the picture used on a shop product (whole cakes, slices, drinks, specials).

There are two parts to a product image:

1. **The image file** — lives on the API server's filesystem.
2. **The image URL** stored on the product — points at that file (or any external URL).

Most of the time you only need to deal with one of them.

---

## TL;DR — three common scenarios

| Scenario | What to do |
|---|---|
| **Same product, fresh photo, OK to keep filename** | Replace the file in `public/images/products/<filename>` and redeploy. No catalog edit needed. |
| **Same product, new filename (e.g. `_v3`)** | Add the new file to `public/images/products/`, then update the **Image URL** in the admin dashboard for that product. |
| **Use a hosted image (CDN, Cloudinary, etc.)** | Just paste the full `https://…` URL into the product's **Image URL** field in the admin dashboard. No file upload. |

---

## Where things live

### Image files (on the API server)

```
moja-member-app/
└── public/
    └── images/
        └── products/
            ├── caramel_macadamia_cake_v2.png
            ├── lemon_yuzu_cake_v2.png
            ├── matcha_marmalade.jpeg
            └── …
```

These are static files served by the API at:

```
https://<your-api-host>/images/products/<filename>
```

> Locally during dev, this is `http://localhost:3153/images/products/<filename>`.

### Product → image link (in the database / catalog JSON)

Each product row has an `imageUrl` field (and optionally an `images[]` gallery), e.g.:

```json
{
  "id": "caramel-espresso-gateau",
  "name": "Caramel Espresso Gateau",
  "imageUrl": "/images/products/caramel_macadamia_cake_v2.png",
  "images": [
    { "src": "/images/products/caramel_macadamia_cake_v2.png", "alt": "..." },
    { "src": "/images/products/caramel_macadamia_cake.png",    "alt": "..." }
  ]
}
```

Live data on the server: `data/shop-catalog.products.json`
Seed defaults in repo: `config/shop-catalog.products.json`

You normally **don't edit those JSON files by hand** — use the admin dashboard (Method A below).

---

## Method A — Update via Admin Dashboard (recommended)

Use this when the image file is **already on the server** (or you're using an external URL).

### Step 1. Add the image file to the server (if it's a new picture)

If you're keeping the existing filename, skip this step.

If it's a new file:

1. Place the new image in `public/images/products/` of the API repo, e.g.
   `public/images/products/caramel_espresso_gateau_v3.png`.
2. Commit it (recommended — these are versioned with the app), push, and **redeploy the API** so the file is on the running server.
3. Sanity-check it's served by opening, e.g.
   `https://<your-api-host>/images/products/caramel_espresso_gateau_v3.png`
   You should see the image. (No "404" / "Cannot GET" page.)

> File tips
> - Recommended size: ~**1200×1200** for whole cakes, ~**800×800** for slices/drinks.
> - Format: `.png` or `.jpeg` (`.webp` works too if your CDN/browser supports it).
> - Keep it under ~500 KB if possible. Compress with [Squoosh](https://squoosh.app/) or `imagemagick`.
> - Filename: lowercase, ASCII only, words separated with `_` or `-`. No spaces.

### Step 2. Open the admin dashboard

1. Go to `https://<your-api-host>/admin-dashboard` (or `http://localhost:3153/admin-dashboard` in dev).
2. Sign in with your admin credentials.
3. In the left side nav, click **Shop catalog → Products**.

### Step 3. Edit the product

1. Find the product row in the list and click the **Edit** (pencil) icon, or click the row.
2. Locate the **Image URL** field.
3. Set it to one of:
   - **Local file**: `/images/products/<your-filename>` — e.g. `/images/products/caramel_espresso_gateau_v3.png`.
   - **External URL**: `https://cdn.example.com/cakes/caramel-v3.jpg`.
4. Click **Save**. You should see "Updated." next to the save button.

### Step 4. Verify

1. Open the member app (`client-web`) on the **Shop** tab.
2. Hard-refresh the page (Cmd/Ctrl+Shift+R) to bust the cache.
3. The new image should appear on the product card and product detail page.

If it doesn't show up, see [Troubleshooting](#troubleshooting) below.

---

## Method B — Replace the file in place (no admin edit)

Use this when the **filename stays the same** and you just want a fresher photo.

1. In the API repo, replace the file:
   `public/images/products/<existing-filename>` ← new image.
2. Keep the same filename (e.g. still `caramel_macadamia_cake_v2.png`).
3. Commit + push + redeploy the API.
4. In the member app, hard-refresh. Browsers cache by URL, and the URL is unchanged, so users may still see the old image until their cache expires (currently `Cache-Control: max-age=86400` = 1 day).

> Tip: If you need to push a new image to existing users immediately, use Method A with a **new filename** instead. Changing the URL forces the browser to download the new file.

---

## Method C — Update the gallery (`images[]`)

The optional `images[]` array drives the multi-image gallery on the product detail page.

Right now the admin dashboard form only edits the **primary `imageUrl`**. To change the gallery you have two options:

1. **Re-import from moja-sites**: Admin dashboard → **Shop catalog → Sync from moja-sites**. The sync replaces `imageUrl` and `images[]` from the source `products.catalog.json`. Useful when the canonical product data lives in the shop site repo.
2. **Edit the live JSON directly** (advanced): On the server, edit
   `data/shop-catalog.products.json` and update the `images` array for the product, then restart the API. Make a backup first.

---

## Method D — Use an external image (no upload at all)

Useful for one-offs, A/B tests, or when you can't redeploy.

1. Upload the image somewhere public (Cloudinary, S3, your CDN, even a public Google Drive direct link).
2. Copy the full **`https://…`** URL.
3. Admin dashboard → product → **Image URL** → paste the full URL → **Save**.

The client recognises any URL starting with `http://` or `https://` and uses it directly.

---

## Troubleshooting

**The new image doesn't show up after saving**
- Hard-refresh the browser (Cmd/Ctrl+Shift+R).
- Open the URL in a new tab to confirm the file exists:
  `https://<api-host>/images/products/<filename>`. If you get 404, the file isn't on the server — check Step 1.
- Check the **Image URL** field has no typo (case matters on Linux servers).

**Image is rotated / squished / huge**
- Re-export at a square aspect (1:1) at 1200×1200 max.
- Strip EXIF orientation (Squoosh or `magick mogrify -auto-orient`).

**Image disappears after a redeploy**
- Files in `public/images/products/` are committed to git, so they survive redeploys.
- Files uploaded through the admin (home ads, voucher images) live in `data/uploads/` which is **ephemeral** on some hosts (Render, Railway, Fly.io). For those, mount a persistent volume — see `docs/DEPLOYMENT.md` § "Persistent storage for `data/`".

**Sync from moja-sites overwrote my custom image**
- The sync pulls `imageUrl` from `products.catalog.json` in the shop site repo. Either update it there too, or use the sync's **dry-run preview** to skip the `imageUrl` field on that product.

---

## Reference: where the code reads the image

For the curious / for reviewers:

- API serves files: `src/main.ts` registers `app.useStaticAssets(public/images, prefix: /images/)`.
- Product type: `src/shop-catalog/shop-catalog.service.ts` (`ShopCatalogProduct.imageUrl`).
- Live catalog: `data/shop-catalog.products.json` (created from `config/shop-catalog.products.json` on first boot).
- Member client resolves to absolute URL: `client-web/src/api.ts` → `resolveApiAssetUrl(p.imageUrl)`.
- Admin dashboard form: `src/ui/admin-dashboard.controller.ts` → field `scImageUrl`.
