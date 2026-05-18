const CACHE = 'lu62b-v21';

const STATIC_IMAGES = [
  '/assets/images/hero.jpg',
  '/assets/images/lu-logo.png',
  '/assets/images/favicon-photo.png',
  '/assets/images/icon-192.png',
  '/assets/images/icon-512.png',
];

// Install — pre-cache only images (they rarely change)
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC_IMAGES).catch(() => {}))
  );
});

// Activate — clear old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip non-http(s) requests (chrome-extension://, etc.)
  if (!url.protocol.startsWith('http')) return;

  // Always network for external APIs (sheets, worker, supabase)
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('workers.dev') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('lus.ac.bd') ||
    url.hostname.includes('fonts.') ||
    url.hostname.includes('cdnjs.')
  ) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  // HTML, CSS, JS — network-first (always fresh after deploy, cache as offline fallback)
  const p = url.pathname;
  if (
    e.request.destination === 'document' ||
    p.endsWith('.css') ||
    p.endsWith('.js')
  ) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() =>
        caches.match(e.request).then(c => c || (
          e.request.destination === 'document' ? caches.match('/index.html') : null
        ))
      )
    );
    return;
  }

  // Images — cache-first (they don't change often)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => null);
    })
  );
});
