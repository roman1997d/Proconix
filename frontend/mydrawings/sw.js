/* My Drawings PWA — cache the app shell only. PDFs are stored in IndexedDB on demand. */
var CACHE = 'mydrawings-shell-v7';
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

function cacheFirst(req) {
  return caches.match(req).then(function (cached) {
    if (cached) return cached;
    return fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
      }
      return res;
    }).catch(function () { return cached; });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* Safari iOS: do not intercept Web Worker construction. Classic <script> loads are fine. */
  if (req.destination === 'worker') return;

  var isSamplePdf = url.pathname.indexOf('/mydrawings/samples/') === 0;
  if (isSamplePdf) {
    event.respondWith(fetch(req).catch(function () { return caches.match(req); }));
    return;
  }

  if (url.pathname.indexOf('/mydrawings/') !== 0) return;

  event.respondWith(
    cacheFirst(req).then(function (res) {
      if (res) return res;
      if (req.mode === 'navigate') return caches.match('/mydrawings/index.html');
      return res;
    })
  );
});
