const CACHE = 'lu62b-v17';

const STATIC = [
  '/',
  '/index.html',
  '/assets/css/style.css',
  '/assets/js/auth.js',
  '/assets/js/script.js',
  '/assets/js/sheets.js',
  '/assets/js/theme.js',
  '/assets/js/analytics.js',
  '/assets/js/bcrypt.min.js',
  '/assets/images/hero.jpg',
  '/assets/images/lu-logo.png',
  '/assets/images/favicon-photo.png',
  '/assets/images/icon-192.png',
  '/assets/images/icon-512.png',
  '/pages/login.html',
  '/pages/profile.html',
  '/pages/info.html',
  '/pages/resources.html',
  '/pages/result-dashboard.html',
  '/pages/students.html',
  '/pages/cover-page.html',
  '/pages/gallery.html',
];

// Install — cache only non-HTML assets (images, JS, CSS)
self.addEventListener('install', e => {
  self.skipWaiting();
  const nonHTML = STATIC.filter(p => !p.endsWith('.html') && p !== '/');
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(nonHTML).catch(() => {}))
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

  // HTML pages — network-first so users always get fresh content after deploy
  if (e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request).then(c => c || caches.match('/index.html')))
    );
    return;
  }

  // Everything else (JS, CSS, images) — cache-first
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
