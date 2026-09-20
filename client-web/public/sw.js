/* Moja member app service worker.
 *
 * Strategy (kept deliberately small — no build plugin):
 *  - App shell (`/`, manifest, icons): precached on install, refreshed on activate.
 *  - Navigations: network-first, fall back to the cached shell when offline.
 *  - Hashed build assets (`/assets/*`): cache-first (immutable by filename).
 *  - Product / upload images from the API origin: stale-while-revalidate.
 *  - Everything else (API JSON, auth, payments): network only — never cached.
 *
 * Bump CACHE_VERSION when the precache list changes; `vite build` rewrites
 * the asset hashes, and the activate step drops old caches.
 */
const CACHE_VERSION = 'moja-shell-v1';
const IMAGE_CACHE = 'moja-images-v1';
const SHELL_URLS = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
];
const IMAGE_CACHE_LIMIT = 120;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_VERSION && k !== IMAGE_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isImageRequest(url) {
  return (
    url.pathname.startsWith('/images/') ||
    url.pathname.startsWith('/uploads/') ||
    /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(url.pathname)
  );
}

async function trimCache(name, limit) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((k) => cache.delete(k)));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Navigations: network first, shell fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put('/', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  const sameOrigin = url.origin === self.location.origin;

  // Hashed build assets: cache first.
  if (sameOrigin && url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
            return res;
          }),
      ),
    );
    return;
  }

  // Precached shell files (manifest, icons).
  if (sameOrigin && SHELL_URLS.includes(url.pathname)) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
    return;
  }

  // Images (same origin or the API origin): stale-while-revalidate.
  if (isImageRequest(url) && !req.headers.get('authorization')) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok || res.type === 'opaque') {
              cache.put(req, res.clone()).then(() => trimCache(IMAGE_CACHE, IMAGE_CACHE_LIMIT)).catch(() => {});
            }
            return res;
          })
          .catch(() => hit);
        return hit || network;
      }),
    );
    return;
  }

  // API and everything else: network only (default browser behaviour).
});
