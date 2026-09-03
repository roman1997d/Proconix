/* My Drawings PWA — app shell + Wall Types catalog (offline). PDFs stay in IndexedDB. */
var CACHE = 'mydrawings-shell-v37';
var PRECACHE = [
  '/mydrawings/',
  '/mydrawings/index.html',
  '/mydrawings/mydrawings.css',
  '/mydrawings/mydrawings.js',
  '/mydrawings/drawing-viewer.js',
  '/mydrawings/manifest.webmanifest',
  '/mydrawings/data/medlock-wall-types.json',
  '/mydrawings/lib/pdf.min.js',
  '/mydrawings/lib/pdf.worker.min.js',
  /* Wall Types construction details — available offline */
  '/mydrawings/data/wall-types/wt01b.jpg',
  '/mydrawings/data/wall-types/wt01c.jpg',
  '/mydrawings/data/wall-types/wt03c.jpg',
  '/mydrawings/data/wall-types/wt05b.jpg',
  '/mydrawings/data/wall-types/wt07.jpg',
  '/mydrawings/data/wall-types/wt08a-svp.jpg',
  '/mydrawings/data/wall-types/wt08a-svp-36.jpg',
  '/mydrawings/data/wall-types/wt08d.jpg',
  '/mydrawings/data/wall-types/wt08e.jpg',
  '/mydrawings/data/wall-types/wt09.jpg',
  '/mydrawings/data/wall-types/wt10a.jpg',
  '/mydrawings/data/wall-types/wt10b.jpg',
  '/mydrawings/data/wall-types/wt20a.jpg',
  '/mydrawings/data/wall-types/wt20b.jpg',
  '/mydrawings/data/wall-types/wt21.jpg',
  '/mydrawings/data/wall-types/wt21a.jpg',
  '/mydrawings/data/wall-types/wt23.jpg',
  '/mydrawings/data/wall-types/wt24.jpg',
  '/mydrawings/data/wall-types/wt24a.jpg',
  '/mydrawings/data/wall-types/wt25.jpg',
  '/mydrawings/data/wall-types/wt26.jpg',
  '/mydrawings/data/wall-types/wt26a.jpg',
  '/mydrawings/data/wall-types/wt27.jpg',
  '/mydrawings/data/wall-types/wt28.jpg',
  '/mydrawings/data/wall-types/wt29.jpg',
  '/mydrawings/data/wall-types/wt31.jpg',
  '/mydrawings/data/wall-types/wt32.jpg',
  '/mydrawings/data/wall-types/wt33.jpg',
  '/mydrawings/data/wall-types/wt34.jpg'
];

function precacheAll(cache) {
  var i = 0;
  function next() {
    if (i >= PRECACHE.length) return Promise.resolve();
    var url = PRECACHE[i++];
    return cache.add(url).catch(function (err) {
      console.warn('[mydrawings-sw] precache failed', url, err && err.message ? err.message : err);
    }).then(next);
  }
  return next();
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(precacheAll).then(function () {
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
