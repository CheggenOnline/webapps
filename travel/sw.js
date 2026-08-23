/* Service worker for the Travel app only.

   Scope is this folder. It is registered from ./sw.js so its scope is
   /webapps/travel/ — never place a service worker at the repo root, because its
   scope would swallow every sibling app on this origin.

   CACHE_VERSION must match ../travel/js/config.js and must be bumped on every
   deploy, or installed users keep serving the old files. */

const CACHE_VERSION = 'v2';
const CACHE = `webapps.travel.${CACHE_VERSION}`;
const CACHE_PREFIX = 'webapps.travel.';

const ASSETS = [
  './',
  './index.html',
  './app.css',
  './manifest.webmanifest',
  './js/main.js',
  './js/config.js',
  './js/store.js',
  './js/model.js',
  './js/derive.js',
  './js/parse.js',
  './js/api.js',
  './js/ics.js',
  './js/dom.js',
  './js/ui/timeline.js',
  './js/ui/lists.js',
  './js/ui/capture.js',
  './js/ui/review.js',
  './js/ui/vault.js',
  './js/ui/suggestions.js',
  './js/ui/groups.js',
  './js/ui/settings.js',
  './js/ui/editors.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    /* One bad URL must not fail the whole install. */
    await Promise.all(ASSETS.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  /* Anything off this origin — the Anthropic API above all — is never touched. */
  if (url.origin !== self.location.origin) return;
  /* Only this app's own folder. */
  if (!url.pathname.startsWith(new URL('./', self.location.href).pathname)) return;

  /* Navigations: fresh when online, cached when not, so a deploy is picked up. */
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('./index.html', fresh.clone()).catch(() => {});
        return fresh;
      } catch (e) {
        const cache = await caches.open(CACHE);
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  /* Assets: cache first, because they are versioned by the cache name. */
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok && fresh.type === 'basic') cache.put(req, fresh.clone()).catch(() => {});
      return fresh;
    } catch (e) {
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
