/* My Drawings — mobile PWA (frontend preview). Swap fetchCatalog / fetchDrawingFile when the API exists. */
(function () {
  'use strict';

  var SESSION_KEY = 'proconix_mydrawings_session';
  var DEVICE_KEY = 'proconix_mydrawings_device';
  var PENDING_KEY = 'proconix_mydrawings_pending';
  var FLOOR_KEY = 'proconix_mydrawings_floor';
  var DB_NAME = 'proconix-mydrawings';
  var DB_VER = 1;
  var PDFJS_WORKER = '/mydrawings/lib/pdf.worker.min.js';
  var FLOORS = [
    { id: 'ground', label: 'Ground Floor' },
    { id: '1', label: 'Floor 1' },
    { id: '2', label: 'Floor 2' },
    { id: '3', label: 'Floor 3' },
    { id: '4', label: 'Floor 4' },
    { id: '5', label: 'Floor 5' }
  ];

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
    manageMode: null,
    role: 'worker',
    pinMode: 'worker',
    adminPin: '',
    pinFrom: '',
    floor: null,
    floorFrom: '',
    pendingDeepLink: null
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

  function formatActivityWhen(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var hours = d.getHours();
    var ampm = hours >= 12 ? 'PM' : 'AM';
    var h12 = hours % 12 || 12;
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear() + ' ' + h12 + ':' + pad2(d.getMinutes()) + ' ' + ampm;
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

  /* ---------- Catalog API ---------- */
  function sessionPin() {
    var s = readSession();
    return s && s.pin ? String(s.pin) : '';
  }

  function sessionDevice() {
    var s = readSession();
    return s && s.deviceToken ? String(s.deviceToken) : '';
  }

  function sessionSecret() {
    return sessionDevice() || sessionPin();
  }

  function pinHeaders(extra) {
    var headers = extra ? Object.assign({}, extra) : {};
    var adminPin = state.adminPin || (state.role === 'admin' ? sessionPin() : '');
    var device = sessionDevice();
    var pin = sessionPin();
    if (adminPin) headers['X-MyDrawings-Pin'] = adminPin;
    if (device) headers['X-MyDrawings-Device'] = device;
    else if (!adminPin && pin) headers['X-MyDrawings-Pin'] = pin;
    return headers;
  }

  async function cacheCatalog(data, secret) {
    var hash = secret ? await sha256('mydrawings:' + secret) : null;
    await idbSet('meta', 'catalog', {
      pinHash: hash,
      role: data.role || state.role,
      data: {
        project: data.project,
        categories: data.categories || [],
        drawings: data.drawings || []
      },
      savedAt: Date.now()
    });
  }

  async function dropStaleOfflineCopies() {
    var keys = await idbKeys('files');
    for (var i = 0; i < keys.length; i++) {
      var id = keys[i];
      var d = drawingById(id);
      if (!d) {
        await idbDel('files', id);
        continue;
      }
      var rec = await idbGet('files', id);
      if (rec && rec.updatedAt && d.updatedAt && rec.updatedAt !== d.updatedAt) {
        await idbDel('files', id);
      }
    }
    await refreshOfflineMap();
  }

  async function applyRemoteCatalog(data) {
    if (data.role) state.role = data.role;
    applyCatalog(data);
    await cacheCatalog(data, sessionSecret());
    await dropStaleOfflineCopies();
  }

  async function apiJson(path, opts) {
    opts = opts || {};
    if (!isOnline()) throw new Error('Connect to the internet to update drawings.');
    var headers = pinHeaders(opts.headers || {});
    var body = opts.body;
    if (body && !(body instanceof FormData) && typeof body !== 'string') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    var res = await fetch('/api/my-drawings' + path, {
      method: opts.method || 'GET',
      credentials: 'same-origin',
      headers: headers,
      body: body
    });
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok || (data && data.success === false)) {
      throw new Error((data && data.message) || 'Request failed.');
    }
    return data;
  }

  async function fetchCatalog(pin) {
    return fetchRemoteCatalog({ pin: pin });
  }

  async function fetchRemoteCatalog(opts) {
    opts = opts || {};
    var secret = opts.deviceToken || opts.pin || '';
    var cached = await idbGet('meta', 'catalog');
    var hash = secret ? await sha256('mydrawings:' + secret) : null;
    function fromCache() {
      if (cached && cached.data && (!hash || cached.pinHash === hash)) {
        state.role = cached.role || 'worker';
        return cached.data;
      }
      return null;
    }
    if (isOnline()) {
      try {
        var res;
        if (opts.deviceToken) {
          res = await fetch('/api/my-drawings/catalog', {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'X-MyDrawings-Device': opts.deviceToken }
          });
        } else if (opts.verify) {
          res = await fetch('/api/my-drawings/verify', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: opts.email, pin: opts.pin })
          });
        } else {
          res = await fetch('/api/my-drawings/unlock', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: opts.pin })
          });
        }
        var data = null;
        try { data = await res.json(); } catch (e) { data = null; }
        if (res.status === 401) {
          var bad = new Error((data && data.message) || 'Incorrect access key');
          bad.code = 'bad_pin';
          throw bad;
        }
        if (!res.ok || !data || data.success === false) {
          var fallback = fromCache();
          if (fallback) return fallback;
          var fail = new Error((data && data.message) || 'Could not load drawings.');
          throw fail;
        }
        state.role = data.role || 'worker';
        await cacheCatalog(data, data.deviceToken || secret);
        return data;
      } catch (err) {
        if (err && err.code === 'bad_pin') throw err;
        var cachedOk = fromCache();
        if (cachedOk) return cachedOk;
        throw err;
      }
    }
    var offline = fromCache();
    if (offline) return offline;
    var offlineErr = new Error('No drawings stored on this device yet.');
    offlineErr.code = 'bad_pin';
    throw offlineErr;
  }

  async function refreshCatalogFromServer() {
    if ($('screen-viewer') && $('screen-viewer').classList.contains('is-active')) return;
    if (!isOnline() || !sessionSecret()) return;
    try {
      var data = await apiJson('/catalog');
      var keepAdmin = !!state.adminPin;
      await applyRemoteCatalog(data);
      if (keepAdmin) state.role = 'admin';
      renderList();
    } catch (e) {}
  }

  async function updateDrawingsList() {
    var btn = $('btn-update');
    if (!isOnline()) {
      alert('Connect to the internet to update drawings.');
      return;
    }
    if (!sessionSecret() && !state.adminPin) {
      alert('Sign in to update drawings.');
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Updating…';
    }
    var before = {};
    (state.drawings || []).forEach(function (d) { before[d.id] = true; });
    try {
      var data = await apiJson('/catalog');
      var keepAdmin = !!state.adminPin;
      await applyRemoteCatalog(data);
      if (keepAdmin) state.role = 'admin';
      renderList();
      var added = 0;
      (state.drawings || []).forEach(function (d) {
        if (!before[d.id]) added += 1;
      });
      if (btn) btn.textContent = added ? (added + ' new') : 'Up to date';
    } catch (err) {
      if (btn) btn.textContent = 'Update';
      alert(err && err.message ? err.message : 'Could not update drawings.');
    }
    setTimeout(function () {
      if (!btn) return;
      btn.textContent = 'Update';
      btn.disabled = false;
    }, 1600);
  }

  async function fetchDrawingFile(drawing, onProgress) {
    var local = await idbGet('files', drawing.id);
    if (local && local.blob) {
      if (local.updatedAt && drawing.updatedAt && local.updatedAt === drawing.updatedAt) return local.blob;
      if (!drawing.updatedAt) return local.blob;
    }
    if (!drawing.fileUrl) throw new Error('This drawing has no file on the server.');
    if (!isOnline()) throw new Error('This drawing is not available offline.');
    var res = await fetch(drawing.fileUrl, { credentials: 'same-origin', headers: pinHeaders() });
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
      var raw = localStorage.getItem(DEVICE_KEY) || sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.ok) return null;
      if (parsed.deviceToken || parsed.pin) {
        try { localStorage.setItem(DEVICE_KEY, JSON.stringify(parsed)); } catch (e2) {}
      }
      return parsed;
    } catch (e) { return null; }
  }

  function writeSession(ok, extra) {
    try {
      if (!ok) {
        localStorage.removeItem(DEVICE_KEY);
        sessionStorage.removeItem(SESSION_KEY);
        state.role = 'worker';
        return;
      }
      var prev = readSession() || {};
      var payload = {
        ok: true,
        at: Date.now(),
        role: extra && extra.role ? extra.role : (prev.role || state.role),
        pin: extra && extra.pin != null ? String(extra.pin) : prev.pin || '',
        deviceToken: extra && extra.deviceToken != null ? String(extra.deviceToken) : prev.deviceToken || '',
        firstName: extra && extra.firstName != null ? extra.firstName : prev.firstName || '',
        lastName: extra && extra.lastName != null ? extra.lastName : prev.lastName || '',
        email: extra && extra.email != null ? extra.email : prev.email || ''
      };
      if (payload.role !== 'admin') payload.pin = '';
      localStorage.setItem(DEVICE_KEY, JSON.stringify(payload));
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  function readPending() {
    try {
      var raw = localStorage.getItem(PENDING_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writePending(data) {
    try {
      if (!data) localStorage.removeItem(PENDING_KEY);
      else localStorage.setItem(PENDING_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function floorById(id) {
    for (var i = 0; i < FLOORS.length; i++) {
      if (FLOORS[i].id === id) return FLOORS[i];
    }
    return null;
  }

  function readFloor() {
    try {
      return floorById(localStorage.getItem(FLOOR_KEY) || '');
    } catch (e) { return null; }
  }

  function writeFloor(id) {
    var floor = floorById(id);
    if (!floor) return null;
    try { localStorage.setItem(FLOOR_KEY, floor.id); } catch (e) {}
    state.floor = floor;
    return floor;
  }

  function updateHeaderFloor() {
    var chip = $('btn-floor');
    var floor = state.floor || readFloor();
    state.floor = floor;
    if (!chip) return;
    if (floor) {
      chip.textContent = floor.label;
      chip.hidden = false;
    } else {
      chip.textContent = 'Floor';
      chip.hidden = true;
    }
  }

  function renderFloorOptions() {
    var host = $('floor-grid');
    if (!host) return;
    var current = (state.floor || readFloor() || {}).id || '';
    host.innerHTML = FLOORS.map(function (f) {
      var wide = f.id === 'ground' ? ' md-floor-wide' : '';
      var on = f.id === current ? ' is-on' : '';
      return '<button type="button" class="md-floor-btn' + wide + on + '" data-floor="' + escapeHtml(f.id) + '">' +
        escapeHtml(f.label) + '</button>';
    }).join('');
  }

  function showFloorPicker(from) {
    state.floorFrom = from || '';
    var canCancel = !!(state.floor || readFloor()) && state.floorFrom !== 'boot';
    if ($('floor-back-wrap')) $('floor-back-wrap').hidden = !canCancel;
    renderFloorOptions();
    showScreen('screen-floor');
  }

  function openFloorHome() {
    var deep = state.pendingDeepLink || new URLSearchParams(location.search).get('d');
    state.pendingDeepLink = null;
    updateHeaderFloor();
    showScreen('screen-list');
    renderList();
    if (deep && drawingById(deep)) openViewer(deep, false);
  }

  function ensureFloorThenHome(opts) {
    opts = opts || {};
    if (opts.deepLink) state.pendingDeepLink = opts.deepLink;
    var floor = readFloor();
    if (!floor) {
      showFloorPicker(opts.from || 'boot');
      return;
    }
    state.floor = floor;
    openFloorHome();
  }

  function selectFloor(id) {
    if (!writeFloor(id)) return;
    vibrate(8);
    openFloorHome();
  }

  /* ---------- Screens ---------- */
  function showScreen(id) {
    ['screen-register', 'screen-login', 'screen-pin', 'screen-floor', 'screen-list', 'screen-activity', 'screen-manage', 'screen-viewer'].forEach(function (sid) {
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

  function pendingDetails() {
    return readPending() || {};
  }

  function fillRegisterForm(pending) {
    pending = pending || readPending() || {};
    if ($('reg-first')) $('reg-first').value = pending.firstName || '';
    if ($('reg-last')) $('reg-last').value = pending.lastName || '';
    if ($('reg-email')) $('reg-email').value = pending.email || '';
    if ($('reg-error')) $('reg-error').textContent = '';
  }

  function configurePinScreen(mode) {
    state.pinMode = mode === 'admin' ? 'admin' : 'worker';
    var pending = pendingDetails();
    var worker = state.pinMode === 'worker';
    $('pin-title').textContent = worker ? 'Enter your access key' : 'Enter administration key';
    $('pin-hint').textContent = worker
      ? (pending.email ? 'We sent a 4-digit key to ' + pending.email : 'We sent a 4-digit key to your email')
      : '4-digit administration key';
    $('pin-worker-actions').hidden = !worker;
    $('pin-admin-back-wrap').hidden = worker;
    $('pin-error').textContent = '';
    $('pin-input').value = '';
    renderPinDots();
  }

  function showRegister() {
    fillRegisterForm();
    showScreen('screen-register');
    setTimeout(function () {
      var first = $('reg-first');
      if (first) first.focus();
    }, 200);
  }

  function showLogin() {
    var pending = readPending() || {};
    if ($('login-email')) $('login-email').value = pending.email || '';
    if ($('login-error')) $('login-error').textContent = '';
    showScreen('screen-login');
    setTimeout(function () {
      var email = $('login-email');
      if (email) email.focus();
    }, 200);
  }

  function backFromPin() {
    if (state.pinFrom === 'menu') {
      showScreen('screen-list');
      return;
    }
    var pending = pendingDetails();
    if (pending.from === 'login') showLogin();
    else showRegister();
  }

  function showPin(mode, from) {
    state.pinFrom = from || '';
    configurePinScreen(mode);
    showScreen('screen-pin');
    setTimeout(function () { $('pin-input').focus(); }, 200);
  }

  async function enterApp(data, extra) {
    writeSession(true, extra);
    writePending(null);
    $('pin-input').value = '';
    renderPinDots();
    applyCatalog(data);
    await cacheCatalog(data, (extra && extra.deviceToken) || (extra && extra.pin) || sessionSecret());
    await dropStaleOfflineCopies();
    ensureFloorThenHome({
      from: 'boot',
      deepLink: new URLSearchParams(location.search).get('d')
    });
  }

  async function postJson(path, body) {
    var res = await fetch('/api/my-drawings' + path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok || (data && data.success === false)) {
      throw new Error((data && data.message) || 'Request failed.');
    }
    return data;
  }

  async function submitRegister(e) {
    if (e) e.preventDefault();
    var firstName = ($('reg-first').value || '').replace(/\s+/g, ' ').trim();
    var lastName = ($('reg-last').value || '').replace(/\s+/g, ' ').trim();
    var email = ($('reg-email').value || '').trim().toLowerCase();
    $('reg-error').textContent = '';
    if (!isOnline()) {
      $('reg-error').textContent = 'Connect to the internet to get your access key.';
      return;
    }
    if (!firstName || !lastName) {
      $('reg-error').textContent = 'First name and last name are required.';
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      $('reg-error').textContent = 'Enter a valid email address.';
      return;
    }
    $('reg-continue').disabled = true;
    try {
      await postJson('/register', { firstName: firstName, lastName: lastName, email: email });
      writePending({ firstName: firstName, lastName: lastName, email: email, from: 'register' });
      showPin('worker');
    } catch (err) {
      $('reg-error').textContent = err && err.message ? err.message : 'Could not send your access key.';
    }
    $('reg-continue').disabled = false;
  }

  async function submitLogin(e) {
    if (e) e.preventDefault();
    var email = ($('login-email').value || '').trim().toLowerCase();
    $('login-error').textContent = '';
    if (!isOnline()) {
      $('login-error').textContent = 'Connect to the internet to sign in.';
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      $('login-error').textContent = 'Enter a valid email address.';
      return;
    }
    $('login-continue').disabled = true;
    try {
      var data = await postJson('/login', { email: email });
      await enterApp(data, {
        deviceToken: data.deviceToken,
        role: 'worker',
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        email: data.email || email
      });
    } catch (err) {
      $('login-error').textContent = err && err.message ? err.message : 'No account found for that email.';
    }
    $('login-continue').disabled = false;
  }

  async function resendKey() {
    var pending = pendingDetails();
    if (!pending.email) {
      backFromPin();
      return;
    }
    $('pin-error').textContent = '';
    try {
      if (pending.from === 'login') {
        showLogin();
        return;
      }
      await postJson('/register', {
        firstName: pending.firstName || '',
        lastName: pending.lastName || '',
        email: pending.email
      });
      $('pin-hint').textContent = 'We sent a new 4-digit key to ' + pending.email;
    } catch (err) {
      $('pin-error').textContent = err && err.message ? err.message : 'Could not resend the key.';
    }
  }

  async function submitPin() {
    var pin = pinValue();
    if (pin.length !== 4) return;
    if (!isOnline()) {
      $('pin-error').textContent = 'Connect to the internet to verify your key.';
      return;
    }
    $('pin-error').textContent = '';
    $('pin-continue').disabled = true;
    try {
      var data;
      var extra;
      if (state.pinMode === 'admin') {
        data = await fetchRemoteCatalog({ pin: pin });
        state.adminPin = pin;
        extra = {
          pin: sessionDevice() ? '' : pin,
          role: 'admin',
          deviceToken: sessionDevice()
        };
        await enterApp(data, extra);
        openManage();
        return;
      } else {
        var pending = pendingDetails();
        if (!pending.email) {
          backFromPin();
          return;
        }
        data = await fetchRemoteCatalog({ verify: true, email: pending.email, pin: pin });
        extra = {
          deviceToken: data.deviceToken,
          role: 'worker',
          firstName: data.firstName || pending.firstName,
          lastName: data.lastName || pending.lastName,
          email: data.email || pending.email
        };
      }
      await enterApp(data, extra);
    } catch (err) {
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
    updateHeaderFloor();
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
            '<p class="md-card-title">' + escapeHtml(d.title) + '</p>' +
            '<p class="md-card-num">' + escapeHtml(d.number) + '</p>' +
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
      await idbSet('files', id, { blob: blob, size: blob.size, at: Date.now(), updatedAt: d.updatedAt, revision: d.revision });
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

  /* ---------- Activity ---------- */
  function activitySentence(row) {
    var who = row.actorName || 'Someone';
    var title = row.drawingTitle ? '"' + row.drawingTitle + '"' : '';
    var number = row.drawingNumber ? '"' + row.drawingNumber + '"' : '';
    var bits = [title, number].filter(Boolean).join(' ');
    var when = row.at ? ' on ' + formatActivityWhen(row.at) : '';
    if (row.action === 'deleted') return who + ' deleted drawing ' + bits + when;
    if (row.action === 'added') return who + ' added drawing ' + bits + when;
    if (row.action === 'updated') return who + ' updated drawing ' + bits + when;
    if (row.action === 'added_category') return who + ' added category ' + (title || bits) + when;
    if (row.action === 'deleted_category') return who + ' deleted category ' + (title || bits) + when;
    return who + ' ' + (row.action || 'updated') + (bits ? ' ' + bits : '') + when;
  }

  function renderActivity(items) {
    var host = $('activity-list');
    if (!host) return;
    if (!items || !items.length) {
      host.innerHTML = '<div class="md-empty"><h3>No activity yet</h3><p>Adds, updates and deletions will appear here.</p></div>';
      return;
    }
    host.innerHTML = items.map(function (row) {
      return '<article class="md-activity-item"><p>' + escapeHtml(activitySentence(row)) + '</p></article>';
    }).join('');
  }

  async function openActivity() {
    if (!isOnline()) {
      alert('Connect to the internet to view activity.');
      return;
    }
    closeSheet();
    showScreen('screen-activity');
    if ($('activity-list')) $('activity-list').innerHTML = '<p class="md-activity-loading">Loading activity…</p>';
    try {
      var data = await apiJson('/activity');
      renderActivity(data.activity || []);
    } catch (err) {
      if ($('activity-list')) {
        $('activity-list').innerHTML = '<div class="md-empty"><h3>Could not load activity</h3><p>' + escapeHtml(err && err.message ? err.message : 'Try again.') + '</p></div>';
      }
    }
  }

  function closeActivity() {
    showScreen('screen-list');
    renderCats();
    renderList();
  }

  /* ---------- Manage ---------- */
  function openManage() {
    if (state.role !== 'admin') {
      alert('Enter the admin key to manage drawings.');
      return;
    }
    if (!isOnline()) {
      alert('Connect to the internet to manage drawings.');
      return;
    }
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
        '<p class="mg-item-title">' + escapeHtml(d.title) + '</p>' +
        '<p class="mg-item-num">' + escapeHtml(d.number) + '</p>' +
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
      $('mg-form-note').textContent = 'The PDF is stored on the server. Workers see it the next time they open My Drawings.';
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
      $('mg-form-note').textContent = 'The new PDF replaces the old copy on the server. Workers get the new revision.';
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
    try {
      var data = await apiJson('/categories', { method: 'POST', body: { name: name } });
      $('mg-cat-input').value = '';
      await applyRemoteCatalog(data);
      renderManage();
      renderList();
    } catch (err) {
      alert(err && err.message ? err.message : 'Could not add category.');
    }
  }

  async function deleteCategory(name) {
    var used = state.drawings.filter(function (d) { return d.category === name; }).length;
    var msg = used
      ? 'Delete “' + name + '”? ' + used + ' drawing(s) will move to Uncategorised.'
      : 'Delete category “' + name + '”?';
    if (!confirm(msg)) return;
    try {
      var data = await apiJson('/categories/delete', { method: 'POST', body: { name: name } });
      if (state.category === name) state.category = 'All';
      await applyRemoteCatalog(data);
      renderManage();
      renderList();
    } catch (err) {
      alert(err && err.message ? err.message : 'Could not delete category.');
    }
  }

  async function deleteDrawing(id) {
    var d = drawingById(id);
    if (!d) return;
    if (!confirm('Delete ' + d.number + ' from the server for everyone?')) return;
    try {
      var data = await apiJson('/drawings/' + encodeURIComponent(id), { method: 'DELETE' });
      await idbDel('files', id);
      await applyRemoteCatalog(data);
      renderManage();
      renderList();
    } catch (err) {
      alert(err && err.message ? err.message : 'Could not delete drawing.');
    }
  }

  function drawingFormData(fields, file) {
    var fd = new FormData();
    Object.keys(fields).forEach(function (key) {
      if (fields[key] != null) fd.append(key, fields[key]);
    });
    if (file) fd.append('file', file, file.name || 'drawing.pdf');
    return fd;
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
      var data;
      if (mode.type === 'add') {
        if (!isPdfFile(file)) {
          $('mg-error').textContent = 'Choose a PDF file.';
          return;
        }
        data = await apiJson('/drawings', {
          method: 'POST',
          body: drawingFormData({ number: number, title: title, category: category, revision: revision }, file)
        });
      } else if (mode.type === 'edit') {
        if (file && !isPdfFile(file)) {
          $('mg-error').textContent = 'Choose a PDF file.';
          return;
        }
        data = await apiJson('/drawings/' + encodeURIComponent(mode.id), {
          method: 'PUT',
          body: drawingFormData({ number: number, title: title, category: category, revision: revision }, file)
        });
      } else if (mode.type === 'update') {
        if (!isPdfFile(file)) {
          $('mg-error').textContent = 'Choose the new PDF to replace the old one.';
          return;
        }
        data = await apiJson('/drawings/' + encodeURIComponent(mode.id) + '/update', {
          method: 'POST',
          body: drawingFormData({ title: title, revision: revision }, file)
        });
      }
      if (mode.id) await idbDel('files', mode.id);
      await applyRemoteCatalog(data);
      hideManageForm();
      renderManage();
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
      '<button type="button" class="md-sheet-item" data-sheet="administration"><svg class="md-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M4 12h2M18 12h2M12 4v2M12 18v2"/></svg>Administration</button>' +
      '<button type="button" class="md-sheet-item" data-sheet="activity"><svg class="md-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>Activity</button>' +
      '<button type="button" class="md-sheet-item" data-sheet="change-floor"><svg class="md-icon" viewBox="0 0 24 24"><path d="M4 20h16"/><path d="M6 20V10l6-4 6 4v10"/><path d="M10 20v-4h4v4"/></svg>Change floor' +
        (state.floor ? ' (' + escapeHtml(state.floor.label) + ')' : '') + '</button>' +
      '<button type="button" class="md-sheet-item" data-sheet="download-all"><svg class="md-icon" viewBox="0 0 24 24"><path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M5 21h14"/></svg>Download all drawings</button>' +
      installItem +
      '<button type="button" class="md-sheet-item" data-sheet="clear-offline"><svg class="md-icon" viewBox="0 0 24 24"><path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 14h10l1-14"/></svg>Remove all offline copies</button>' +
      (state.role === 'admin'
        ? '<button type="button" class="md-sheet-item is-danger" data-sheet="lock"><svg class="md-icon" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>Exit administration</button>'
        : '') +
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
    if (act === 'administration') {
      if (state.role === 'admin') {
        openManage();
        return;
      }
      showPin('admin', 'menu');
      return;
    }
    if (act === 'activity') {
      openActivity();
      return;
    }
    if (act === 'change-floor') {
      showFloorPicker('menu');
      return;
    }
    if (act === 'download-all') {
      downloadAllDrawings();
      return;
    }
    if (act === 'manage') {
      openManage();
      return;
    }
    if (act === 'lock') {
      state.adminPin = '';
      hideManageForm();
      closeViewerQuiet();
      if (sessionDevice()) {
        var s = readSession() || {};
        writeSession(true, {
          role: 'worker',
          pin: '',
          deviceToken: sessionDevice(),
          firstName: s.firstName || '',
          lastName: s.lastName || '',
          email: s.email || ''
        });
        state.role = 'worker';
        showScreen('screen-list');
      } else {
        writeSession(false);
        writePending(null);
        showRegister();
      }
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
      setOfflineUi();
      renderPinDots();

      var session = readSession();
      if (session && session.ok && session.pin && session.role !== 'admin' && !session.deviceToken) {
        writeSession(false);
        session = null;
      }
      if (session && session.ok && session.deviceToken) {
        state.role = session.role || 'worker';
        try {
          var data = await fetchRemoteCatalog({ deviceToken: session.deviceToken });
          await enterApp(data, {
            deviceToken: session.deviceToken,
            role: data.role || 'worker',
            firstName: session.firstName,
            lastName: session.lastName,
            email: session.email
          });
        } catch (err) {
          var cached = await idbGet('meta', 'catalog');
          if (!isOnline() && cached && cached.data) {
            state.role = cached.role || session.role || 'worker';
            applyCatalog(cached.data);
            await refreshOfflineMap();
            ensureFloorThenHome({ from: 'boot' });
          } else if (err && err.code === 'bad_pin') {
            writeSession(false);
            showRegister();
          } else if (cached && cached.data) {
            state.role = cached.role || session.role || 'worker';
            applyCatalog(cached.data);
            await refreshOfflineMap();
            ensureFloorThenHome({ from: 'boot' });
          } else {
            writeSession(false);
            showRegister();
          }
        }
      } else if (session && session.ok && session.pin && session.role === 'admin') {
        state.role = 'admin';
        try {
          var adminData = await fetchRemoteCatalog({ pin: session.pin });
          await enterApp(adminData, { pin: session.pin, role: 'admin' });
        } catch (err) {
          var adminCache = await idbGet('meta', 'catalog');
          if (adminCache && adminCache.data) {
            applyCatalog(adminCache.data);
            await refreshOfflineMap();
            ensureFloorThenHome({ from: 'boot' });
          } else {
            writeSession(false);
            showPin('admin');
          }
        }
      } else {
        var pending = readPending();
        if (pending && pending.email && pending.from !== 'login') showPin('worker');
        else if (pending && pending.from === 'login') showLogin();
        else showRegister();
      }
    } catch (err) {
      var pendingFail = readPending();
      if (pendingFail && pendingFail.email && pendingFail.from !== 'login') showPin('worker');
      else showRegister();
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
  on($('register-form'), 'submit', submitRegister);
  on($('login-form'), 'submit', submitLogin);
  on($('btn-have-account'), 'click', showLogin);
  on($('btn-create-account'), 'click', showRegister);
  on($('btn-admin-login'), 'click', function () { showPin('admin', 'login'); });
  on($('btn-admin-login-2'), 'click', function () { showPin('admin', 'login'); });
  on($('pin-resend'), 'click', resendKey);
  on($('pin-change'), 'click', backFromPin);
  on($('pin-admin-back'), 'click', backFromPin);

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

  on($('floor-grid'), 'click', function (e) {
    var btn = e.target.closest('[data-floor]');
    if (!btn) return;
    selectFloor(btn.getAttribute('data-floor'));
  });
  on($('btn-floor'), 'click', function () { showFloorPicker('header'); });
  on($('btn-floor-back'), 'click', function () {
    if (state.floor || readFloor()) openFloorHome();
  });
  on($('btn-menu'), 'click', openMainMenu);
  on($('btn-update'), 'click', updateDrawingsList);
  on($('btn-download-all'), 'click', downloadAllDrawings);
  on($('btn-activity-back'), 'click', closeActivity);
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

  on(window, 'online', function () {
    setOfflineUi();
    refreshCatalogFromServer();
  });
  on(window, 'pageshow', function () { refreshCatalogFromServer(); });
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
