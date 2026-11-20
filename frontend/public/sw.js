const CACHE_NAME = 'docvault-v3';
const STATIC_ASSETS = ['/', '/index.html'];

function isPage(request) {
  if (request.mode === 'navigate') return true;
  const path = new URL(request.url).pathname;
  return path === '/' || path === '/index.html';
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Delete every older cache, including API responses stored by earlier versions of this worker.
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only cache GET requests
  if (event.request.method !== 'GET') return;

  // API responses are never stored or served from a cache: the key would not identify the account.
  if (event.request.url.includes('/api/')) return;

  // Pages go to the network first, so a release is never hidden behind an old index.html.
  // A successful response refreshes the one cached app shell (never a URL with a query string or token),
  // and that shell is the offline fallback for every page.
  if (isPage(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) {
            // Rebuild the response so the cache does not keep the URL it came from (it may carry a token).
            const copy = response.clone();
            const shell = new Response(copy.body, { status: copy.status, statusText: copy.statusText, headers: copy.headers });
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', shell)));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
