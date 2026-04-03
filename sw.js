/* RevisionLog Service Worker — v1
   GitHub Pages base: /revision-log
   Cache strategy:
     - Fonts (Google)  → Stale-While-Revalidate
     - Own assets      → Cache First
     - Everything else → Network First with cache fallback
*/

const CACHE_NAME   = 'revisionlog-v1';
const BASE         = '/revision-log';

const APP_SHELL = [
  `${BASE}/index.html`,
  `${BASE}/manifest.json`,
  `${BASE}/icons/icon-192.png`,
  `${BASE}/icons/icon-512.png`,
  `${BASE}/icons/icon-maskable-192.png`,
  `${BASE}/icons/icon-maskable-512.png`,
];

/* ── INSTALL ── pre-cache app shell ────────────────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // allSettled — one 404 won't abort the whole install
      Promise.allSettled(
        APP_SHELL.map(url =>
          cache.add(url).catch(err =>
            console.warn(`[SW] Failed to cache ${url}:`, err)
          )
        )
      )
    ).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE ── delete stale caches ───────────────────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH ─────────────────────────────────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s) schemes
  if (!url.protocol.startsWith('http')) return;

  // ── Strategy 1: Google Fonts → Stale-While-Revalidate ──────────────────
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // ── Strategy 2: Own origin + base path → Cache First ───────────────────
  if (
    url.origin === self.location.origin &&
    url.pathname.startsWith(BASE)
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // ── Strategy 3: Everything else → Network First with cache fallback ─────
  event.respondWith(networkFirst(request));
});

/* ── STRATEGIES ─────────────────────────────────────────────────────────────── */

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline and not cached — return app shell for navigation requests
    if (request.mode === 'navigate') {
      const shell = await caches.match(`${BASE}/index.html`);
      if (shell) return shell;
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function staleWhileRevalidate(request) {
  const cache  = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || await fetchPromise || new Response('', { status: 503 });
}

/* ── MESSAGE HANDLER ────────────────────────────────────────────────────────── */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() =>
      console.log('[SW] Cache cleared')
    );
  }
});
