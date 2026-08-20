/* My Drawings PWA — cache the app shell only. PDFs are stored in IndexedDB on demand. */
var CACHE = 'mydrawings-shell-v4';
var PRECACHE = [
  '/mydrawings/',
  '/mydrawings/index.html',
  '/mydrawings/mydrawings.css',
  '/mydrawings/mydrawings.js',
  '/mydrawings/drawing-viewer.js',
  '/mydrawings/manifest.webmanifest',
  '/mydrawings/lib/pdf.min.js',
  '/mydrawings/lib/pdf.worker.min.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(PRECACHE);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) {
        return caches.delete(k);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* Safari iOS breaks Worker/script loads intercepted by a service worker. */
  if (req.destination === 'worker' || url.pathname.indexOf('/mydrawings/lib/') === 0) {
    return;
  }

  var isSamplePdf = url.pathname.indexOf('/mydrawings/samples/') === 0;
  if (isSamplePdf) {
    event.respondWith(fetch(req).catch(function () { return caches.match(req); }));
    return;
  }

  if (url.pathname.indexOf('/mydrawings/') !== 0) return;

  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function () {
        if (req.mode === 'navigate') return caches.match('/mydrawings/index.html');
        return cached;
      });
    })
  );
});
