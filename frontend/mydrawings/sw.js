/* My Drawings PWA — cache the app shell only. PDFs are stored in IndexedDB on demand. */
var CACHE = 'mydrawings-shell-v1';
var PRECACHE = [
  '/mydrawings/',
  '/mydrawings/index.html',
  '/mydrawings/mydrawings.css',
  '/mydrawings/mydrawings.js',
  '/mydrawings/manifest.webmanifest'
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
  var isSamplePdf = url.pathname.indexOf('/mydrawings/samples/') === 0;
  if (isSamplePdf) {
    event.respondWith(fetch(req).catch(function () { return caches.match(req); }));
    return;
  }

  var isShell = url.pathname.indexOf('/mydrawings/') === 0 ||
    url.href.indexOf('cdnjs.cloudflare.com/ajax/libs/pdf.js/') !== -1 ||
    url.pathname.indexOf('/favicon_io/') === 0;

  if (!isShell) return;

  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        if (res && res.ok && res.type !== 'opaque') {
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
