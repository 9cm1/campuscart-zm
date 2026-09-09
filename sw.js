/* Campus Cart: a small, reliable app shell with bounded image caching. */
'use strict';
var CORE_CACHE = 'campus-cart-v5-core';
var IMAGE_CACHE = 'campus-cart-v5-images';
var BASE = self.registration.scope;
var REQUIRED = ['index.html', 'pwa.js', 'offline.html'];
var OPTIONAL = [
  'team.html', 'privacy-policy.html', 'manifest.json', 'icons/cart-mark.svg',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'icons/apple-icon-180x180.png'
];
var STARTER_IMAGES = [
  'images/restaurant-hungry-lion.jpg', 'images/restaurant-9-to-9.jpg',
  'images/team-mwaba.jpg', 'images/team-conrad.jpg', 'images/team-albert.jpg',
  'images/team-jethro.jpg', 'images/team-jimmy.jpg', 'images/team-wachi.jpg'
];
var IMAGE_LIMIT = 60;
var MAX_IMAGE_BYTES = 2 * 1024 * 1024;
var imageWrites = Promise.resolve();

function url(path) { return new URL(path, BASE).href; }
function canonicalPath(address) {
  var path = new URL(address).pathname.slice(new URL(BASE).pathname.length);
  if (path === '' || path === 'index') return 'index.html';
  if (path === 'team' || path === 'privacy-policy' || path === 'offline') return path + '.html';
  return path;
}
function validAppResponse(response, key) {
  if (!response.ok) return false;
  var path = canonicalPath(key);
  // Accept the host's same-page clean-URL redirect, never a login/error redirect.
  if (response.redirected && (!response.url || new URL(response.url).origin !== self.location.origin || canonicalPath(response.url) !== path)) return false;
  var type = (response.headers.get('content-type') || '').toLowerCase();
  if (/\.html$/.test(path)) return type.indexOf('text/html') !== -1;
  if (/\.js$/.test(path)) return type.indexOf('javascript') !== -1;
  if (/\.json$/.test(path)) return type.indexOf('json') !== -1;
  if (/\.(png|svg)$/.test(path)) return type.indexOf('image/') === 0;
  return true;
}
function coreResponse(response) {
  // Normalise redirected responses so cached navigation works on clean-URL hosts.
  return response.blob().then(function (body) {
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  });
}
function timeout(promise, milliseconds) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () { reject(new Error('Network timeout')); }, milliseconds);
    promise.then(function (value) { clearTimeout(timer); resolve(value); }, function (error) { clearTimeout(timer); reject(error); });
  });
}
function getCached(name, key) {
  return caches.open(name).then(function (cache) { return cache.match(key); }).catch(function () { return null; });
}
function saveCore(key, response) {
  return coreResponse(response).then(function (copy) {
    return caches.open(CORE_CACHE).then(function (cache) { return cache.put(key, copy); });
  }).catch(function () {});
}
function saveImage(key, response) {
  if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) return Promise.resolve();
  // Serialize trimming so concurrent product-image requests stay within the limit.
  imageWrites = imageWrites.then(function () {
    return response.blob().then(function (blob) {
      if (blob.size > MAX_IMAGE_BYTES) return;
      return caches.open(IMAGE_CACHE).then(function (cache) {
        return cache.put(key, new Response(blob, { status: response.status, headers: response.headers })).then(function () {
          return cache.keys();
        }).then(function (keys) {
          return Promise.all(keys.slice(0, Math.max(0, keys.length - IMAGE_LIMIT)).map(function (request) { return cache.delete(request); }));
        });
      });
    });
  }).catch(function () {});
  return imageWrites;
}
function fetchForInstall(path, cacheName) {
  var key = url(path);
  return timeout(fetch(new Request(key, { cache: 'reload' })), 15000).then(function (response) {
    if (!response.ok || (cacheName === CORE_CACHE && !validAppResponse(response, key))) throw new Error('Unavailable app file: ' + path);
    if (cacheName === IMAGE_CACHE) return saveImage(key, response);
    // Required files must be saved before this worker replaces the old one.
    return coreResponse(response).then(function (copy) {
      return caches.open(cacheName).then(function (cache) { return cache.put(key, copy); });
    });
  });
}
self.addEventListener('install', function (event) {
  event.waitUntil(Promise.all(REQUIRED.map(function (path) { return fetchForInstall(path, CORE_CACHE); })).then(function () {
    return Promise.all(OPTIONAL.map(function (path) {
      return fetchForInstall(path, CORE_CACHE).catch(function () {});
    }).concat(STARTER_IMAGES.map(function (path) {
      return fetchForInstall(path, IMAGE_CACHE).catch(function () {});
    })));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (names) {
    return Promise.all(names.filter(function (name) {
      return name.indexOf('campus-cart-') === 0 && name !== CORE_CACHE && name !== IMAGE_CACHE;
    }).map(function (name) { return caches.delete(name); }));
  }).catch(function () {}).then(function () { return self.clients.claim(); }));
});
function offlinePage() {
  return getCached(CORE_CACHE, url('offline.html')).then(function (cached) {
    return cached || new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Campus Cart</title><body style="background:#0a192f;color:#ccd6f6;font:18px Arial;padding:28px"><h1>Campus Cart</h1><p>Connect to the internet to reopen the shop.</p><button onclick="location.reload()">Try again</button></body></html>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  });
}
function unavailableAsset() {
  return new Response('', { status: 504, statusText: 'Offline', headers: { 'Content-Type': 'text/plain' } });
}
function networkFirst(event, key, isPage, cacheable) {
  var network = fetch(event.request).then(function (response) {
    if (!response.ok || (cacheable && !validAppResponse(response, key))) throw new Error('Page or asset unavailable');
    return response;
  });
  // Keep late successful requests alive long enough to update the next launch.
  event.waitUntil(timeout(network, 15000).then(function (response) {
    if (cacheable) return saveCore(key, response.clone());
  }).catch(function () {}));
  return timeout(network, 4000).catch(function () {
    return getCached(CORE_CACHE, key).then(function (cached) {
      return cached || (isPage ? offlinePage() : unavailableAsset());
    });
  });
}
self.addEventListener('fetch', function (event) {
  var request = event.request;
  var requestUrl = new URL(request.url);
  // Leave checkout logging, analytics and external services alone.
  if (request.method !== 'GET' || requestUrl.origin !== self.location.origin || request.headers.has('range')) return;
  if (requestUrl.href.indexOf(BASE) !== 0) return;
  var canonical = canonicalPath(requestUrl.href);
  var known = REQUIRED.concat(OPTIONAL).indexOf(canonical) !== -1;
  var key = known ? url(canonical) : request.url;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(event, key, true, known));
    return;
  }
  if (known) {
    event.respondWith(networkFirst(event, key, false, true));
    return;
  }
  if (request.destination === 'image' || /\.(png|jpe?g|webp|gif|svg|ico)$/i.test(requestUrl.pathname)) {
    var network = fetch(request).then(function (response) {
      if (!response.ok) throw new Error('Image unavailable');
      return response;
    });
    event.waitUntil(timeout(network, 15000).then(function (response) {
      return saveImage(key, response.clone());
    }).catch(function () {}));
    event.respondWith(getCached(IMAGE_CACHE, key).then(function (cached) {
      return cached || timeout(network, 4000).catch(unavailableAsset);
    }));
  }
});
