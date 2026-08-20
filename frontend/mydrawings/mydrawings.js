/* My Drawings — mobile PWA (frontend preview). Swap fetchCatalog / fetchDrawingFile when the API exists. */
(function () {
  'use strict';

  var DEMO = true;
  var DEMO_PIN = '2580';
  var SESSION_KEY = 'proconix_mydrawings_session';
  var DB_NAME = 'proconix-mydrawings';
  var DB_VER = 1;
  var PDFJS_WORKER = '/mydrawings/lib/pdf.worker.min.js';

  var CATALOG = {
    project: { id: 'riverside-p2', name: 'Riverside Tower — Phase 2' },
    categories: ['Architectural', 'Structural', 'MEP', 'Electrical'],
    drawings: [
      { id: 'a-102', number: 'A-102', title: 'Ground Floor Plan', category: 'Architectural', revision: 'C', updatedAt: '2026-08-18', sizeBytes: 11355, fileUrl: '/mydrawings/samples/a-102.pdf' },
      { id: 'a-201', number: 'A-201', title: 'First Floor Plan', category: 'Architectural', revision: 'B', updatedAt: '2026-08-12', sizeBytes: 4135, fileUrl: '/mydrawings/samples/a-201.pdf' },
      { id: 'a-301', number: 'A-301', title: 'Typical Room Layout', category: 'Architectural', revision: 'A', updatedAt: '2026-08-04', sizeBytes: 2616, fileUrl: '/mydrawings/samples/a-301.pdf' },
      { id: 's-101', number: 'S-101', title: 'Foundation Plan', category: 'Structural', revision: 'D', updatedAt: '2026-08-16', sizeBytes: 4118, fileUrl: '/mydrawings/samples/s-101.pdf' },
      { id: 's-210', number: 'S-210', title: 'Steel Frame Level 2', category: 'Structural', revision: 'B', updatedAt: '2026-07-29', sizeBytes: 2606, fileUrl: '/mydrawings/samples/s-210.pdf' },
      { id: 'm-401', number: 'M-401', title: 'HVAC Ground Floor', category: 'MEP', revision: 'C', updatedAt: '2026-08-09', sizeBytes: 4134, fileUrl: '/mydrawings/samples/m-401.pdf' },
      { id: 'e-110', number: 'E-110', title: 'Lighting Layout Ground', category: 'Electrical', revision: 'A', updatedAt: '2026-08-01', sizeBytes: 2611, fileUrl: '/mydrawings/samples/e-110.pdf' },
      { id: 'e-220', number: 'E-220', title: 'Fire Alarm Schematic', category: 'Electrical', revision: 'B', updatedAt: '2026-08-14', sizeBytes: 2606, fileUrl: '/mydrawings/samples/e-220.pdf' }
    ]
  };

  var state = {
    project: null,
    drawings: [],
    categories: [],
    query: '',
    category: 'All',
    offlineIds: {},
    viewing: null,
    installPrompt: null,
    pushingView: false,
    downloadCtl: {},
    pendingRemoveId: null,
    downloadingAll: false,
    downloadAllProgress: null,
    manageMode: null
  };

  var $ = function (id) { return document.getElementById(id); };

  function qs(sel, root) { return (root || document).querySelector(sel); }

  function on(el, ev, fn, opts) {
    if (el) el.addEventListener(ev, fn, opts);
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + (iso.length <= 10 ? 'T00:00:00' : ''));
    if (isNaN(d.getTime())) return iso;
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatBytes(n) {
    var bytes = Number(n) || 0;
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1).replace(/\.0$/, '') + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '') + ' MB';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function isOnline() { return navigator.onLine !== false; }

  function vibrate(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
  }

  function drawingById(id) {
    for (var i = 0; i < state.drawings.length; i++) {
      if (state.drawings[i].id === id) return state.drawings[i];
    }
    return null;
  }

  /* ---------- IndexedDB ---------- */
  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbGet(store, key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, 'readonly');
        var req = tx.objectStore(store).get(key);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbSet(store, key, value) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(value, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbDel(store, key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbKeys(store) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, 'readonly');
        var req = tx.objectStore(store).getAllKeys();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function sha256(text) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    });
  }

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function slugId(number) {
    var base = String(number || 'dwg').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dwg';
    if (!drawingById(base)) return base;
    var n = 2;
    while (drawingById(base + '-' + n)) n += 1;
    return base + '-' + n;
  }

  function nextRevision(rev) {
    var r = String(rev || 'A').trim().toUpperCase();
    if (!r) return 'A';
    if (/^[A-Y]$/.test(r)) return String.fromCharCode(r.charCodeAt(0) + 1);
    if (r === 'Z') return 'AA';
    var m = r.match(/^(.*?)(\d+)$/);
    if (m) return m[1] + String(Number(m[2]) + 1);
    return r + '+';
  }

  function isPdfFile(file) {
    if (!file) return false;
    var name = String(file.name || '').toLowerCase();
    return file.type === 'application/pdf' || name.endsWith('.pdf');
  }

  function blobFromPdf(file) {
    return file.arrayBuffer().then(function (buf) {
      return new Blob([buf], { type: 'application/pdf' });
    });
  }

  function seedCatalog() {
    return {
      project: CATALOG.project,
      categories: CATALOG.categories.slice(),
      drawings: CATALOG.drawings.map(function (d) { return Object.assign({}, d); })
    };
  }

  /* ---------- Catalog (replace this block with API calls) ---------- */
  async function fetchCatalog(pin) {
    var cached = await idbGet('meta', 'catalog');
    var hash = await sha256('mydrawings:' + pin);
    if (DEMO && String(pin) !== DEMO_PIN) {
      var bad = new Error('Incorrect access key');
      bad.code = 'bad_pin';
      throw bad;
    }
    if (cached && cached.data) {
      if (cached.pinHash && cached.pinHash !== hash) {
        var mismatch = new Error('Incorrect access key');
        mismatch.code = 'bad_pin';
        throw mismatch;
      }
      if (!cached.pinHash) {
        await idbSet('meta', 'catalog', { pinHash: hash, data: cached.data, savedAt: Date.now() });
      }
      return cached.data;
    }
    if (isOnline() && DEMO && String(pin) === DEMO_PIN) {
      var data = seedCatalog();
      await idbSet('meta', 'catalog', { pinHash: hash, data: data, savedAt: Date.now() });
      return data;
    }
    var offlineErr = new Error(isOnline() ? 'Incorrect access key' : 'No drawings stored on this device yet.');
    offlineErr.code = 'bad_pin';
    throw offlineErr;
  }

  async function saveCatalog() {
    var cached = await idbGet('meta', 'catalog');
    var data = {
      project: state.project,
      categories: state.categories.slice(),
      drawings: state.drawings.map(function (d) { return Object.assign({}, d); })
    };
    await idbSet('meta', 'catalog', {
      pinHash: cached && cached.pinHash ? cached.pinHash : null,
      data: data,
      savedAt: Date.now()
    });
  }

  async function fetchDrawingFile(drawing, onProgress) {
    var local = await idbGet('files', drawing.id);
    if (local && local.blob) return local.blob;
    if (!drawing.fileUrl) throw new Error('This drawing has no file on this device. Open Manage and add the PDF again.');
    if (!isOnline()) throw new Error('This drawing is not available offline.');
    var res = await fetch(drawing.fileUrl, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Could not load drawing.');
    var total = Number(res.headers.get('Content-Length') || drawing.sizeBytes || 0);
    if (!res.body || !res.body.getReader) {
      var blobFast = await res.blob();
      if (onProgress) onProgress(1, blobFast.size);
      return blobFast;
    }
    var reader = res.body.getReader();
    var chunks = [];
    var received = 0;
    while (true) {
      var step = await reader.read();
      if (step.done) break;
      chunks.push(step.value);
      received += step.value.length;
      if (onProgress) onProgress(total ? received / total : 0, received);
    }
    if (onProgress) onProgress(1, received);
    return new Blob(chunks, { type: 'application/pdf' });
  }

  /* ---------- Session ---------- */
  function readSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeSession(ok) {
    try {
      if (ok) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ok: true, at: Date.now() }));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  /* ---------- Screens ---------- */
  function showScreen(id) {
    ['screen-pin', 'screen-list', 'screen-manage', 'screen-viewer'].forEach(function (sid) {
      var el = $(sid);
      if (el) el.classList.toggle('is-active', sid === id);
    });
  }

  function setOfflineUi() {
    var on = !isOnline();
    ['offline-pill', 'viewer-offline'].forEach(function (id) {
      var el = $(id);
      if (el) el.classList.toggle('is-on', on);
    });
  }

  /* ---------- PIN ---------- */
  function pinValue() {
    return ($('pin-input').value || '').replace(/\D/g, '').slice(0, 4);
  }

  function renderPinDots() {
    var v = pinValue();
    var dots = $('pin-dots').children;
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.toggle('is-on', i < v.length);
    }
    $('pin-continue').disabled = v.length !== 4;
    $('pin-tap').textContent = v.length ? '' : 'Tap to enter key';
  }

  async function submitPin() {
    var pin = pinValue();
    if (pin.length !== 4) return;
    $('pin-error').textContent = '';
    $('pin-continue').disabled = true;
    try {
      var data = await fetchCatalog(pin);
      writeSession(true);
      $('pin-input').value = '';
      renderPinDots();
      applyCatalog(data);
      await refreshOfflineMap();
      showScreen('screen-list');
      renderList();
      var deep = new URLSearchParams(location.search).get('d');
      if (deep && drawingById(deep)) openViewer(deep, false);
    } catch (err) {
      writeSession(false);
      $('pin-error').textContent = err && err.message ? err.message : 'Incorrect access key';
      $('screen-pin').classList.add('is-shake');
      vibrate(40);
      setTimeout(function () { $('screen-pin').classList.remove('is-shake'); }, 400);
      $('pin-input').value = '';
      renderPinDots();
      $('pin-input').focus();
    }
  }

  function applyCatalog(data) {
    state.project = data.project || { name: 'Project' };
    state.categories = data.categories || [];
    state.drawings = data.drawings || [];
    $('project-name').textContent = state.project.name || 'Project';
    renderCats();
  }

  /* ---------- List ---------- */
  function renderCats() {
    var host = $('cats');
    var cats = ['All'].concat(state.categories);
    host.innerHTML = cats.map(function (c) {
      var onCls = c === state.category ? ' is-on' : '';
      return '<button type="button" class="md-chip' + onCls + '" data-cat="' + escapeHtml(c) + '" role="tab" aria-selected="' + (c === state.category) + '">' + escapeHtml(c) + '</button>';
    }).join('');
  }

  function filteredDrawings() {
    var q = (state.query || '').trim().toLowerCase();
    return state.drawings.filter(function (d) {
      if (state.category !== 'All' && d.category !== state.category) return false;
      if (!q) return true;
      return (d.number + ' ' + d.title + ' ' + d.category + ' ' + (d.revision || '')).toLowerCase().indexOf(q) !== -1;
    });
  }

  var ICON_DL = '<svg class="md-icon" viewBox="0 0 24 24"><path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M5 21h14"/></svg>';
  var ICON_OK = '<svg class="md-icon" viewBox="0 0 24 24"><path d="M5 12l5 5 9-9"/></svg>';

  function renderList() {
    var items = filteredDrawings();
    var host = $('list');
    $('list-count').textContent = items.length + (items.length === 1 ? ' drawing' : ' drawings');
    if (!items.length) {
      host.innerHTML = '<div class="md-empty"><h3>No drawings</h3><p>Try another search or category.</p></div>';
      updateDownloadAllBtn();
      return;
    }
    host.innerHTML = items.map(function (d) {
      var ready = !!state.offlineIds[d.id];
      var busy = state.downloadCtl[d.id] && state.downloadCtl[d.id].status === 'downloading';
      var pct = busy ? Math.round((state.downloadCtl[d.id].ratio || 0) * 100) : 0;
      var offCls = 'md-dl' + (ready ? ' is-ready' : '') + (busy ? ' is-busy' : '');
      var offLabel = ready ? 'Available offline' : (busy ? 'Downloading ' + pct + '%' : 'Download for offline');
      var offInner = busy ? (pct + '%') : (ready ? ICON_OK : ICON_DL);
      return (
        '<article class="md-card" data-id="' + escapeHtml(d.id) + '">' +
          '<div class="md-card-body">' +
            '<p class="md-card-num">' + escapeHtml(d.number) + '</p>' +
            '<p class="md-card-title">' + escapeHtml(d.title) + '</p>' +
            '<p class="md-card-meta">Rev ' + escapeHtml(d.revision) + ' · Updated ' + escapeHtml(formatDate(d.updatedAt)) + ' · PDF · ' + escapeHtml(formatBytes(d.sizeBytes)) + '</p>' +
          '</div>' +
          '<button type="button" class="' + offCls + '" data-act="offline" aria-label="' + escapeHtml(offLabel) + '">' + offInner + '</button>' +
        '</article>'
      );
    }).join('');
    updateDownloadAllBtn();
  }

  async function refreshDrawingsList() {
    setOfflineUi();
    var cached = await idbGet('meta', 'catalog');
    if (cached && cached.data) applyCatalog(cached.data);
    await refreshOfflineMap();
    renderList();
    if ('serviceWorker' in navigator && isOnline()) {
      try {
        var reg = await navigator.serviceWorker.getRegistration('/mydrawings/');
        if (reg) await reg.update();
      } catch (e) {}
    }
  }

  function bindPullToRefresh() {
    var main = $('list-main');
    var el = $('ptr');
    var ring = $('ptr-ring');
    var label = $('ptr-label');
    if (!main || !el) return;

    var THRESHOLD = 68;
    var ptr = {
      armed: false,
      pulling: false,
      refreshing: false,
      startY: 0,
      startX: 0,
      dy: 0
    };

    function setHeight(h, animate) {
      el.style.transition = animate ? 'height 0.22s ease' : 'none';
      el.style.height = Math.max(0, h) + 'px';
    }

    function setLabel(text) {
      if (label.textContent !== text) label.textContent = text;
    }

    function applyPull(h) {
      ptr.dy = h;
      setHeight(h, false);
      var ready = h >= THRESHOLD;
      el.classList.toggle('is-ready', ready);
      if (!ptr.refreshing) {
        ring.style.transform = 'rotate(' + Math.round((h / THRESHOLD) * 280) + 'deg)';
        setLabel(ready ? 'Release to refresh' : 'Pull to refresh');
      }
    }

    function resetPull() {
      ptr.armed = false;
      ptr.pulling = false;
      ptr.dy = 0;
      if (ptr.refreshing) return;
      el.classList.remove('is-ready', 'is-spin');
      setHeight(0, true);
      ring.style.transform = '';
    }

    async function runRefresh() {
      ptr.refreshing = true;
      ptr.pulling = false;
      ptr.armed = false;
      el.classList.add('is-spin');
      el.classList.remove('is-ready');
      setHeight(56, true);
      setLabel('Updating…');
      ring.style.transform = '';
      vibrate(12);
      var started = Date.now();
      try {
        await refreshDrawingsList();
      } catch (e) {}
      var wait = 520 - (Date.now() - started);
      if (wait > 0) await new Promise(function (r) { setTimeout(r, wait); });
      ptr.refreshing = false;
      el.classList.remove('is-spin');
      setHeight(0, true);
      setLabel('Pull to refresh');
    }

    on(main, 'touchstart', function (e) {
      if (ptr.refreshing) return;
      if (e.touches.length !== 1) return;
      if (!$('screen-list') || !$('screen-list').classList.contains('is-active')) return;
      if ($('backdrop') && $('backdrop').classList.contains('is-on')) return;
      if (main.scrollTop > 1) return;
      ptr.armed = true;
      ptr.pulling = false;
      ptr.startY = e.touches[0].clientY;
      ptr.startX = e.touches[0].clientX;
      ptr.dy = 0;
    }, { passive: true });

    on(main, 'touchmove', function (e) {
      if (!ptr.armed || ptr.refreshing) return;
      if (e.touches.length !== 1) {
        resetPull();
        return;
      }
      var x = e.touches[0].clientX;
      var y = e.touches[0].clientY;
      var dx = x - ptr.startX;
      var raw = y - ptr.startY;
      if (!ptr.pulling) {
        if (Math.abs(dx) > 12 && Math.abs(dx) > raw) {
          ptr.armed = false;
          return;
        }
        if (raw < 10) return;
        if (main.scrollTop > 1) {
          ptr.armed = false;
          return;
        }
        ptr.pulling = true;
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      }
      if (raw <= 0) {
        applyPull(0);
        return;
      }
      e.preventDefault();
      applyPull(Math.min(108, raw * 0.42));
    }, { passive: false });

    function endPull() {
      if (ptr.refreshing) return;
      if (ptr.pulling && ptr.dy >= THRESHOLD) runRefresh();
      else resetPull();
    }

    on(main, 'touchend', endPull);
    on(main, 'touchcancel', endPull);
  }

  function pendingDownloads() {
    return state.drawings.filter(function (d) { return !state.offlineIds[d.id]; });
  }

  function updateDownloadAllBtn() {
    var btn = $('btn-download-all');
    var label = $('btn-download-all-label');
    if (!btn || !label) return;
    var pending = pendingDownloads();
    btn.classList.remove('is-ready', 'is-busy');
    btn.disabled = false;
    if (state.downloadingAll) {
      var p = state.downloadAllProgress;
      btn.classList.add('is-busy');
      btn.disabled = true;
      label.textContent = p ? ('Downloading ' + p.current + ' / ' + p.total) : 'Downloading…';
      return;
    }
    if (!state.drawings.length) {
      btn.disabled = true;
      label.textContent = 'Download all drawings';
      return;
    }
    if (!pending.length) {
      btn.classList.add('is-ready');
      label.textContent = 'All drawings offline';
      btn.disabled = true;
      return;
    }
    label.textContent = 'Download all drawings';
  }

  async function refreshOfflineMap() {
    var keys = await idbKeys('files');
    var map = {};
    keys.forEach(function (k) { map[k] = true; });
    state.offlineIds = map;
  }

  async function removeOfflineCopy(id) {
    await idbDel('files', id);
    delete state.offlineIds[id];
    renderList();
  }

  async function downloadDrawing(id) {
    var d = drawingById(id);
    if (!d || state.offlineIds[id]) return;
    if (state.downloadCtl[id] && state.downloadCtl[id].status === 'downloading') return;
    state.downloadCtl[id] = { status: 'downloading', ratio: 0 };
    renderList();
    try {
      var blob = await fetchDrawingFile(d, function (ratio) {
        state.downloadCtl[id] = { status: 'downloading', ratio: ratio };
        var btn = qs('.md-card[data-id="' + id + '"] [data-act="offline"]');
        if (btn) {
          btn.classList.add('is-busy');
          btn.textContent = Math.round(ratio * 100) + '%';
        }
      });
      await idbSet('files', id, { blob: blob, size: blob.size, at: Date.now() });
      state.offlineIds[id] = true;
    } catch (err) {
      throw err;
    } finally {
      delete state.downloadCtl[id];
      renderList();
    }
  }

  async function toggleOffline(id) {
    var d = drawingById(id);
    if (!d) return;
    if (state.offlineIds[id]) {
      state.pendingRemoveId = id;
      openSheet(
        '<h3 id="sheet-title">Remove offline copy</h3>' +
        '<p class="md-sheet-note">Remove this drawing from offline storage?</p>' +
        '<button type="button" class="md-sheet-item is-danger" data-sheet="confirm-remove">Remove offline copy</button>'
      );
      return;
    }
    try {
      await downloadDrawing(id);
    } catch (err) {
      alert(err && err.message ? err.message : 'Download failed.');
    }
  }

  async function downloadAllDrawings() {
    if (state.downloadingAll) return;
    var pending = pendingDownloads();
    if (!pending.length) return;
    if (!isOnline()) {
      alert('Connect to the internet to download drawings that are not yet offline.');
      return;
    }
    state.downloadingAll = true;
    var failed = [];
    for (var i = 0; i < pending.length; i++) {
      state.downloadAllProgress = { current: i + 1, total: pending.length };
      updateDownloadAllBtn();
      try {
        await downloadDrawing(pending[i].id);
      } catch (err) {
        failed.push(pending[i].number || pending[i].id);
      }
    }
    state.downloadingAll = false;
    state.downloadAllProgress = null;
    updateDownloadAllBtn();
    if (failed.length) {
      alert('Could not download: ' + failed.join(', '));
    }
  }

  /* ---------- Drawing Viewer ---------- */
  var drawingViewer = null;
  function getViewer() {
    if (!drawingViewer) drawingViewer = new window.DrawingViewer($('screen-viewer'));
    return drawingViewer;
  }

  function loadScriptOnce(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing && ((src.indexOf('pdf.min.js') !== -1 && window.pdfjsLib) || (src.indexOf('pdf.worker') !== -1 && window.pdfjsWorker))) {
        resolve();
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Could not load PDF engine.')); };
      document.head.appendChild(s);
    });
  }

  function ensurePdfJs() {
    return Promise.resolve()
      .then(function () {
        if (window.pdfjsLib) return;
        return loadScriptOnce('/mydrawings/lib/pdf.min.js');
      })
      .then(function () {
        if (window.pdfjsWorker && window.pdfjsWorker.WorkerMessageHandler) return;
        return loadScriptOnce(PDFJS_WORKER);
      })
      .then(function () {
        if (!window.pdfjsLib) throw new Error('Could not load PDF engine.');
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        return window.pdfjsLib;
      });
  }

  async function openViewer(id, push) {
    var d = drawingById(id);
    if (!d) return;
    state.viewing = d;
    $('viewer-number').textContent = d.number;
    showScreen('screen-viewer');
    setOfflineUi();
    if (push !== false) {
      state.pushingView = true;
      try {
        history.pushState({ md: 'view', id: id }, '', '?d=' + encodeURIComponent(id));
      } catch (e) {}
      state.pushingView = false;
    }
    try {
      await ensurePdfJs();
      var blob = await fetchDrawingFile(d, null);
      if (state.viewing && state.viewing.id === id) await getViewer().open(blob, d);
    } catch (err) {
      getViewer().setStatus(err.message || 'Could not open drawing.');
    }
  }

  function closeViewer() {
    state.viewing = null;
    getViewer().close();
    document.getElementById('md-app').classList.remove('is-fs');
    showScreen('screen-list');
    if (new URLSearchParams(location.search).get('d')) {
      try { history.replaceState({ md: 'list' }, '', '/mydrawings/'); } catch (e) {}
    }
  }

  async function downloadCurrent(share) {
    var d = state.viewing;
    if (!d) return;
    try {
      var blob = await fetchDrawingFile(d, null);
      var name = d.number + ' ' + d.title + '.pdf';
      if (share && navigator.share && navigator.canShare) {
        var file = new File([blob], name, { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: d.number, text: d.title });
          return;
        }
      }
      if (share && navigator.share) {
        await navigator.share({ title: d.number, text: d.title, url: location.href });
        return;
      }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    } catch (err) {
      alert(err.message || 'Download failed.');
    }
  }

  /* ---------- Manage ---------- */
  function openManage() {
    closeSheet();
    hideManageForm();
    showScreen('screen-manage');
    renderManage();
  }

  function closeManage() {
    hideManageForm();
    showScreen('screen-list');
    renderCats();
    renderList();
  }

  function hideManageForm() {
    state.manageMode = null;
    if ($('mg-form')) $('mg-form').hidden = true;
    if ($('mg-home')) $('mg-home').hidden = false;
    if ($('mg-file')) $('mg-file').value = '';
    if ($('mg-error')) $('mg-error').textContent = '';
    if ($('mg-file-name')) $('mg-file-name').textContent = 'No file selected';
  }

  function fillCategorySelect(selected) {
    var sel = $('mg-category');
    var cats = state.categories.slice();
    if (!cats.length) cats = ['Uncategorised'];
    sel.innerHTML = cats.map(function (c) {
      var on = c === selected ? ' selected' : '';
      return '<option value="' + escapeHtml(c) + '"' + on + '>' + escapeHtml(c) + '</option>';
    }).join('');
  }

  function renderManage() {
    var host = $('mg-cats');
    if (!state.categories.length) {
      host.innerHTML = '<p class="mg-form-note">No categories yet.</p>';
    } else {
      host.innerHTML = state.categories.map(function (c) {
        return '<span class="mg-cat">' + escapeHtml(c) +
          '<button type="button" data-mg-del-cat="' + escapeHtml(c) + '" aria-label="Delete ' + escapeHtml(c) + '">&times;</button></span>';
      }).join('');
    }

    var list = $('mg-list');
    if (!state.drawings.length) {
      list.innerHTML = '<p class="mg-form-note">No drawings yet. Add one to get started.</p>';
      return;
    }
    var rows = state.drawings.slice().sort(function (a, b) {
      return String(a.number).localeCompare(String(b.number));
    });
    list.innerHTML = rows.map(function (d) {
      var off = state.offlineIds[d.id] ? ' · Offline' : '';
      return '<article class="mg-item" data-id="' + escapeHtml(d.id) + '">' +
        '<p class="mg-item-num">' + escapeHtml(d.number) + '</p>' +
        '<p class="mg-item-title">' + escapeHtml(d.title) + '</p>' +
        '<p class="mg-item-meta">Rev ' + escapeHtml(d.revision || '—') + ' · ' + escapeHtml(d.category) + off + '</p>' +
        '<div class="mg-item-actions">' +
          '<button type="button" class="is-update" data-mg="update">Update</button>' +
          '<button type="button" data-mg="edit">Edit</button>' +
          '<button type="button" class="is-danger" data-mg="delete">Delete</button>' +
        '</div></article>';
    }).join('');
  }

  function showManageForm(mode) {
    state.manageMode = mode;
    var main = document.querySelector('#screen-manage .md-main');
    if (main) main.scrollTop = 0;
    $('mg-home').hidden = true;
    $('mg-form').hidden = false;
    $('mg-error').textContent = '';
    $('mg-file').value = '';
    $('mg-file-name').textContent = 'No file selected';
    var d = mode.id ? drawingById(mode.id) : null;
    fillCategorySelect(d ? d.category : state.categories[0]);
    $('mg-number').disabled = false;
    $('mg-title').disabled = false;
    $('mg-category').disabled = false;
    $('mg-rev').disabled = false;
    $('mg-file-wrap').hidden = false;
    $('mg-file').required = false;

    if (mode.type === 'add') {
      $('mg-form-title').textContent = 'Add drawing';
      $('mg-form-note').textContent = 'The PDF is stored on this phone. It appears in the list as soon as you save.';
      $('mg-number').value = '';
      $('mg-title').value = '';
      $('mg-rev').value = 'A';
      $('mg-file-label').textContent = 'PDF file';
      $('mg-file').required = true;
      $('btn-mg-save').textContent = 'Add drawing';
    } else if (mode.type === 'edit') {
      $('mg-form-title').textContent = 'Edit drawing';
      $('mg-form-note').textContent = 'Change number, title, category or revision. Leave the file empty to keep the current PDF.';
      $('mg-number').value = d.number;
      $('mg-title').value = d.title;
      $('mg-rev').value = d.revision || '';
      $('mg-file-label').textContent = 'Replace PDF (optional)';
      $('btn-mg-save').textContent = 'Save changes';
    } else if (mode.type === 'update') {
      $('mg-form-title').textContent = 'Update drawing';
      $('mg-form-note').textContent = 'The new PDF replaces the old copy. Opening this drawing will show the new revision.';
      $('mg-number').value = d.number;
      $('mg-title').value = d.title;
      $('mg-rev').value = nextRevision(d.revision);
      $('mg-number').disabled = true;
      $('mg-category').disabled = true;
      $('mg-file-label').textContent = 'New PDF (replaces the old file)';
      $('mg-file').required = true;
      $('btn-mg-save').textContent = 'Replace drawing';
    }
  }

  async function addCategory() {
    var name = ($('mg-cat-input').value || '').trim();
    if (!name) return;
    var exists = state.categories.some(function (c) {
      return c.toLowerCase() === name.toLowerCase();
    });
    if (exists) {
      alert('That category already exists.');
      return;
    }
    state.categories.push(name);
    $('mg-cat-input').value = '';
    await saveCatalog();
    renderCats();
    renderManage();
  }

  async function deleteCategory(name) {
    var used = state.drawings.filter(function (d) { return d.category === name; }).length;
    var msg = used
      ? 'Delete “' + name + '”? ' + used + ' drawing(s) will move to Uncategorised.'
      : 'Delete category “' + name + '”?';
    if (!confirm(msg)) return;
    state.categories = state.categories.filter(function (c) { return c !== name; });
    var fallback = state.categories[0] || 'Uncategorised';
    if (used && state.categories.indexOf(fallback) === -1) {
      state.categories.push(fallback);
    }
    state.drawings.forEach(function (d) {
      if (d.category === name) d.category = fallback;
    });
    if (state.category === name) state.category = 'All';
    await saveCatalog();
    renderCats();
    renderManage();
  }

  async function deleteDrawing(id) {
    var d = drawingById(id);
    if (!d) return;
    if (!confirm('Delete ' + d.number + ' and its offline copy?')) return;
    state.drawings = state.drawings.filter(function (x) { return x.id !== id; });
    await idbDel('files', id);
    delete state.offlineIds[id];
    await saveCatalog();
    await refreshOfflineMap();
    renderManage();
    renderList();
  }

  async function submitManageForm(e) {
    e.preventDefault();
    var mode = state.manageMode;
    if (!mode) return;
    $('mg-error').textContent = '';
    var number = ($('mg-number').value || '').trim();
    var title = ($('mg-title').value || '').trim();
    var category = $('mg-category').value;
    var revision = ($('mg-rev').value || '').trim().toUpperCase() || 'A';
    var file = $('mg-file').files && $('mg-file').files[0];
    if (!number || !title) {
      $('mg-error').textContent = 'Number and title are required.';
      return;
    }
    try {
      if (mode.type === 'add') {
        if (!isPdfFile(file)) {
          $('mg-error').textContent = 'Choose a PDF file.';
          return;
        }
        var dup = state.drawings.some(function (d) {
          return d.number.toLowerCase() === number.toLowerCase();
        });
        if (dup) {
          $('mg-error').textContent = 'A drawing with that number already exists. Use Update to replace it.';
          return;
        }
        if (category && state.categories.indexOf(category) === -1) state.categories.push(category);
        var id = slugId(number);
        state.drawings.push({
          id: id,
          number: number,
          title: title,
          category: category || 'Uncategorised',
          revision: revision,
          updatedAt: todayIso(),
          sizeBytes: file.size,
          fileUrl: ''
        });
        await idbSet('files', id, { blob: await blobFromPdf(file), size: file.size, at: Date.now() });
        await saveCatalog();
        await refreshOfflineMap();
      } else if (mode.type === 'edit') {
        var d = drawingById(mode.id);
        if (!d) return;
        var clash = state.drawings.some(function (x) {
          return x.id !== d.id && x.number.toLowerCase() === number.toLowerCase();
        });
        if (clash) {
          $('mg-error').textContent = 'Another drawing already uses that number.';
          return;
        }
        if (file && !isPdfFile(file)) {
          $('mg-error').textContent = 'Choose a PDF file.';
          return;
        }
        d.number = number;
        d.title = title;
        d.category = category || d.category;
        d.revision = revision;
        d.updatedAt = todayIso();
        if (file) {
          await idbSet('files', d.id, { blob: await blobFromPdf(file), size: file.size, at: Date.now() });
          d.sizeBytes = file.size;
          d.fileUrl = '';
        }
        await saveCatalog();
        await refreshOfflineMap();
      } else if (mode.type === 'update') {
        var u = drawingById(mode.id);
        if (!u) return;
        if (!isPdfFile(file)) {
          $('mg-error').textContent = 'Choose the new PDF to replace the old one.';
          return;
        }
        await idbSet('files', u.id, { blob: await blobFromPdf(file), size: file.size, at: Date.now() });
        u.title = title || u.title;
        u.revision = revision;
        u.updatedAt = todayIso();
        u.sizeBytes = file.size;
        u.fileUrl = '';
        await saveCatalog();
        await refreshOfflineMap();
      }
      hideManageForm();
      renderManage();
      renderCats();
      renderList();
    } catch (err) {
      $('mg-error').textContent = err && err.message ? err.message : 'Could not save.';
    }
  }

  /* ---------- Sheets ---------- */
  function openSheet(html) {
    var sheet = $('sheet');
    sheet.innerHTML = '<div class="md-sheet-handle"></div>' + html;
    $('backdrop').classList.add('is-on');
    sheet.classList.add('is-on');
  }

  function closeSheet() {
    $('backdrop').classList.remove('is-on');
    $('sheet').classList.remove('is-on');
  }

  function openMainMenu() {
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    var installItem = standalone ? '' : '<button type="button" class="md-sheet-item" data-sheet="install"><svg class="md-icon" viewBox="0 0 24 24"><path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M5 21h14"/></svg>Add to Home Screen</button>';
    openSheet(
      '<h3 id="sheet-title">My Drawings</h3>' +
      '<button type="button" class="md-sheet-item" data-sheet="download-all"><svg class="md-icon" viewBox="0 0 24 24"><path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M5 21h14"/></svg>Download all drawings</button>' +
      installItem +
      '<button type="button" class="md-sheet-item" data-sheet="clear-offline"><svg class="md-icon" viewBox="0 0 24 24"><path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 14h10l1-14"/></svg>Remove all offline copies</button>' +
      '<button type="button" class="md-sheet-item" data-sheet="manage"><svg class="md-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1.1 1.5 1.2H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>Manage</button>' +
      '<button type="button" class="md-sheet-item is-danger" data-sheet="lock"><svg class="md-icon" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>Lock</button>' +
      (ios && !standalone ? '<p class="md-sheet-note">On iPhone: Share → Add to Home Screen.</p>' : '')
    );
  }

  function openViewerMenu() {
    var d = state.viewing;
    if (!d) return;
    var off = state.offlineIds[d.id]
      ? '<button type="button" class="md-sheet-item" data-sheet="remove-off"><svg class="md-icon" viewBox="0 0 24 24"><path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 14h10l1-14"/></svg>Remove offline copy</button>'
      : '<button type="button" class="md-sheet-item" data-sheet="save-off"><svg class="md-icon" viewBox="0 0 24 24"><path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M5 21h14"/></svg>Download</button>';
    openSheet(
      '<h3 id="sheet-title">' + escapeHtml(d.number) + '</h3>' +
      '<button type="button" class="md-sheet-item" data-sheet="info"><svg class="md-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 8h.01"/></svg>Drawing information</button>' +
      '<button type="button" class="md-sheet-item" data-sheet="share"><svg class="md-icon" viewBox="0 0 24 24"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v14"/></svg>Share</button>' +
      '<button type="button" class="md-sheet-item" data-sheet="download"><svg class="md-icon" viewBox="0 0 24 24"><path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M5 21h14"/></svg>Download</button>' +
      off
    );
  }

  function openDrawingInfo() {
    var d = state.viewing;
    if (!d) return;
    var pages = drawingViewer && drawingViewer.pageCount ? drawingViewer.pageCount : '—';
    openSheet(
      '<h3 id="sheet-title">Drawing information</h3>' +
      '<dl class="md-sheet-dl">' +
        '<dt>Drawing</dt><dd>' + escapeHtml(d.number) + '</dd>' +
        '<dt>Title</dt><dd>' + escapeHtml(d.title) + '</dd>' +
        '<dt>Revision</dt><dd>' + escapeHtml(d.revision) + '</dd>' +
        '<dt>Updated</dt><dd>' + escapeHtml(formatDate(d.updatedAt)) + '</dd>' +
        '<dt>File</dt><dd>PDF · ' + escapeHtml(formatBytes(d.sizeBytes)) + '</dd>' +
        '<dt>Pages</dt><dd>' + escapeHtml(String(pages)) + '</dd>' +
      '</dl>'
    );
  }

  async function handleSheet(act) {
    if (act === 'info') {
      openDrawingInfo();
      return;
    }
    closeSheet();
    if (act === 'download-all') {
      downloadAllDrawings();
      return;
    }
    if (act === 'manage') {
      openManage();
      return;
    }
    if (act === 'lock') {
      writeSession(false);
      $('pin-input').value = '';
      renderPinDots();
      hideManageForm();
      showScreen('screen-pin');
      closeViewerQuiet();
      $('pin-input').focus();
      return;
    }
    if (act === 'clear-offline') {
      var keys = await idbKeys('files');
      for (var i = 0; i < keys.length; i++) await idbDel('files', keys[i]);
      state.offlineIds = {};
      renderList();
      return;
    }
    if (act === 'install') {
      promptInstall();
      return;
    }
    if (act === 'share') { downloadCurrent(true); return; }
    if (act === 'download') { downloadCurrent(false); return; }
    if (act === 'save-off' && state.viewing) {
      await toggleOffline(state.viewing.id);
      return;
    }
    if (act === 'remove-off' && state.viewing) {
      await toggleOffline(state.viewing.id);
      return;
    }
    if (act === 'confirm-remove' && state.pendingRemoveId) {
      var rid = state.pendingRemoveId;
      state.pendingRemoveId = null;
      await removeOfflineCopy(rid);
    }
  }

  function closeViewerQuiet() {
    state.viewing = null;
    if (drawingViewer) drawingViewer.close();
    document.getElementById('md-app').classList.remove('is-fs');
  }

  /* ---------- PWA ---------- */
  function promptInstall() {
    var bar = $('install-bar');
    if (state.installPrompt) {
      state.installPrompt.prompt();
      state.installPrompt.userChoice.then(function () {
        state.installPrompt = null;
        if (bar) bar.classList.remove('is-on');
      });
      return;
    }
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    openSheet(
      '<h3 id="sheet-title">Add to Home Screen</h3>' +
      '<p class="md-sheet-note">' + (ios
        ? 'Tap the Share button in Safari, then choose Add to Home Screen.'
        : 'Use your browser menu and choose Install app or Add to Home Screen.') + '</p>'
    );
  }

  /* ---------- Init ---------- */
  async function boot() {
    try {
      if (DEMO) {
        $('pin-demo').textContent = 'Front-end preview · access key ' + DEMO_PIN;
      }
      setOfflineUi();
      renderPinDots();

      var session = readSession();
      if (session && session.ok) {
        var cached = await idbGet('meta', 'catalog');
        if (cached && cached.data) {
          applyCatalog(cached.data);
          await refreshOfflineMap();
          showScreen('screen-list');
          renderList();
          var deep = new URLSearchParams(location.search).get('d');
          if (deep && drawingById(deep)) openViewer(deep, false);
        } else {
          showScreen('screen-pin');
          setTimeout(function () { $('pin-input').focus(); }, 200);
        }
      } else {
        showScreen('screen-pin');
        setTimeout(function () { $('pin-input').focus(); }, 250);
      }
    } catch (err) {
      showScreen('screen-pin');
      setTimeout(function () { $('pin-input').focus(); }, 200);
    }
    $('md-boot').classList.add('is-done');
  }

  on($('pin-input'), 'input', function () {
    $('pin-input').value = pinValue();
    $('pin-error').textContent = '';
    renderPinDots();
    if (pinValue().length === 4) submitPin();
  });
  on($('pin-input'), 'keydown', function (e) {
    if (e.key === 'Enter') submitPin();
  });
  on($('pin-tap'), 'click', function () { $('pin-input').focus(); });
  on($('pin-dots'), 'click', function () { $('pin-input').focus(); });
  on($('pin-continue'), 'click', submitPin);
  bindPullToRefresh();

  on($('search'), 'input', function () {
    state.query = $('search').value || '';
    renderList();
  });
  on($('cats'), 'click', function (e) {
    var btn = e.target.closest('[data-cat]');
    if (!btn) return;
    state.category = btn.getAttribute('data-cat');
    renderCats();
    renderList();
  });
  on($('list'), 'click', function (e) {
    var card = e.target.closest('.md-card');
    if (!card) return;
    var id = card.getAttribute('data-id');
    var act = e.target.closest('[data-act]');
    var which = act ? act.getAttribute('data-act') : 'view';
    if (which === 'offline') {
      e.preventDefault();
      toggleOffline(id);
      return;
    }
    openViewer(id, true);
  });

  on($('btn-menu'), 'click', openMainMenu);
  on($('btn-download-all'), 'click', downloadAllDrawings);
  on($('btn-manage-back'), 'click', closeManage);
  on($('btn-mg-add-cat'), 'click', addCategory);
  on($('mg-cat-input'), 'keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCategory();
    }
  });
  on($('btn-mg-add'), 'click', function () { showManageForm({ type: 'add' }); });
  on($('btn-mg-cancel'), 'click', hideManageForm);
  on($('mg-form'), 'submit', submitManageForm);
  on($('mg-file'), 'change', function () {
    var f = $('mg-file').files && $('mg-file').files[0];
    $('mg-file-name').textContent = f ? f.name : 'No file selected';
  });
  on($('mg-cats'), 'click', function (e) {
    var btn = e.target.closest('[data-mg-del-cat]');
    if (btn) deleteCategory(btn.getAttribute('data-mg-del-cat'));
  });
  on($('mg-list'), 'click', function (e) {
    var item = e.target.closest('.mg-item');
    var act = e.target.closest('[data-mg]');
    if (!item || !act) return;
    var id = item.getAttribute('data-id');
    var which = act.getAttribute('data-mg');
    if (which === 'update') showManageForm({ type: 'update', id: id });
    else if (which === 'edit') showManageForm({ type: 'edit', id: id });
    else if (which === 'delete') deleteDrawing(id);
  });
  on($('btn-viewer-more'), 'click', openViewerMenu);
  on($('btn-back'), 'click', function () {
    if (history.state && history.state.md === 'view') history.back();
    else closeViewer();
  });

  on($('backdrop'), 'click', closeSheet);
  on($('sheet'), 'click', function (e) {
    var item = e.target.closest('[data-sheet]');
    if (item) handleSheet(item.getAttribute('data-sheet'));
  });
  on($('btn-install'), 'click', promptInstall);

  on(window, 'online', function () { setOfflineUi(); });
  on(window, 'offline', function () { setOfflineUi(); });
  on(window, 'popstate', function () {
    if (state.pushingView) return;
    var d = new URLSearchParams(location.search).get('d');
    if (d && drawingById(d)) openViewer(d, false);
    else if ($('screen-viewer').classList.contains('is-active')) closeViewer();
  });

  on(window, 'beforeinstallprompt', function (e) {
    e.preventDefault();
    state.installPrompt = e;
    var standalone = window.matchMedia('(display-mode: standalone)').matches;
    if (!standalone) $('install-bar').classList.add('is-on');
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/mydrawings/sw.js', { scope: '/mydrawings/' }).catch(function () {});
  }

  boot();
})();
