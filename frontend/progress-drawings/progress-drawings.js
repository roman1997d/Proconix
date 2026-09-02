/* Progress Drawings — Phase 1: auth, floor, general drawings, PDF viewer */
(function () {
  'use strict';

  var DEVICE_KEY = 'proconix_mydrawings_device';
  var SESSION_KEY = 'proconix_mydrawings_session';
  var FLOOR_KEY = 'proconix_progress_drawings_floor';
  var PDFJS_WORKER = '/mydrawings/lib/pdf.worker.min.js';

  var FLOORS = [
    { id: 'ground', label: 'Ground Floor' },
    { id: '1', label: 'Floor 1' },
    { id: '2', label: 'Floor 2' },
    { id: '3', label: 'Floor 3' },
    { id: '4', label: 'Floor 4' },
    { id: '5', label: 'Floor 5' }
  ];

  var state = {
    project: null,
    drawings: [],
    bookings: [],
    workTypes: [],
    floors: FLOORS.slice(),
    floor: null,
    adminPin: '',
    role: 'worker',
    viewing: null
  };

  var drawingViewer = null;
  var $ = function (id) { return document.getElementById(id); };

  function on(el, ev, fn, opts) {
    if (el) el.addEventListener(ev, fn, opts);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showScreen(id) {
    ['screen-auth', 'screen-floor', 'screen-home', 'screen-viewer'].forEach(function (sid) {
      var el = $(sid);
      if (el) el.classList.toggle('is-active', sid === id);
    });
  }

  function readSession() {
    try {
      var raw = localStorage.getItem(DEVICE_KEY) || sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function sessionDevice() {
    var s = readSession();
    return s && s.deviceToken ? String(s.deviceToken) : '';
  }

  function sessionPin() {
    var s = readSession();
    return s && s.pin ? String(s.pin) : '';
  }

  function writeAdminSession(pin) {
    try {
      localStorage.setItem(DEVICE_KEY, JSON.stringify({
        ok: true,
        role: 'admin',
        pin: pin,
        deviceToken: sessionDevice() || ''
      }));
    } catch (e) {}
  }

  function authHeaders() {
    var headers = {};
    if (state.adminPin) headers['X-MyDrawings-Pin'] = state.adminPin;
    else if (sessionPin() && (!sessionDevice() || state.role === 'admin')) {
      headers['X-MyDrawings-Pin'] = sessionPin();
    }
    var device = sessionDevice();
    if (device) headers['X-MyDrawings-Device'] = device;
    return headers;
  }

  function readFloor() {
    try {
      var id = localStorage.getItem(FLOOR_KEY);
      if (!id) return null;
      for (var i = 0; i < FLOORS.length; i++) {
        if (FLOORS[i].id === id) return FLOORS[i];
      }
    } catch (e) {}
    return null;
  }

  function writeFloor(floor) {
    state.floor = floor;
    try {
      if (floor) localStorage.setItem(FLOOR_KEY, floor.id);
      else localStorage.removeItem(FLOOR_KEY);
    } catch (e) {}
  }

  function floorLabel(floor) {
    return floor ? floor.label : 'Level';
  }

  function pinValue() {
    return ($('pin-input').value || '').replace(/\D/g, '').slice(0, 4);
  }

  function renderPinDots() {
    var n = pinValue().length;
    var dots = $('pin-dots');
    if (!dots) return;
    Array.prototype.forEach.call(dots.querySelectorAll('.md-dot'), function (dot, i) {
      dot.classList.toggle('is-on', i < n);
    });
    $('pin-continue').disabled = n !== 4;
  }

  async function apiJson(path, opts) {
    opts = opts || {};
    var headers = Object.assign({}, authHeaders(), opts.headers || {});
    var body = opts.body;
    if (body && typeof body !== 'string') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    var res = await fetch('/api/progress-drawings' + path, {
      method: opts.method || 'GET',
      credentials: 'same-origin',
      headers: headers,
      body: body
    });
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok || (data && data.success === false)) {
      var err = new Error((data && data.message) || 'Request failed.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function loadBootstrap() {
    var floorId = state.floor ? state.floor.id : '';
    var q = floorId ? ('?floor=' + encodeURIComponent(floorId)) : '';
    var data = await apiJson('/bootstrap' + q);
    state.project = data.project || null;
    state.drawings = data.drawings || [];
    state.bookings = data.bookings || [];
    state.workTypes = data.workTypes || [];
    state.role = data.role || state.role;
    if (data.floors && data.floors.length) state.floors = data.floors;
    return data;
  }

  function renderFloorGrid() {
    var host = $('floor-grid');
    if (!host) return;
    host.innerHTML = state.floors.map(function (f) {
      return '<button type="button" class="md-floor-btn" data-floor="' + escapeHtml(f.id) + '" role="listitem">' +
        escapeHtml(f.label) + '</button>';
    }).join('');
  }

  function renderHome() {
    if ($('project-name')) $('project-name').textContent = (state.project && state.project.name) || 'Project';
    if ($('btn-floor')) $('btn-floor').textContent = floorLabel(state.floor);
    if ($('drawings-note')) {
      $('drawings-note').textContent = state.drawings.length
        ? 'Setting Out / GA drawings for ' + floorLabel(state.floor) + '.'
        : 'No general drawings found for this level. Add Setting Out / GA drawings in My Drawings.';
    }

    var list = $('drawing-list');
    if (!state.drawings.length) {
      list.innerHTML = '<div class="pd-empty">No general drawings on this level yet.</div>';
    } else {
      list.innerHTML = state.drawings.map(function (d) {
        return '<button type="button" class="pd-card" data-drawing-id="' + escapeHtml(d.id) + '">' +
          '<p class="pd-card-title">' + escapeHtml(d.title) + '</p>' +
          '<p class="pd-card-num">' + escapeHtml(d.number) + ' · Rev ' + escapeHtml(d.revision || '—') + '</p>' +
          '<p class="pd-card-meta">' + escapeHtml(d.category) + '</p>' +
          '</button>';
      }).join('');
    }

    var books = $('booking-list');
    if (!state.bookings.length) {
      books.innerHTML = '<div class="pd-empty">No previous bookings yet. Generate one after marking progress.</div>';
    } else {
      books.innerHTML = state.bookings.map(function (b) {
        var week = b.weekNumber != null ? ('Week ' + b.weekNumber) : 'Booking';
        return '<article class="pd-card">' +
          '<p class="pd-card-title">' + escapeHtml(week) + '</p>' +
          '<p class="pd-card-num">' + escapeHtml(b.drawingNumber || '—') +
            (b.drawingRevision ? ' · Rev ' + escapeHtml(b.drawingRevision) : '') + '</p>' +
          '<p class="pd-card-meta">' + escapeHtml(b.status || 'draft') +
            (b.preparedBy ? ' · ' + escapeHtml(b.preparedBy) : '') + '</p>' +
          '</article>';
      }).join('');
    }
  }

  function getViewer() {
    if (!drawingViewer) {
      drawingViewer = new window.DrawingViewer($('screen-viewer'), {});
    }
    return drawingViewer;
  }

  async function fetchDrawingBlob(drawing) {
    var res = await fetch(drawing.fileUrl, {
      credentials: 'same-origin',
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Could not load drawing PDF.');
    return res.blob();
  }

  async function ensurePdfJs() {
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      return window.pdfjsLib;
    }
    throw new Error('Could not load PDF engine.');
  }

  async function openViewer(id) {
    var d = null;
    for (var i = 0; i < state.drawings.length; i++) {
      if (state.drawings[i].id === id) { d = state.drawings[i]; break; }
    }
    if (!d) return;
    state.viewing = d;
    $('viewer-number').textContent = d.number;
    $('viewer-sub').textContent = (d.title || '') + (d.revision ? ' · Rev ' + d.revision : '');
    showScreen('screen-viewer');
    var toolbar = $('pd-toolbar');
    if (toolbar) toolbar.hidden = false;
    try {
      await ensurePdfJs();
      getViewer().setStatus('Opening drawing…');
      var blob = await fetchDrawingBlob(d);
      if (state.viewing && state.viewing.id === id) await getViewer().open(blob, d);
    } catch (err) {
      getViewer().setStatus(err.message || 'Could not open drawing.');
    }
  }

  function closeViewer() {
    state.viewing = null;
    if (drawingViewer) drawingViewer.close();
    document.getElementById('pd-app').classList.remove('is-fs');
    showScreen('screen-home');
  }

  async function enterApp() {
    try {
      await loadBootstrap();
      if (!state.floor) {
        if ($('floor-project')) {
          $('floor-project').textContent = (state.project && state.project.name) || 'Project';
        }
        renderFloorGrid();
        showScreen('screen-floor');
        return;
      }
      renderHome();
      showScreen('screen-home');
    } catch (err) {
      if (err && err.status === 401) {
        state.adminPin = '';
        showScreen('screen-auth');
        $('auth-error').textContent = 'Sign in required. Enter the admin key or open My Drawings first.';
        return;
      }
      throw err;
    }
  }

  async function selectFloor(floorId) {
    var floor = null;
    for (var i = 0; i < state.floors.length; i++) {
      if (state.floors[i].id === floorId) { floor = state.floors[i]; break; }
    }
    if (!floor) return;
    writeFloor(floor);
    await loadBootstrap();
    renderHome();
    showScreen('screen-home');
  }

  async function submitPin() {
    var pin = pinValue();
    if (pin.length !== 4) return;
    $('auth-error').textContent = '';
    $('pin-continue').disabled = true;
    try {
      var res = await fetch('/api/my-drawings/unlock', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin })
      });
      var data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      if (!res.ok || !data || data.success === false) {
        throw new Error((data && data.message) || 'Incorrect access key');
      }
      state.adminPin = pin;
      state.role = 'admin';
      writeAdminSession(pin);
      await enterApp();
    } catch (err) {
      $('auth-error').textContent = err.message || 'Incorrect access key';
      $('pin-input').value = '';
      renderPinDots();
    } finally {
      $('pin-continue').disabled = pinValue().length !== 4;
    }
  }

  async function boot() {
    try {
      var session = readSession();
      if (session && session.ok && (session.deviceToken || (session.pin && session.role === 'admin'))) {
        if (session.role === 'admin' && session.pin) state.adminPin = session.pin;
        state.role = session.role || 'worker';
        state.floor = readFloor();
        await enterApp();
      } else {
        showScreen('screen-auth');
      }
    } catch (err) {
      showScreen('screen-auth');
      if ($('auth-error')) $('auth-error').textContent = err.message || 'Could not start.';
    } finally {
      $('pd-boot').classList.add('is-done');
    }
  }

  on($('pin-input'), 'input', function () {
    $('pin-input').value = pinValue();
    $('auth-error').textContent = '';
    renderPinDots();
    if (pinValue().length === 4) submitPin();
  });
  on($('pin-input'), 'keydown', function (e) {
    if (e.key === 'Enter') submitPin();
  });
  on($('pin-tap'), 'click', function () { $('pin-input').focus(); });
  on($('pin-dots'), 'click', function () { $('pin-input').focus(); });
  on($('pin-continue'), 'click', submitPin);

  on($('floor-grid'), 'click', function (e) {
    var btn = e.target.closest('[data-floor]');
    if (btn) selectFloor(btn.getAttribute('data-floor'));
  });

  on($('btn-floor'), 'click', function () {
    if ($('floor-project')) {
      $('floor-project').textContent = (state.project && state.project.name) || 'Project';
    }
    renderFloorGrid();
    showScreen('screen-floor');
  });

  on($('btn-refresh'), 'click', async function () {
    try {
      await loadBootstrap();
      renderHome();
    } catch (err) {
      alert(err.message || 'Could not refresh.');
    }
  });

  on($('drawing-list'), 'click', function (e) {
    var card = e.target.closest('[data-drawing-id]');
    if (card) openViewer(card.getAttribute('data-drawing-id'));
  });

  on($('btn-viewer-back'), 'click', closeViewer);

  boot();
})();
