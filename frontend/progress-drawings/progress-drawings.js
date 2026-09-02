/* Progress Drawings — Phase 1+2: viewer, select area, work types, save locations */
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
    viewing: null,
    booking: null,
    mode: 'pan',
    activeWorkTypeId: null,
    layerCount: 1,
    selectedLocationId: null,
    draftRect: null,
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
    if (!state.activeWorkTypeId && state.workTypes.length) {
      state.activeWorkTypeId = state.workTypes[0].id;
    }
    state.workTypes.forEach(function (w) {
      if (state.visibleTypes[w.id] == null) state.visibleTypes[w.id] = true;
    });
    return data;
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

  function patternId(wt, layers) {
    return 'pd-pat-' + wt.id + '-L' + layers;
  }

  function patternsHtml() {
    var out = '<defs>';
    state.workTypes.forEach(function (wt) {
      var maxL = wt.supportsLayers ? 3 : 1;
      for (var layer = 1; layer <= maxL; layer++) {
        var colour = wt.colour || '#ef4444';
        var size = 10;
        var paths;
        if (wt.pattern === 'diagonal') {
          /* Insulation — ////// */
          size = 10;
          paths =
            '<path d="M-2 8 L8 -2" stroke="' + colour + '" stroke-width="2"/>' +
            '<path d="M0 ' + size + ' L' + size + ' 0" stroke="' + colour + '" stroke-width="2"/>' +
            '<path d="M2 ' + (size + 2) + ' L' + (size + 2) + ' 2" stroke="' + colour + '" stroke-width="2"/>';
        } else if (wt.pattern === 'slashdash') {
          /* Metal — -/-/-/ */
          size = 12;
          paths =
            '<path d="M1 6 L5 6" stroke="' + colour + '" stroke-width="2.2" stroke-linecap="butt"/>' +
            '<path d="M6 10 L11 2" stroke="' + colour + '" stroke-width="2" stroke-linecap="butt"/>';
        } else if (wt.pattern === 'dashed') {
          /* Angle & Insulation — - - - - - */
          size = 14;
          paths =
            '<path d="M1 7 L8 7" stroke="' + colour + '" stroke-width="2.2" stroke-linecap="butt"/>';
        } else {
          /* solid _________ — Boarding / Patress / Letterbox (colour distinguishes) */
          size = 8;
          paths =
            '<path d="M0 4 L' + size + ' 4" stroke="' + colour + '" stroke-width="2.4" stroke-linecap="butt"/>';
        }
        out += '<pattern id="' + patternId(wt, layer) + '" patternUnits="userSpaceOnUse" width="' +
          size + '" height="' + size + '">' + paths + '</pattern>';
      }
    });
    return out + '</defs>';
  }

  function addButtonLabel(wt) {
    if (!wt) return 'Add work type';
    var short = wt.name || 'work type';
    if (state.selectedLocationId) return 'Update ' + short;
    return 'Add ' + short;
  }

  function locationVisible(loc) {
    var anns = loc.annotations || [];
    if (!anns.length) return true;
    return anns.some(function (a) { return state.visibleTypes[a.workTypeId] !== false; });
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

    var html = patternsHtml();
    var locs = (state.booking && state.booking.locations) || [];
    locs.forEach(function (loc) {
      if ((loc.pageIndex || 0) !== Math.max(0, (m.pageNum || 1) - 1)) return;
      if (!locationVisible(loc)) return;
      var css = viewer.pdfToPageCss(loc);
      if (!css) return;
      var selected = state.selectedLocationId === loc.id;
      html += '<g class="pd-loc' + (selected ? ' is-selected' : '') + '" data-loc-id="' + escapeHtml(loc.id) + '">';
      (loc.annotations || []).forEach(function (a, idx) {
        if (state.visibleTypes[a.workTypeId] === false) return;
        var wt = workTypeById(a.workTypeId) || { id: a.workTypeId, colour: a.colour, pattern: a.pattern };
        var inset = idx * 3;
        html += '<rect x="' + (css.x + inset) + '" y="' + (css.y + inset) + '" width="' +
          Math.max(2, css.width - inset * 2) + '" height="' + Math.max(2, css.height - inset * 2) +
          '" fill="url(#' + patternId(wt, a.layerCount || 1) + ')" fill-opacity="0.85" stroke="none"/>';
      });
      html += '<rect class="pd-loc-border" x="' + css.x + '" y="' + css.y + '" width="' + css.width +
        '" height="' + css.height + '" fill="transparent" stroke="' +
        (selected ? '#38bdf8' : 'rgba(15,23,42,0.55)') + '" stroke-width="' + (selected ? 2.5 : 1) + '"/>';
      html += '</g>';
    });

    if (state.draftRect) {
      var d = state.draftRect;
      var previewWt = activeWorkType();
      var layers = previewWt && previewWt.supportsLayers ? state.layerCount : 1;
      if (previewWt) {
        html += '<rect class="pd-draft-fill" x="' + d.x + '" y="' + d.y + '" width="' + d.width +
          '" height="' + d.height + '" fill="url(#' + patternId(previewWt, layers) + ')" fill-opacity="0.9"/>';
        html += '<rect class="pd-draft-border" x="' + d.x + '" y="' + d.y + '" width="' + d.width +
          '" height="' + d.height + '" fill="none" stroke="' + escapeHtml(previewWt.colour || '#38bdf8') +
          '" stroke-width="2" stroke-dasharray="6 4"/>';
      } else {
        html += '<rect class="pd-draft-border" x="' + d.x + '" y="' + d.y + '" width="' + d.width +
          '" height="' + d.height + '" fill="rgba(56,189,248,0.08)" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="6 4"/>';
      }
    }

    svg.innerHTML = html;
  }

  function countStats() {
    var locs = (state.booking && state.booking.locations) || [];
    var counts = {};
    state.workTypes.forEach(function (w) { counts[w.id] = 0; });
    locs.forEach(function (loc) {
      (loc.annotations || []).forEach(function (a) {
        counts[a.workTypeId] = (counts[a.workTypeId] || 0) + 1;
      });
    });
    var bits = ['Locations: ' + locs.length];
    state.workTypes.forEach(function (w) {
      if (counts[w.id]) bits.push(w.name + ': ' + counts[w.id]);
    });
    return bits.join(' · ');
  }

  function updateChrome() {
    if ($('pd-stats')) $('pd-stats').textContent = countStats();
    if ($('btn-undo')) $('btn-undo').disabled = !state.undoStack.length;
    if ($('btn-redo')) $('btn-redo').disabled = !state.redoStack.length;
    if ($('btn-pan')) $('btn-pan').classList.toggle('is-on', state.mode === 'pan');
    if ($('btn-select')) $('btn-select').classList.toggle('is-on', state.mode === 'select');

    var wtHost = $('pd-worktypes');
    if (wtHost) {
      wtHost.innerHTML = state.workTypes.map(function (w) {
        return '<button type="button" class="pd-wt' + (w.id === state.activeWorkTypeId ? ' is-on' : '') +
          '" data-wt="' + escapeHtml(w.id) + '" style="border-left-color:' + escapeHtml(w.colour) + '">' +
          escapeHtml(w.name) + '</button>';
      }).join('');
    }

    var wt = activeWorkType();
    var layers = $('pd-layers');
    if (layers) {
      if (wt && wt.supportsLayers) {
        layers.hidden = false;
        layers.innerHTML = [1, 2, 3].map(function (n) {
          return '<button type="button" class="pd-layer' + (state.layerCount === n ? ' is-on' : '') +
            '" data-layer="' + n + '">' + n + '×</button>';
        }).join('');
      } else {
        layers.hidden = true;
        layers.innerHTML = '';
        state.layerCount = 1;
      }
    }

    var vis = $('pd-visibility');
    if (vis) {
      vis.innerHTML = state.workTypes.map(function (w) {
        var on = state.visibleTypes[w.id] !== false;
        return '<button type="button" class="pd-vis' + (on ? '' : ' is-off') + '" data-vis="' +
          escapeHtml(w.id) + '">' + (on ? '☑ ' : '☐ ') + escapeHtml(w.name) + '</button>';
      }).join('');
    }

    var canSave = !!(state.draftRect || state.selectedLocationId);
    if ($('btn-save-location')) {
      $('btn-save-location').disabled = !canSave || !state.activeWorkTypeId;
      $('btn-save-location').textContent = addButtonLabel(wt);
      if (wt && wt.colour) {
        $('btn-save-location').style.borderColor = wt.colour;
        $('btn-save-location').style.boxShadow = 'inset 3px 0 0 ' + wt.colour;
      } else {
        $('btn-save-location').style.borderColor = '';
        $('btn-save-location').style.boxShadow = '';
      }
    }
    if ($('btn-delete-location')) {
      $('btn-delete-location').hidden = !state.selectedLocationId;
    }
  }

  function setMode(mode) {
    state.mode = mode === 'select' ? 'select' : 'pan';
    if (drawingViewer) drawingViewer.setInteractionMode(state.mode);
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
    renderAnnotations();
    updateChrome();
  }

  function getViewer() {
    if (!drawingViewer) {
      drawingViewer = new window.DrawingViewer($('screen-viewer'), {
        onTransform: function () { renderAnnotations(); },
        onSelectStart: function (drag) {
          state.draftRect = {
            x: Math.min(drag.x0, drag.x1),
            y: Math.min(drag.y0, drag.y1),
            width: Math.abs(drag.x1 - drag.x0),
            height: Math.abs(drag.y1 - drag.y0)
          };
          state.selectedLocationId = null;
          renderAnnotations();
          updateChrome();
        },
        onSelectMove: function (drag) {
          state.draftRect = {
            x: Math.min(drag.x0, drag.x1),
            y: Math.min(drag.y0, drag.y1),
            width: Math.abs(drag.x1 - drag.x0),
            height: Math.abs(drag.y1 - drag.y0)
          };
          renderAnnotations();
        },
        onSelectEnd: function (rect) {
          state.draftRect = rect;
          state.selectedLocationId = null;
          renderAnnotations();
          updateChrome();
        },
        onSelectCancel: function () {
          state.draftRect = null;
          renderAnnotations();
          updateChrome();
        }
      });
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
    if (!d || !state.floor) return;
    state.viewing = d;
    state.draftRect = null;
    state.selectedLocationId = null;
    state.undoStack = [];
    state.redoStack = [];
    $('viewer-number').textContent = d.number;
    $('viewer-sub').textContent = (d.title || '') + (d.revision ? ' · Rev ' + d.revision : '');
    showScreen('screen-viewer');
    if ($('pd-chrome')) $('pd-chrome').hidden = false;
    updateChrome();
    setMode('pan');
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
    state.draftRect = null;
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
      if (state.draftRect) {
        var pdf = viewer.pageCssToPdf(
          state.draftRect.x, state.draftRect.y, state.draftRect.width, state.draftRect.height
        );
        if (!pdf) throw new Error('Drawing metrics missing.');
        var anns = currentAnnotationPayload();
        if (!anns.length) throw new Error('Choose a work type.');
        var data = await apiJson('/bookings/' + encodeURIComponent(state.booking.id) + '/locations', {
          method: 'POST',
          body: {
            pageIndex: pdf.pageIndex,
            x: pdf.x,
            y: pdf.y,
            width: pdf.width,
            height: pdf.height,
            annotations: anns
          }
        });
        var savedLoc = null;
        (data.booking.locations || []).forEach(function (l) {
          if (l.id === data.locationId) savedLoc = JSON.parse(JSON.stringify(l));
        });
        pushUndo({ type: 'add', locationId: data.locationId, location: savedLoc });
        state.draftRect = null;
        state.selectedLocationId = data.locationId;
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
  on($('btn-undo'), 'click', undo);
  on($('btn-redo'), 'click', redo);
  on($('btn-pan'), 'click', function () { setMode('pan'); });
  on($('btn-select'), 'click', function () { setMode('select'); });
  on($('btn-save-location'), 'click', saveLocation);
  on($('btn-delete-location'), 'click', deleteSelectedLocation);

  on($('pd-worktypes'), 'click', function (e) {
    var btn = e.target.closest('[data-wt]');
    if (!btn) return;
    state.activeWorkTypeId = btn.getAttribute('data-wt');
    var wt = activeWorkType();
    if (wt && !wt.supportsLayers) state.layerCount = 1;
    /* Instant pattern preview on the selected rectangle */
    renderAnnotations();
    updateChrome();
  });

  on($('pd-layers'), 'click', function (e) {
    var btn = e.target.closest('[data-layer]');
    if (!btn) return;
    state.layerCount = parseInt(btn.getAttribute('data-layer'), 10) || 1;
    renderAnnotations();
    updateChrome();
  });

  on($('pd-visibility'), 'click', function (e) {
    var btn = e.target.closest('[data-vis]');
    if (!btn) return;
    var id = btn.getAttribute('data-vis');
    state.visibleTypes[id] = state.visibleTypes[id] === false;
    renderAnnotations();
    updateChrome();
  });

  on($('pd-anno'), 'click', function (e) {
    var g = e.target.closest('[data-loc-id]');
    if (!g) return;
    e.stopPropagation();
    state.selectedLocationId = g.getAttribute('data-loc-id');
    state.draftRect = null;
    var loc = null;
    ((state.booking && state.booking.locations) || []).forEach(function (l) {
      if (l.id === state.selectedLocationId) loc = l;
    });
    if (loc && loc.annotations && loc.annotations[0]) {
      state.activeWorkTypeId = loc.annotations[0].workTypeId;
      state.layerCount = loc.annotations[0].layerCount || 1;
    }
    renderAnnotations();
    updateChrome();
  });

  boot();
})();
