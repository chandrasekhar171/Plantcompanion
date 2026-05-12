const CACHE = 'plant-companion-v5';

const APP_SHELL = [
  '/',
  'index.html',
  'storage.js',
  'ai.js',
  'ui.js',
  'manifest.json',
  'righteous.ttf',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

const CDN_HOST = 'cdn.jsdelivr.net';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Network-first for Chart.js CDN — want latest when online, cached when not
  if (url.hostname === CDN_HOST) {
    e.respondWith(networkFirst(request));
    return;
  }

  // Cache-first for same-origin app shell + assets
  if (url.origin === self.location.origin) {
    e.respondWith(cacheFirst(request));
    return;
  }

  // Pass-through for Claude API and all other external requests — never cache
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error('Offline and uncached: ' + request.url);
  }
}
