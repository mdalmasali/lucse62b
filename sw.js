const CACHE     = 'lu62b-v51';
const _SW_SUPA  = 'https://ftvtlqxpalwvyserujuh.supabase.co';
const _SW_ANON  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0dnRscXhwYWx3dnlzZXJ1anVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDA1MDgsImV4cCI6MjA5MzQ3NjUwOH0.kdmxzcqmOlCpMmjnvZPaOLIdfdLomrbMZBo4Nd5YecM';

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

/* Store student_id sent from page via postMessage */
let _swStudentId = null;
self.addEventListener('message', e => {
  if (e.data?.type === 'SET_STUDENT_ID') _swStudentId = e.data.studentId || null;
});

/* Push notification received */
self.addEventListener('push', e => {
  const sid = _swStudentId;
  let url = `${_SW_SUPA}/rest/v1/notifications?order=created_at.desc&limit=1`;
  if (sid) url += `&or=(student_id.is.null,student_id.eq.${encodeURIComponent(sid)})`;
  else     url += '&student_id=is.null';

  e.waitUntil(
    fetch(url, { headers: { 'apikey': _SW_ANON, 'Authorization': `Bearer ${_SW_ANON}` } })
    .then(r => r.json())
    .then(([n]) => {
      if (!n) return;
      return self.registration.showNotification(n.title, {
        body: n.body,
        icon: '/assets/images/icon-192.png',
        tag: n.id,
        data: { link: n.link || '/' },
      });
    })
    .catch(() => self.registration.showNotification('CSE 62B Portal', {
      body: 'New update available. Tap to view.',
      icon: '/assets/images/icon-192.png',
    }))
  );
});

// Notification click → open/focus relevant page
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const link = e.notification.data?.link || '/';
  const url  = new URL(link, self.location.origin).href;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      for (const c of cs) {
        if (c.url === url && 'focus' in c) return c.focus();
      }
      return clients.openWindow(url);
    })
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
      // Bypass the browser HTTP cache so deploys show up immediately (no hard-refresh)
      fetch(e.request, { cache: 'no-store' }).then(res => {
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
