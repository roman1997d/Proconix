/* Progress Drawings PWA — cache app shell only (scope: /progress-drawings/).
   Plan PDFs + annotations live in IndexedDB (pd-offline.js). */
var CACHE = 'progress-drawings-shell-v10';
var PRECACHE = [
  '/progress-drawings/',
  '/progress-drawings/index.html',
  '/progress-drawings/progress-drawings.css',
  '/progress-drawings/progress-drawings.js',
  '/progress-drawings/pd-offline.js',
  '/progress-drawings/manifest.webmanifest',
  '/progress-drawings/vendor/mydrawings.css',
  '/progress-drawings/vendor/drawing-viewer.js',
  '/progress-drawings/vendor/pdf.min.js',
  '/progress-drawings/vendor/pdf.worker.min.js',
  '/favicon_io/android-chrome-192x192.png',
  '/favicon_io/android-chrome-512x512.png',
  '/favicon_io/apple-touch-icon.png',
  '/favicon_io/favicon-32x32.png',
  '/favicon_io/favicon.ico'
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
      return Promise.all(keys.filter(function (k) {
        return k.indexOf('progress-drawings-shell-') === 0 && k !== CACHE;
      }).map(function (k) {
        return caches.delete(k);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function cacheFirst(req) {
  return caches.match(req, { ignoreSearch: true }).then(function (cached) {
    if (cached) return cached;
    return fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return cached || Response.error();
    });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.destination === 'worker') return;

  var p = url.pathname;
  var inScope = p.indexOf('/progress-drawings/') === 0 || p === '/progress-drawings';
  var isIcon = p.indexOf('/favicon_io/') === 0;
  if (!inScope && !isIcon) return;

  /* Never intercept API — lets Add / sync hit Node.js directly. */
  if (p.indexOf('/api/') === 0) return;

  event.respondWith(
    cacheFirst(req).then(function (res) {
      if (res && res.type !== 'error') return res;
      if (req.mode === 'navigate') {
        return caches.match('/progress-drawings/index.html', { ignoreSearch: true });
      }
      return res;
    })
  );
});
