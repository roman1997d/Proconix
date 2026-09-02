/* Progress Drawings — offline-first PWA: viewer, marks, IndexedDB sync */
(function () {
  'use strict';

  var DEVICE_KEY = 'proconix_mydrawings_device';
  var SESSION_KEY = 'proconix_mydrawings_session';
  var FLOOR_KEY = 'proconix_progress_drawings_floor';
  var PDFJS_WORKER = '/progress-drawings/vendor/pdf.worker.min.js';
  var Offline = window.PdOffline || null;

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
    viewing: null,
    booking: null,
    mode: 'select',
    activeWorkTypeId: null,
    layerCount: 1,
    selectedLocationId: null,
    draftLine: null,
    pendingAnnotations: [],
    visibleTypes: {},
    undoStack: [],
    redoStack: []
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

  function isOnline() {
    return Offline ? Offline.isOnline() : (navigator.onLine !== false);
  }

  function offlineCtx() {
    var drawing = state.viewing || null;
    return {
      booking: state.booking,
      workTypes: state.workTypes,
      drawing: drawing,
      project: state.project,
      floor: state.floor
    };
  }

  async function networkApiJson(path, opts) {
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

  function friendlyNetworkError(err) {
    var msg = err && err.message ? String(err.message) : '';
    if (/load failed|failed to fetch|networkerror|offline/i.test(msg) || (err && err.name === 'TypeError')) {
      return new Error('Connection problem. Marks are saved on this device and will sync when online.');
    }
    return err;
  }

  async function apiJson(path, opts) {
    opts = opts || {};
    var method = String(opts.method || 'GET').toUpperCase();
    var body = opts.body;
    var networkErr = null;

    if (isOnline()) {
      try {
        var data = await networkApiJson(path, opts);
        if (Offline) {
          try { await Offline.cacheAfterSuccess(path, method, data); } catch (e) {}
        }
        updateOfflineUi();
        return data;
      } catch (err) {
        networkErr = err;
        if (err && err.status) throw err;
        if (!Offline || !Offline.isNetworkError(err)) throw friendlyNetworkError(err);
        /* fall through to offline handler */
      }
    }

    if (!Offline) throw friendlyNetworkError(networkErr || new Error('You are offline.'));
    try {
      var offlineData = await Offline.handleOffline(path, method, body, offlineCtx());
      updateOfflineUi();
      if (networkErr) toast('Saved on this device — will sync when online.');
      return offlineData;
    } catch (offlineErr) {
      throw friendlyNetworkError(networkErr || offlineErr);
    }
  }

  function applyBootstrapData(data) {
    state.project = data.project || null;
    state.drawings = data.drawings || [];
    state.bookings = data.bookings || [];
    state.workTypes = data.workTypes || [];
    state.role = data.role || state.role;
    if (data.floors && data.floors.length) state.floors = data.floors;
    if (!state.activeWorkTypeId && state.workTypes.length) {
      state.activeWorkTypeId = state.workTypes[0].id;
    }
    state.workTypes.forEach(function (w) {
      if (state.visibleTypes[w.id] == null) state.visibleTypes[w.id] = true;
    });
  }

  async function loadBootstrap() {
    var floorId = state.floor ? state.floor.id : '';
    var q = floorId ? ('?floor=' + encodeURIComponent(floorId)) : '';
    var data = await apiJson('/bootstrap' + q);
    applyBootstrapData(data);
    return data;
  }

  async function updateOfflineUi() {
    var offline = !isOnline();
    ['offline-pill', 'viewer-offline'].forEach(function (id) {
      var el = $(id);
      if (el) el.classList.toggle('is-on', offline);
    });
    var syncEl = $('sync-pill');
    if (syncEl && Offline) {
      try {
        var n = await Offline.outboxCount();
        syncEl.hidden = false;
        syncEl.classList.toggle('is-on', n > 0);
        syncEl.textContent = n > 0
          ? (offline ? ('Saved locally · ' + n) : ('Pending sync · ' + n))
          : 'Pending sync';
        if (n === 0) syncEl.classList.remove('is-on');
      } catch (e) {}
    }
  }

  async function syncPending(opts) {
    opts = opts || {};
    if (!Offline || !isOnline() || Offline.isSyncing()) return;
    var before = await Offline.outboxCount();
    if (!before) {
      updateOfflineUi();
      return;
    }
    try {
      var result = await Offline.flushOutbox(networkApiJson);
      if (state.booking && result && result.idMap) {
        var remapped = Offline.remapIdsInBooking(state.booking, result.idMap);
        if (result.idMap[state.booking.id]) {
          state.booking = remapped;
        }
        if (state.selectedLocationId && result.idMap[state.selectedLocationId]) {
          state.selectedLocationId = result.idMap[state.selectedLocationId];
        }
      }
      if (state.viewing && state.floor && isOnline()) {
        try {
          var draft = await networkApiJson('/bookings', {
            method: 'POST',
            body: { floorId: state.floor.id, drawingId: state.viewing.id }
          });
          if (draft && draft.booking) {
            applyBooking(draft.booking);
            try { await Offline.cacheAfterSuccess('/bookings', 'POST', draft); } catch (e) {}
          }
        } catch (e) {}
      }
      try { await loadBootstrap(); renderHome(); } catch (e) {}
      var after = await Offline.outboxCount();
      if (opts.toast !== false && before && after === 0) {
        toast('Synced with server.');
      }
    } catch (err) {
      if (opts.toast !== false) {
        toast(err.message || 'Sync will retry when online.');
      }
    } finally {
      updateOfflineUi();
      updateChrome();
    }
  }

  function workTypeById(id) {
    for (var i = 0; i < state.workTypes.length; i++) {
      if (state.workTypes[i].id === String(id)) return state.workTypes[i];
    }
    return null;
  }

  function activeWorkType() {
    return workTypeById(state.activeWorkTypeId);
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
        var week = b.weekNumber != null ? ('Week ' + b.weekNumber) : (b.status === 'draft' ? 'Draft' : 'Booking');
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

  function workTypeCode(wt) {
    var name = String((wt && wt.name) || '').toLowerCase();
    if (/board/.test(name) && /2nd|second|\bb2\b/.test(name) && !/letter/.test(name)) return 'B2';
    if (/board/.test(name) && !/letter/.test(name)) return 'B';
    if (name.indexOf('insul') === 0) return 'I';
    if (name.indexOf('metal') === 0) return 'M';
    if (name.indexOf('angle') === 0) return 'A';
    if (name.indexOf('patress') === 0 || name.indexOf('pattress') === 0) return 'PT';
    if (name.indexOf('letter') === 0) return 'LB';
    if (name.indexOf('flat') === 0) return 'FP';
    if (/topdown_?1|top\s*down\s*1/.test(name)) return 'T1';
    if (/topdown_?2|top\s*down\s*2/.test(name)) return 'T2';
    return String((wt && wt.name) || '?').slice(0, 2).toUpperCase();
  }

  function workTypeShortLabel(wt) {
    var name = String((wt && wt.name) || '');
    if (/board/i.test(name) && /2nd|second|\bb2\b/i.test(name)) return 'B2';
    if (/board/i.test(name)) return 'Plaster';
    if (/insul/i.test(name) && !/angle/i.test(name)) return 'Insul';
    if (/metal/i.test(name)) return 'Metal';
    if (/angle/i.test(name)) return 'Angle';
    if (/patress|pattress/i.test(name)) return 'Patress';
    if (/letter/i.test(name)) return 'Letter';
    if (/flat/i.test(name)) return 'Flat';
    if (/topdown_?1|top\s*down\s*1/i.test(name)) return 'TD1';
    if (/topdown_?2|top\s*down\s*2/i.test(name)) return 'TD2';
    return name;
  }

  function markColour(wt, fallback) {
    return (wt && wt.colour) || fallback || '#2563eb';
  }

  function addButtonLabel(wt) {
    if (!wt) return 'Add work type';
    var short = wt.name || workTypeShortLabel(wt);
    if (state.selectedLocationId) return 'Update ' + short;
    return 'Add ' + short;
  }

  function strokeLineHtml(cls, x0, y0, x1, y1, colour, width) {
    return '<line class="' + cls + '" x1="' + x0 + '" y1="' + y0 + '" x2="' + x1 + '" y2="' + y1 +
      '" stroke="' + escapeHtml(colour) + '" stroke-width="' + width +
      '" stroke-linecap="butt" stroke-linejoin="miter"/>';
  }

  function strokeRectHtml(cls, x, y, w, h, colour, width) {
    return '<rect class="' + cls + '" x="' + x + '" y="' + y + '" width="' + w +
      '" height="' + h + '" fill="transparent" stroke="' + escapeHtml(colour) +
      '" stroke-width="' + width + '" stroke-linejoin="miter" stroke-linecap="butt"/>';
  }

  function lineFromLocCss(loc, css) {
    if ((loc.markKind || 'rect') === 'line') {
      return {
        x0: css.x,
        y0: css.y,
        x1: css.x + css.width,
        y1: css.y + css.height
      };
    }
    return null;
  }

  function locById(id) {
    var found = null;
    ((state.booking && state.booking.locations) || []).forEach(function (l) {
      if (l.id === String(id)) found = l;
    });
    return found;
  }

  function lineCssForLoc(loc, viewer) {
    if (!loc || !viewer) return null;
    var css = viewer.pdfToPageCss(loc);
    if (!css) return null;
    return lineFromLocCss(loc, css) || {
      x0: css.x,
      y0: css.y,
      x1: css.x + css.width,
      y1: css.y + css.height
    };
  }

  function renderAnnotations() {
    var svg = $('pd-anno');
    var viewer = drawingViewer;
    if (!svg || !viewer) return;
    var m = viewer.getPageMetrics();
    if (!m) return;
    svg.setAttribute('viewBox', '0 0 ' + m.pageCssW + ' ' + m.pageCssH);
    svg.setAttribute('width', m.pageCssW);
    svg.setAttribute('height', m.pageCssH);
    svg.style.width = m.pageCssW + 'px';
    svg.style.height = m.pageCssH + 'px';
    svg.style.transform = 'translate3d(' + m.tx + 'px,' + m.ty + 'px,0) scale(' + m.scale + ')';

    /* Straight coloured strokes; click selects for Update / Delete only. */
    var html = '';
    var locs = (state.booking && state.booking.locations) || [];
    var scale = Math.max(0.2, m.scale || 1);
    locs.forEach(function (loc) {
      if ((loc.pageIndex || 0) !== Math.max(0, (m.pageNum || 1) - 1)) return;
      var line = lineCssForLoc(loc, viewer);
      if (!line) return;
      var selected = state.selectedLocationId === loc.id;
      var anns = loc.annotations || [];
      var primary = anns[0]
        ? (workTypeById(anns[0].workTypeId) || { colour: anns[0].colour })
        : null;
      var colour = markColour(primary, '#2563eb');
      var sw = selected ? 1.7 : 1.15;
      var isLine = (loc.markKind || 'rect') === 'line';
      html += '<g class="pd-loc' + (selected ? ' is-selected' : '') +
        '" data-loc-id="' + escapeHtml(loc.id) + '">';
      if (isLine) {
        html += strokeLineHtml('pd-mark-hit', line.x0, line.y0, line.x1, line.y1, 'transparent', Math.max(12, 14 / scale));
        html += strokeLineHtml('pd-mark', line.x0, line.y0, line.x1, line.y1, colour, sw);
      } else {
        var css = viewer.pdfToPageCss(loc);
        if (css) {
          html += strokeRectHtml('pd-mark', css.x, css.y, css.width, css.height, colour, sw);
        }
      }
      html += '</g>';
    });

    if (state.draftLine) {
      var d = state.draftLine;
      var draftColour = markColour(activeWorkType(), '#2563eb');
      html += strokeLineHtml('pd-draft-mark', d.x0, d.y0, d.x1, d.y1, draftColour, 1.25);
    }

    svg.innerHTML = html;
  }

  function updateChrome() {
    if ($('btn-undo')) $('btn-undo').disabled = !state.undoStack.length;
    if ($('btn-redo')) $('btn-redo').disabled = !state.redoStack.length;
    if ($('btn-pan')) $('btn-pan').classList.toggle('is-on', state.mode === 'pan');

    var wtHost = $('pd-worktypes');
    if (wtHost) {
      wtHost.innerHTML = state.workTypes.map(function (w) {
        var drawing = state.mode === 'select' && w.id === state.activeWorkTypeId;
        return '<button type="button" class="pd-wt' + (drawing ? ' is-on' : '') +
          '" data-wt="' + escapeHtml(w.id) + '" style="--pd-wt:' + escapeHtml(w.colour) +
          '" aria-label="' + escapeHtml(w.name) + '">' +
          '<span class="pd-wt-badge">' + escapeHtml(workTypeCode(w)) + '</span>' +
          '<span class="pd-wt-label">' + escapeHtml(workTypeShortLabel(w)) + '</span>' +
          '</button>';
      }).join('');
    }

    var wt = activeWorkType();
    var canSave = !!(state.draftLine || state.selectedLocationId);
    if ($('btn-save-location')) {
      $('btn-save-location').disabled = !canSave || !state.activeWorkTypeId;
      $('btn-save-location').textContent = addButtonLabel(wt);
      $('btn-save-location').style.background = (wt && wt.colour) ? wt.colour : '#111827';
    }
    if ($('btn-delete-location')) {
      $('btn-delete-location').hidden = !state.selectedLocationId;
    }
    if ($('btn-share')) $('btn-share').disabled = !state.booking;
    if ($('btn-clean')) {
      var markCount = (state.booking && state.booking.locations && state.booking.locations.length) || 0;
      $('btn-clean').disabled = !state.booking || markCount === 0;
    }
  }

  function setMode(mode) {
    state.mode = mode === 'select' ? 'select' : 'pan';
    if (drawingViewer) drawingViewer.setInteractionMode(state.mode);
    updateChrome();
  }

  /** Work-type chips are the draw tools — selecting one starts finger-marking. */
  function selectWorkType(id) {
    state.activeWorkTypeId = id;
    var wt = activeWorkType();
    if (wt && !wt.supportsLayers) state.layerCount = 1;
    state.selectedLocationId = null;
    setMode('select');
    renderAnnotations();
    updateChrome();
  }

  function pushUndo(entry) {
    state.undoStack.push(entry);
    if (state.undoStack.length > 40) state.undoStack.shift();
    state.redoStack = [];
    updateChrome();
  }

  function applyBooking(booking) {
    state.booking = booking;
    if (Offline && booking) {
      Offline.putBooking(booking).catch(function () {});
    }
    renderAnnotations();
    updateChrome();
    updateOfflineUi();
  }

  function getViewer() {
    if (!drawingViewer) {
      drawingViewer = new window.DrawingViewer($('screen-viewer'), {
        onTransform: function () { renderAnnotations(); },
        onSelectStart: function (drag) {
          state.draftLine = { x0: drag.x0, y0: drag.y0, x1: drag.x1, y1: drag.y1 };
          state.selectedLocationId = null;
          renderAnnotations();
          updateChrome();
        },
        onSelectMove: function (drag) {
          state.draftLine = { x0: drag.x0, y0: drag.y0, x1: drag.x1, y1: drag.y1 };
          renderAnnotations();
        },
        onSelectEnd: function (rect) {
          state.draftLine = {
            x0: rect.x0 != null ? rect.x0 : rect.x,
            y0: rect.y0 != null ? rect.y0 : rect.y,
            x1: rect.x1 != null ? rect.x1 : (rect.x + rect.width),
            y1: rect.y1 != null ? rect.y1 : (rect.y + rect.height)
          };
          state.selectedLocationId = null;
          renderAnnotations();
          updateChrome();
        },
        onSelectCancel: function () {
          state.draftLine = null;
          renderAnnotations();
          updateChrome();
        }
      });
    }
    return drawingViewer;
  }

  async function fetchDrawingBlob(drawing) {
    if (Offline) {
      try {
        var cached = await Offline.getPdf(drawing.id);
        if (cached) {
          if (isOnline()) {
            /* Refresh cache in background when online. */
            fetch(drawing.fileUrl, { credentials: 'same-origin', headers: authHeaders() })
              .then(function (res) { return res.ok ? res.blob() : null; })
              .then(function (blob) { if (blob) return Offline.putPdf(drawing.id, blob); })
              .catch(function () {});
          }
          return cached;
        }
      } catch (e) {}
    }
    if (!isOnline()) {
      throw new Error('This drawing is not available offline yet. Open it once while online.');
    }
    var res = await fetch(drawing.fileUrl, {
      credentials: 'same-origin',
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Could not load drawing PDF.');
    var blob = await res.blob();
    if (Offline) {
      try { await Offline.putPdf(drawing.id, blob); } catch (e) {}
    }
    return blob;
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
    if (!d || !state.floor) return;
    state.viewing = d;
    state.draftLine = null;
    state.selectedLocationId = null;
    state.undoStack = [];
    state.redoStack = [];
    $('viewer-number').textContent = d.number;
    $('viewer-sub').textContent = (d.title || '') + (d.revision ? ' · Rev ' + d.revision : '');
    showScreen('screen-viewer');
    if ($('pd-chrome')) $('pd-chrome').hidden = false;
    updateChrome();
    setMode(state.activeWorkTypeId ? 'select' : 'pan');
    try {
      var draft = await apiJson('/bookings', {
        method: 'POST',
        body: { floorId: state.floor.id, drawingId: d.id }
      });
      applyBooking(draft.booking);
      await ensurePdfJs();
      getViewer().setStatus('Opening drawing…');
      var blob = await fetchDrawingBlob(d);
      if (state.viewing && state.viewing.id === id) {
        await getViewer().open(blob, d);
        getViewer().setInteractionMode(state.mode);
        renderAnnotations();
      }
    } catch (err) {
      getViewer().setStatus(err.message || 'Could not open drawing.');
      alert(err.message || 'Could not open drawing.');
    }
  }

  function closeViewer() {
    state.viewing = null;
    state.booking = null;
    state.draftLine = null;
    state.selectedLocationId = null;
    if (drawingViewer) {
      drawingViewer.setInteractionMode('pan');
      drawingViewer.close();
    }
    document.getElementById('pd-app').classList.remove('is-fs');
    if ($('pd-chrome')) $('pd-chrome').hidden = true;
    showScreen('screen-home');
    loadBootstrap().then(renderHome).catch(function () { renderHome(); });
  }

  function currentAnnotationPayload() {
    var wt = activeWorkType();
    if (!wt) return [];
    return [{
      workTypeId: wt.id,
      layerCount: wt.supportsLayers ? state.layerCount : 1
    }];
  }

  async function saveLocation() {
    if (!state.booking) return;
    var viewer = getViewer();
    try {
      if (state.draftLine) {
        var p0 = viewer.pageCssToPdf(state.draftLine.x0, state.draftLine.y0);
        var p1 = viewer.pageCssToPdf(state.draftLine.x1, state.draftLine.y1);
        if (!p0 || !p1) throw new Error('Drawing metrics missing.');
        var anns = currentAnnotationPayload();
        if (!anns.length) throw new Error('Choose a work type.');
        var data = await apiJson('/bookings/' + encodeURIComponent(state.booking.id) + '/locations', {
          method: 'POST',
          body: {
            pageIndex: p0.pageIndex,
            x: p0.x,
            y: p0.y,
            width: p1.x - p0.x,
            height: p1.y - p0.y,
            markKind: 'line',
            annotations: anns
          }
        });
        var savedLoc = null;
        (data.booking.locations || []).forEach(function (l) {
          if (l.id === data.locationId) savedLoc = JSON.parse(JSON.stringify(l));
        });
        pushUndo({ type: 'add', locationId: data.locationId, location: savedLoc });
        state.draftLine = null;
        state.selectedLocationId = data.locationId ? String(data.locationId) : null;
        applyBooking(data.booking);
        setMode('select');
        return;
      }

      if (state.selectedLocationId) {
        var before = null;
        (state.booking.locations || []).forEach(function (l) {
          if (l.id === state.selectedLocationId) before = JSON.parse(JSON.stringify(l));
        });
        var merged = currentAnnotationPayload();
        if (before && before.annotations && before.annotations.length) {
          var map = {};
          before.annotations.forEach(function (a) { map[a.workTypeId] = a; });
          merged.forEach(function (a) { map[a.workTypeId] = a; });
          merged = Object.keys(map).map(function (k) { return map[k]; });
        }
        var updated = await apiJson('/locations/' + encodeURIComponent(state.selectedLocationId), {
          method: 'PUT',
          body: { annotations: merged }
        });
        pushUndo({ type: 'update', before: before });
        applyBooking(updated.booking);
      }
    } catch (err) {
      alert(err.message || 'Could not save location.');
    }
  }

  async function cleanDrawing() {
    if (!state.booking) return;
    var count = (state.booking.locations && state.booking.locations.length) || 0;
    if (!count) {
      toast('No marks to clean.');
      return;
    }
    if (!confirm('Remove all marks from this drawing?')) return;
    try {
      var data = await apiJson('/bookings/' + encodeURIComponent(state.booking.id) + '/locations', {
        method: 'DELETE'
      });
      state.undoStack = [];
      state.redoStack = [];
      state.selectedLocationId = null;
      state.draftLine = null;
      applyBooking(data.booking);
      toast('Drawing cleaned.');
    } catch (err) {
      alert(err.message || 'Could not clean drawing.');
    }
  }

  async function deleteSelectedLocation() {
    if (!state.selectedLocationId || !state.booking) return;
    if (!confirm('Delete this progress location?')) return;
    var before = null;
    (state.booking.locations || []).forEach(function (l) {
      if (l.id === state.selectedLocationId) before = JSON.parse(JSON.stringify(l));
    });
    try {
      var data = await apiJson('/locations/' + encodeURIComponent(state.selectedLocationId), {
        method: 'DELETE'
      });
      pushUndo({ type: 'delete', location: before });
      state.selectedLocationId = null;
      applyBooking(data.booking);
    } catch (err) {
      alert(err.message || 'Could not delete location.');
    }
  }

  async function undo() {
    var op = state.undoStack.pop();
    if (!op || !state.booking) return;
    try {
      if (op.type === 'add' && op.locationId) {
        var del = await apiJson('/locations/' + encodeURIComponent(op.locationId), { method: 'DELETE' });
        state.redoStack.push(op);
        state.selectedLocationId = null;
        applyBooking(del.booking);
      } else if (op.type === 'delete' && op.location) {
        var loc = op.location;
        var restored = await apiJson('/bookings/' + encodeURIComponent(state.booking.id) + '/locations', {
          method: 'POST',
          body: {
            pageIndex: loc.pageIndex || 0,
            x: loc.x,
            y: loc.y,
            width: loc.width,
            height: loc.height,
            markKind: loc.markKind || 'line',
            annotations: (loc.annotations || []).map(function (a) {
              return { workTypeId: a.workTypeId, layerCount: a.layerCount || 1 };
            })
          }
        });
        op.locationId = restored.locationId;
        state.redoStack.push(op);
        state.selectedLocationId = restored.locationId;
        applyBooking(restored.booking);
      } else if (op.type === 'update' && op.before) {
        var u = await apiJson('/locations/' + encodeURIComponent(op.before.id), {
          method: 'PUT',
          body: {
            x: op.before.x,
            y: op.before.y,
            width: op.before.width,
            height: op.before.height,
            pageIndex: op.before.pageIndex || 0,
            annotations: (op.before.annotations || []).map(function (a) {
              return { workTypeId: a.workTypeId, layerCount: a.layerCount || 1 };
            })
          }
        });
        state.redoStack.push(op);
        applyBooking(u.booking);
      }
    } catch (err) {
      alert(err.message || 'Undo failed.');
    }
    updateChrome();
  }

  async function redo() {
    var op = state.redoStack.pop();
    if (!op || !state.booking) return;
    try {
      if (op.type === 'add' && op.location) {
        var loc = op.location;
        var restored = await apiJson('/bookings/' + encodeURIComponent(state.booking.id) + '/locations', {
          method: 'POST',
          body: {
            pageIndex: loc.pageIndex || 0,
            x: loc.x,
            y: loc.y,
            width: loc.width,
            height: loc.height,
            markKind: loc.markKind || 'line',
            annotations: (loc.annotations || []).map(function (a) {
              return { workTypeId: a.workTypeId, layerCount: a.layerCount || 1 };
            })
          }
        });
        op.locationId = restored.locationId;
        op.location = null;
        (restored.booking.locations || []).forEach(function (l) {
          if (l.id === restored.locationId) op.location = JSON.parse(JSON.stringify(l));
        });
        state.undoStack.push(op);
        state.selectedLocationId = restored.locationId;
        applyBooking(restored.booking);
      } else if (op.type === 'delete' && op.locationId) {
        var del = await apiJson('/locations/' + encodeURIComponent(op.locationId), { method: 'DELETE' });
        state.undoStack.push(op);
        state.selectedLocationId = null;
        applyBooking(del.booking);
      }
    } catch (err) {
      alert(err.message || 'Redo failed.');
    }
    updateChrome();
  }

  function toast(msg) {
    var el = $('pd-toast');
    if (!el) {
      alert(msg);
      return;
    }
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; }, 2800);
  }

  function closeSheet() {
    if ($('pd-backdrop')) $('pd-backdrop').classList.remove('is-on');
    if ($('pd-sheet')) $('pd-sheet').classList.remove('is-on');
  }

  function openSheet(html) {
    var sheet = $('pd-sheet');
    if (!sheet || !$('pd-backdrop')) return;
    sheet.innerHTML = '<div class="md-sheet-handle"></div>' + html;
    $('pd-backdrop').classList.add('is-on');
    sheet.classList.add('is-on');
  }

  function closeEmailModal() {
    if ($('pd-email')) $('pd-email').hidden = true;
    if ($('pd-email-err')) $('pd-email-err').textContent = '';
  }

  function openEmailModal() {
    closeSheet();
    if (!state.booking) return;
    if ($('pd-email-to')) $('pd-email-to').value = '';
    if ($('pd-email-err')) $('pd-email-err').textContent = '';
    if ($('pd-email')) $('pd-email').hidden = false;
    setTimeout(function () {
      if ($('pd-email-to')) $('pd-email-to').focus();
    }, 40);
  }

  async function openShareSheet() {
    if (!state.booking) {
      toast('Open a drawing first.');
      return;
    }
    if (!isOnline()) {
      toast('Connect to the internet to share or export.');
      return;
    }
    if (Offline) {
      var pending = await Offline.outboxCount();
      if (pending > 0) {
        toast('Syncing marks first…');
        await syncPending({ toast: false });
      }
    }
    openSheet(
      '<h3 id="pd-sheet-title">Share</h3>' +
      '<button type="button" class="md-sheet-item" data-share="email">' +
        '<svg class="md-icon" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>' +
        'Send via email</button>' +
      '<button type="button" class="md-sheet-item" data-share="files">' +
        '<svg class="md-icon" viewBox="0 0 24 24"><path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M5 21h14"/></svg>' +
        'Save in Files</button>'
    );
  }

  function filenameFromDisposition(header, fallback) {
    if (!header) return fallback;
    var star = /filename\*=UTF-8''([^;]+)/i.exec(header);
    if (star) {
      try { return decodeURIComponent(star[1]); } catch (e) {}
    }
    var m = /filename="([^"]+)"/i.exec(header) || /filename=([^;]+)/i.exec(header);
    return m ? m[1].trim() : fallback;
  }

  async function fetchBookingPdf() {
    if (!state.booking) throw new Error('No booking open.');
    var res = await fetch('/api/progress-drawings/bookings/' + encodeURIComponent(state.booking.id) + '/pdf', {
      method: 'GET',
      credentials: 'same-origin',
      headers: authHeaders()
    });
    if (!res.ok) {
      var data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      throw new Error((data && data.message) || 'Could not build PDF.');
    }
    var blob = await res.blob();
    var fallback = 'Progress_drawing.pdf';
    if (state.booking.drawingNumber) {
      fallback = 'Progress_' + String(state.booking.drawingNumber).replace(/[^\w.-]+/g, '_') + '.pdf';
    }
    return {
      blob: blob,
      filename: filenameFromDisposition(res.headers.get('Content-Disposition'), fallback)
    };
  }

  async function saveInFiles() {
    closeSheet();
    try {
      var file = await fetchBookingPdf();
      var nativeFile = new File([file.blob], file.filename, { type: 'application/pdf' });
      var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      if (ios && navigator.canShare && navigator.canShare({ files: [nativeFile] })) {
        try {
          await navigator.share({ files: [nativeFile], title: file.filename });
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') return;
        }
      }
      var url = URL.createObjectURL(file.blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2500);
      toast('Saved. Check Files or Downloads.');
    } catch (err) {
      alert(err.message || 'Could not save PDF.');
    }
  }

  async function sendEmail() {
    if (!state.booking) return;
    var to = ($('pd-email-to').value || '').trim();
    var errEl = $('pd-email-err');
    if (errEl) errEl.textContent = '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      if (errEl) errEl.textContent = 'Enter a valid email address.';
      return;
    }
    var sendBtn = $('pd-email-send');
    if (sendBtn) sendBtn.disabled = true;
    try {
      await apiJson('/bookings/' + encodeURIComponent(state.booking.id) + '/email', {
        method: 'POST',
        body: { to: to }
      });
      closeEmailModal();
      toast('Sent to ' + to);
    } catch (err) {
      if (errEl) errEl.textContent = err.message || 'Could not send email.';
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
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
        updateOfflineUi();
        return;
      }
      renderHome();
      showScreen('screen-home');
      updateOfflineUi();
      if (isOnline()) syncPending({ toast: false });
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
      if (!isOnline()) {
        throw new Error('Connect once to sign in. Then Progress Drawings works offline.');
      }
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

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    /* Drop the earlier site-wide SW (scope "/") that broke Safari API POSTs. */
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      return Promise.all((regs || []).map(function (reg) {
        var script = '';
        try {
          script = (reg.active && reg.active.scriptURL) ||
            (reg.waiting && reg.waiting.scriptURL) ||
            (reg.installing && reg.installing.scriptURL) || '';
        } catch (e) {}
        if (script.indexOf('/progress-drawings/sw.js') !== -1 &&
            /\/$/.test(reg.scope) && reg.scope.indexOf('/progress-drawings') === -1) {
          return reg.unregister();
        }
        return null;
      }));
    }).catch(function () {}).then(function () {
      return navigator.serviceWorker.register('/progress-drawings/sw.js', {
        scope: '/progress-drawings/'
      });
    }).catch(function () {});
  }

  async function boot() {
    try {
      registerServiceWorker();
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
      updateOfflineUi();
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
      if (isOnline()) await syncPending({ toast: false });
      await loadBootstrap();
      renderHome();
      updateOfflineUi();
    } catch (err) {
      alert(err.message || 'Could not refresh.');
    }
  });

  on(window, 'online', function () {
    updateOfflineUi();
    syncPending({ toast: true });
  });
  on(window, 'offline', function () {
    updateOfflineUi();
    toast('Offline — marks save on this device.');
  });

  on($('drawing-list'), 'click', function (e) {
    var card = e.target.closest('[data-drawing-id]');
    if (card) openViewer(card.getAttribute('data-drawing-id'));
  });

  on($('btn-viewer-back'), 'click', closeViewer);
  on($('btn-undo'), 'click', undo);
  on($('btn-redo'), 'click', redo);
  on($('btn-pan'), 'click', function () { setMode('pan'); });
  on($('btn-share'), 'click', openShareSheet);
  on($('btn-clean'), 'click', cleanDrawing);
  on($('btn-save-location'), 'click', saveLocation);
  on($('btn-delete-location'), 'click', deleteSelectedLocation);
  on($('pd-backdrop'), 'click', closeSheet);
  on($('pd-sheet'), 'click', function (e) {
    var btn = e.target.closest('[data-share]');
    if (!btn) return;
    var kind = btn.getAttribute('data-share');
    if (kind === 'email') openEmailModal();
    else if (kind === 'files') saveInFiles();
  });
  on($('pd-email-cancel'), 'click', closeEmailModal);
  on($('pd-email-send'), 'click', sendEmail);
  on($('pd-email-to'), 'keydown', function (e) {
    if (e.key === 'Enter') sendEmail();
  });
  on($('pd-email'), 'click', function (e) {
    if (e.target === $('pd-email')) closeEmailModal();
  });

  on($('pd-worktypes'), 'click', function (e) {
    var btn = e.target.closest('[data-wt]');
    if (!btn) return;
    selectWorkType(btn.getAttribute('data-wt'));
  });

  function selectLocationById(locId) {
    state.selectedLocationId = String(locId);
    state.draftLine = null;
    var loc = locById(locId);
    if (loc && loc.annotations && loc.annotations[0]) {
      state.activeWorkTypeId = loc.annotations[0].workTypeId;
      state.layerCount = loc.annotations[0].layerCount || 1;
    }
    renderAnnotations();
    updateChrome();
  }

  function onAnnoPointerDown(e) {
    if (e.type === 'pointerdown' && e.pointerType === 'touch') return;
    if (e.type === 'pointerdown' && e.pointerType === 'mouse' && e.button !== 0) return;
    var target = e.target && e.target.closest ? e.target : (e.target && e.target.parentNode);
    if (!target || !target.closest) return;
    var g = target.closest('[data-loc-id]');
    if (!g) return;
    /* Keep taps on existing marks from starting a new stroke. */
    e.preventDefault();
    e.stopPropagation();
    selectLocationById(g.getAttribute('data-loc-id'));
  }

  on($('pd-anno'), 'pointerdown', onAnnoPointerDown);
  on($('pd-anno'), 'touchstart', onAnnoPointerDown, { passive: false });

  on($('pd-anno'), 'click', function (e) {
    var g = e.target.closest('[data-loc-id]');
    if (!g) return;
    e.stopPropagation();
    selectLocationById(g.getAttribute('data-loc-id'));
  });

  boot();
})();
