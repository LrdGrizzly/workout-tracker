/* ═══════════════════════════════════════════
   WORKOUT TRACKER — SERVICE WORKER
   Version is injected by the app on registration
   via the SW_VERSION query parameter.

   Strategy: cache-first for the app shell,
   pass-through for all external APIs.
   Cache is named per-version so deploys bust
   stale caches automatically.
═══════════════════════════════════════════ */

// Derive cache name from the version query param injected at registration time.
// Falls back to 'workout-tracker-dev' during local development.
const VERSION    = new URL(self.location).searchParams.get('v') || 'dev';
const CACHE_NAME = `workout-tracker-${VERSION}`;

// Domains that must never be cached — always go to network.
const PASSTHROUGH = [
  'googleapis.com',
  'accounts.google.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
  'gstatic.com',
];

function isPassthrough(url) {
  return PASSTHROUGH.some(domain => url.includes(domain));
}

// ── Install: pre-cache the app shell ─────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(['./']))
      .catch(err => console.warn('[SW] Pre-cache failed:', err))
  );
  // Activate immediately — don't wait for existing tabs to close
  self.skipWaiting();
});

// ── Activate: delete caches from previous versions ───────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('workout-tracker-') && key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    )
  );
  // Take control of all open clients immediately
  self.clients.claim();
});

// ── Fetch: cache-first with network fallback ─────────────────────
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Never intercept non-GET requests or passthrough domains
  if (e.request.method !== 'GET' || isPassthrough(url)) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      // Stale-while-revalidate: serve cache instantly,
      // update cache in background for next visit
      const networkFetch = fetch(e.request)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return res;
        })
        .catch(() => null);

      return cached || networkFetch;
    })
  );
});

// ── Message: force update from app ───────────────────────────────
// The app can post { type: 'SKIP_WAITING' } to force an update
// without the user needing to close all tabs.
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
