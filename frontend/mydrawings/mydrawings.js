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
    downloadAllProgress: null
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

  /* ---------- Catalog (replace this block with API calls) ---------- */
  async function fetchCatalog(pin) {
    var cached = await idbGet('meta', 'catalog');
    if (isOnline()) {
      if (DEMO) {
        if (String(pin) !== DEMO_PIN) {
          var err = new Error('Incorrect access key');
          err.code = 'bad_pin';
          throw err;
        }
        var data = {
          project: CATALOG.project,
          categories: CATALOG.categories.slice(),
          drawings: CATALOG.drawings.map(function (d) { return Object.assign({}, d); })
        };
        var hash = await sha256('mydrawings:' + pin);
        await idbSet('meta', 'catalog', { pinHash: hash, data: data, savedAt: Date.now() });
        return data;
      }
    }
    if (cached && cached.data) {
      var ok = await sha256('mydrawings:' + pin);
      if (cached.pinHash && cached.pinHash !== ok) {
        var err2 = new Error('Incorrect access key');
        err2.code = 'bad_pin';
        throw err2;
      }
      return cached.data;
    }
    var offlineErr = new Error(isOnline() ? 'Incorrect access key' : 'No drawings stored on this device yet.');
    offlineErr.code = 'bad_pin';
    throw offlineErr;
  }

  async function fetchDrawingFile(drawing, onProgress) {
    var local = await idbGet('files', drawing.id);
    if (local && local.blob) return local.blob;
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
    ['screen-pin', 'screen-list', 'screen-viewer'].forEach(function (sid) {
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
    if (act === 'lock') {
      writeSession(false);
      $('pin-input').value = '';
      renderPinDots();
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
