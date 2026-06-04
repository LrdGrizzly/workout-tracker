/* ===========================================
   WORKOUT TRACKER - SERVICE WORKER

   Version is injected by the app on registration via
   the v query parameter.

   Strategy: cache-first for the app shell, pass-through
   for external APIs. Cache is named per-version so deploys
   bust stale caches automatically.
=========================================== */

const VERSION = new URL(self.location).searchParams.get('v') || 'dev';
const CACHE_NAME = `workout-tracker-${VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
];

// Domains that must never be cached - always go to network.
const PASSTHROUGH = [
  'googleapis.com',
  'accounts.google.com',
  'gstatic.com',
];

function isPassthrough(url) {
  return PASSTHROUGH.some(domain => url.includes(domain));
}

// Install: pre-cache the app shell.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(err => console.warn('[SW] Pre-cache failed:', err))
  );
  self.skipWaiting();
});

// Activate: delete caches from previous versions.
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
  self.clients.claim();
});

// Fetch: cache-first with network refresh in the background.
self.addEventListener('fetch', e => {
  const url = e.request.url;

  if (e.request.method !== 'GET' || isPassthrough(url)) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      const networkFetch = fetch(e.request)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return res;
        })
        .catch(() => null);

      if (cached) return cached;
      return networkFetch.then(res => res || caches.match('./'));
    })
  );
});

// Message: force update from app.
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
