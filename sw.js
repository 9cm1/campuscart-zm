// sw.js - FIXED + RELIABLE
const CACHE_NAME = 'campus-cart-v2';

// Files cached on install
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install
self.addEventListener('install', event => {
  console.log('🚀 Service Worker installing...');
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
});

// Activate
self.addEventListener('activate', event => {
  console.log('🔄 Service Worker activating...');

  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑 Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      )
    )
  );

  self.clients.claim();
});

// Fetch
self.addEventListener('fetch', event => {
  const request = event.request;

  // ---- IMAGE HANDLING FIX ----
  // Cache images as they load and reuse them in PWA mode
  if (request.destination === 'image') {
    event.respondWith(
      caches.match(request).then(cacheRes => {
        return (
          cacheRes ||
          fetch(request).then(networkRes => {
            // Cache image for later
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, networkRes.clone());
            });
            return networkRes;
          })
        );
      })
    );
    return;
  }

  // ---- APP FILES ----
  event.respondWith(
    fetch(request)
      .then(networkRes => {
        // Cache successful GET responses
        if (networkRes.status === 200 && request.method === 'GET') {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }

        return networkRes;
      })
      .catch(() => caches.match(request)) // fallback
  );
});