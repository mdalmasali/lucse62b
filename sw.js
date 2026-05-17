const CACHE = 'lu62b-v9';

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

// Install — cache static assets
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC).catch(() => {}))
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

// Fetch — cache-first for static, network-first for API/sheets
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

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

  // Cache-first for local assets
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => {
        // Offline fallback for HTML pages
        if (e.request.destination === 'document') return caches.match('/index.html');
      });
    })
  );
});
