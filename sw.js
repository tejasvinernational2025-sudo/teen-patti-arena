// Cache only this game's public static files, never API/auth/game responses.
const CACHE_NAME = 'tpa-static-v103';
const SCOPE = new URL(self.registration.scope);
const STATIC_FILES = new Set([
  '', 'index.html', 'app.js', 'auth.js', 'rooms.js', 'styles.css',
  'manifest.json', 'nectar-splash.png', 'privacy.html', 'terms.html',
  'data-deletion.html', 'reliable-products.html'
]);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => /^tpa-(live|static)-/.test(key) && key !== CACHE_NAME)
      .map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== SCOPE.origin ||
      !url.pathname.startsWith(SCOPE.pathname) ||
      !STATIC_FILES.has(url.pathname.slice(SCOPE.pathname.length)) ||
      req.headers.has('authorization') || url.search) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(req, { cache: 'no-store' });
      if (response.ok && !response.redirected && response.type === 'basic' &&
          !/private|no-store/i.test(response.headers.get('cache-control') || '')) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME)
          .then(cache => cache.put(req, copy)).catch(() => {}));
      }
      return response;
    } catch (_) {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      return cached || new Response('You are offline. Reconnect to play Teen Patti Arena.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});
