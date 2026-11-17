// Service Worker — Macro Tracker
// האפליקציה נפתחת מיידית מהמטמון (גם בלי אינטרנט), ומתעדכנת ברקע.
// /api/* לעולם לא נשמר במטמון.

const CACHE = 'macro-tracker-v1';
const APP_SHELL = ['./', './index.html', './base-food.js', './manifest.json?v=2'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function notifyUpdate() {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach((c) => c.postMessage({ type: 'APP_UPDATED' }));
}

// Stale-while-revalidate: מחזיר מיד מהמטמון, ומרענן ברקע לפעם הבאה
async function staleWhileRevalidate(request, cacheKey, watchForUpdate) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(cacheKey, { ignoreSearch: true });

  const networkPromise = fetch(request)
    .then(async (res) => {
      if (res && res.ok) {
        if (watchForUpdate && cached) {
          const [oldText, newText] = await Promise.all([cached.clone().text(), res.clone().text()]);
          await cache.put(cacheKey, res.clone());
          if (oldText !== newText) notifyUpdate();
        } else {
          await cache.put(cacheKey, res.clone());
        }
      }
      return res;
    })
    .catch(() => null);

  if (cached) return cached;
  const res = await networkPromise;
  return res || new Response('Offline', { status: 503 });
}

// Cache-first לקבצים חיצוניים שלא משתנים (פונטים, אייקון)
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
    return res;
  } catch (e) {
    return new Response('', { status: 503 });
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/')) return; // נתונים — תמיד מהרשת
    if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html')) {
      event.respondWith(staleWhileRevalidate(req, './index.html', true));
      return;
    }
    const watch = url.pathname.endsWith('/base-food.js');
    event.respondWith(staleWhileRevalidate(req, req, watch));
    return;
  }

  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    url.hostname === 'cdn-icons-png.flaticon.com'
  ) {
    event.respondWith(cacheFirst(req));
  }
});
