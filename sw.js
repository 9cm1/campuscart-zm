// Campus Cart PWA service worker
const CACHE_NAME = 'campus-cart-v4';

const APP_SHELL = [
  './',
  './index.html',
  './team.html',
  './privacy-policy.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './images/restaurant-hungry-lion.jpg',
  './images/restaurant-9-to-9.jpg',
  './images/team-conrad.jpg',
  './images/team-albert.jpg',
  './images/team-jethro.jpg',
  './images/team-jimmy.jpg',
  './images/team-wachi.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames
          .filter(cacheName => cacheName.startsWith('campus-cart-') && cacheName !== CACHE_NAME)
          .map(cacheName => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const requestUrl = new URL(request.url);

  // Do not interfere with order logging, analytics, WhatsApp or any other external request.
  if (request.method !== 'GET' || requestUrl.origin !== self.location.origin) return;

  // Pages use network-first so customers see current products and prices.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || caches.match('./index.html'))
    );
    return;
  }

  // Images and local static files load from cache immediately, then refresh in the background.
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      const networkUpdate = fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkUpdate;
    })
  );
});
