// Minimal service worker for PWA install eligibility.
// Network-first for HTML (so members always get the latest UI),
// cache-first for immutable static assets.

const CACHE = 'jeyrun-v3';
const CORE = ['/', '/app', '/app/login', '/manifest.webmanifest',
              '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept Supabase, GA, or other cross-origin API calls.
  if (url.origin !== self.location.origin) return;

  // The /app area is never cached — auth state has to be live. But "not
  // cached by us" still left it on the browser's HTTP cache, and GitHub Pages
  // sends max-age=600 on the HTML. That pinned members to a ten-minute-old
  // page pointing at a ten-minute-old bundle hash, so a shipped fix looked
  // like it had not shipped. Go past the HTTP cache for the document itself;
  // the hashed assets it references are immutable and safe to reuse.
  if (url.pathname.startsWith('/app')) {
    // The client-side router fetches documents with a plain fetch(), which is
    // neither mode 'navigate' nor Accept: text/html — so match on "this path
    // has no file extension" instead, which is every page and no asset.
    const isDocument = req.mode === 'navigate'
      || req.headers.get('accept')?.includes('text/html')
      || !/\.[a-z0-9]+$/i.test(url.pathname);
    if (isDocument) {
      event.respondWith(
        fetch(req, { cache: 'no-store' }).catch(() => fetch(req)),
      );
    }
    return;
  }

  // HTML: network-first, fall back to cache.
  if (req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('/')))
    );
    return;
  }

  // Static assets: cache-first.
  event.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
    )
  );
});
