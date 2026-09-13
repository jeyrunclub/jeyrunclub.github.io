// Minimal service worker for PWA install eligibility.
// Network-first for HTML (so members always get the latest UI),
// cache-first for immutable static assets.

const CACHE = 'jeyrun-v5';
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

// ---------- Web Push ----------
// The payload is encrypted end to end: the push service that carries it can
// see the endpoint but not the words. Everything shown here comes out of the
// message, not out of a fetch, so it works with the app closed and offline.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  event.waitUntil(self.registration.showNotification(data.title || 'جیران', {
    body:  data.body || '',
    icon:  '/icons/apple-touch-icon.png',
    badge: '/images/favicon.png',
    dir:   'rtl',
    lang:  'fa',
    tag:   data.href || '/app',   // one per destination, so ten comments are one line
    renotify: true,
    // Android shows this full width under the text; iOS ignores it, which is
    // why nothing here depends on it.
    image: data.image || undefined,
    data:  { href: data.href || '/app' },
  }));
});

// Focus a window that is already open rather than piling up new ones.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || '/app';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin) {
        await c.focus();
        return c.navigate(href).catch(() => {});
      }
    }
    return self.clients.openWindow(href);
  })());
});
