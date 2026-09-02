/* Progress Drawings — IndexedDB cache + offline mutation outbox. */
(function (global) {
  'use strict';

  var DB_NAME = 'proconix-progress-drawings';
  var DB_VER = 1;
  var syncing = false;

  function isOnline() {
    return navigator.onLine !== false;
  }

  function isNetworkError(err) {
    if (!err) return true;
    if (err.status) return false;
    var msg = String(err.message || err.name || '');
    return /failed to fetch|networkerror|load failed|offline/i.test(msg) || err.name === 'TypeError';
  }

  function localId(prefix) {
    return String(prefix || 'local') + '-' + Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2, 9);
  }

  function isLocalId(id) {
    return /^l[bl]-/.test(String(id || ''));
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
        if (!db.objectStoreNames.contains('bookings')) db.createObjectStore('bookings');
        if (!db.objectStoreNames.contains('outbox')) {
          db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
        }
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

  function idbGetAll(store) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, 'readonly');
        var req = tx.objectStore(store).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function bootstrapKey(floorId) {
    return 'bootstrap:' + String(floorId || '');
  }

  function putBootstrap(floorId, data) {
    return idbSet('meta', bootstrapKey(floorId), {
      savedAt: Date.now(),
      data: data
    });
  }

  function getBootstrap(floorId) {
    return idbGet('meta', bootstrapKey(floorId)).then(function (row) {
      return row && row.data ? row.data : null;
    });
  }

  function putPdf(drawingId, blob) {
    if (!drawingId || !blob) return Promise.resolve();
    return idbSet('files', 'drawing:' + String(drawingId), {
      savedAt: Date.now(),
      blob: blob
    });
  }

  function getPdf(drawingId) {
    return idbGet('files', 'drawing:' + String(drawingId)).then(function (row) {
      return row && row.blob ? row.blob : null;
    });
  }

  function putBooking(booking) {
    if (!booking || !booking.id) return Promise.resolve();
    return idbSet('bookings', String(booking.id), clone(booking));
  }

  function getBooking(id) {
    return idbGet('bookings', String(id));
  }

  function findDraftBooking(floorId, drawingId) {
    return idbGetAll('bookings').then(function (rows) {
      for (var i = 0; i < rows.length; i++) {
        var b = rows[i];
        if (!b) continue;
        if (String(b.floorId) === String(floorId) &&
            String(b.drawingId) === String(drawingId) &&
            (b.status || 'draft') === 'draft') {
          return b;
        }
      }
      return null;
    });
  }

  function enqueue(op) {
    var row = {
      method: String(op.method || 'POST').toUpperCase(),
      path: String(op.path || ''),
      body: op.body == null ? null : clone(op.body),
      clientLocId: op.clientLocId || null,
      clientBookingId: op.clientBookingId || null,
      createdAt: Date.now()
    };
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('outbox', 'readwrite');
        var req = tx.objectStore('outbox').add(row);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function listOutbox() {
    return idbGetAll('outbox').then(function (rows) {
      return (rows || []).slice().sort(function (a, b) {
        return (a.id || 0) - (b.id || 0);
      });
    });
  }

  function deleteOutbox(id) {
    return idbDel('outbox', id);
  }

  function outboxCount() {
    return listOutbox().then(function (rows) { return rows.length; });
  }

  function rewritePath(path, idMap) {
    var out = String(path || '');
    Object.keys(idMap || {}).forEach(function (from) {
      out = out.split(encodeURIComponent(from)).join(encodeURIComponent(idMap[from]));
      out = out.split('/' + from).join('/' + idMap[from]);
    });
    return out;
  }

  function enrichAnnotations(rawAnns, workTypes) {
    var types = workTypes || [];
    return (rawAnns || []).map(function (a) {
      var wt = null;
      for (var i = 0; i < types.length; i++) {
        if (String(types[i].id) === String(a.workTypeId)) { wt = types[i]; break; }
      }
      return {
        id: a.id || localId('la'),
        workTypeId: String(a.workTypeId),
        workTypeName: (wt && wt.name) || a.workTypeName || 'Work',
        colour: (wt && wt.colour) || a.colour || '#2563eb',
        pattern: (wt && wt.pattern) || a.pattern || 'solid',
        supportsLayers: !!(wt && wt.supportsLayers),
        layerCount: a.layerCount || 1
      };
    });
  }

  function updateLocationInBooking(booking, locId, patch) {
    var next = clone(booking);
    next.locations = (next.locations || []).map(function (loc) {
      if (String(loc.id) !== String(locId)) return loc;
      var merged = Object.assign({}, loc, patch);
      if (patch.annotations) merged.annotations = patch.annotations;
      return merged;
    });
    return next;
  }

  function removeLocationFromBooking(booking, locId) {
    var next = clone(booking);
    next.locations = (next.locations || []).filter(function (loc) {
      return String(loc.id) !== String(locId);
    });
    return next;
  }

  function mergePendingCreate(clientLocId, patch) {
    return listOutbox().then(function (ops) {
      var target = null;
      for (var i = 0; i < ops.length; i++) {
        if (ops[i].clientLocId && String(ops[i].clientLocId) === String(clientLocId) &&
            ops[i].method === 'POST') {
          target = ops[i];
          break;
        }
      }
      if (!target) return false;
      var body = Object.assign({}, target.body || {}, patch || {});
      if (patch && patch.annotations) body.annotations = patch.annotations;
      target.body = body;
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction('outbox', 'readwrite');
          tx.objectStore('outbox').put(target);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { reject(tx.error); };
        });
      });
    });
  }

  function dropOutboxForLocation(clientLocId) {
    return listOutbox().then(function (ops) {
      return Promise.all(ops.filter(function (op) {
        return op.clientLocId && String(op.clientLocId) === String(clientLocId);
      }).map(function (op) {
        return deleteOutbox(op.id);
      }));
    });
  }

  function dropLocationPostsForBooking(bookingId) {
    return listOutbox().then(function (ops) {
      return Promise.all(ops.filter(function (op) {
        return op.method === 'POST' &&
          String(op.path || '').indexOf('/bookings/' + bookingId + '/locations') === 0;
      }).map(function (op) {
        return deleteOutbox(op.id);
      }));
    });
  }

  async function loadBooking(ctx, bookingId) {
    if (ctx.booking && String(ctx.booking.id) === String(bookingId)) {
      return clone(ctx.booking);
    }
    return getBooking(bookingId);
  }

  /**
   * Serve / mutate from IndexedDB when offline.
   * ctx: { booking, workTypes, drawing, project, floor }
   */
  async function handleOffline(path, method, body, ctx) {
    method = String(method || 'GET').toUpperCase();
    body = body || {};
    ctx = ctx || {};

    if (method === 'GET' && path.indexOf('/bootstrap') === 0) {
      var floorQ = '';
      var m = /\bfloor=([^&]+)/.exec(path);
      if (m) floorQ = decodeURIComponent(m[1]);
      var cached = await getBootstrap(floorQ);
      if (!cached) {
        var miss = new Error('No offline catalog yet. Open Progress Drawings once online.');
        miss.code = 'offline_cache_miss';
        throw miss;
      }
      return cached;
    }

    if (method === 'POST' && path === '/bookings') {
      var floorId = body.floorId;
      var drawingId = body.drawingId;
      var existing = await findDraftBooking(floorId, drawingId);
      if (existing) return { success: true, booking: existing };

      var drawing = ctx.drawing || {};
      var booking = {
        id: localId('lb'),
        projectName: (ctx.project && ctx.project.name) || '',
        floorId: floorId,
        drawingId: drawingId,
        drawingNumber: drawing.number || '',
        drawingRevision: drawing.revision || '',
        weekNumber: null,
        weekCommencing: null,
        preparedBy: '',
        notes: '',
        status: 'draft',
        pdfPath: null,
        createdBy: 'offline',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        locations: []
      };
      await putBooking(booking);
      await enqueue({
        method: 'POST',
        path: '/bookings',
        body: { floorId: floorId, drawingId: drawingId },
        clientBookingId: booking.id
      });
      return { success: true, booking: booking };
    }

    var bookingLocs = path.match(/^\/bookings\/([^/]+)\/locations$/);
    if (bookingLocs && method === 'POST') {
      var bid = decodeURIComponent(bookingLocs[1]);
      var bPost = await loadBooking(ctx, bid);
      if (!bPost) throw new Error('Booking not available offline.');
      var locId = localId('ll');
      var anns = enrichAnnotations(body.annotations || [], ctx.workTypes);
      var loc = {
        id: locId,
        pageIndex: body.pageIndex || 0,
        x: Number(body.x),
        y: Number(body.y),
        width: Number(body.width),
        height: Number(body.height),
        markKind: body.markKind === 'rect' ? 'rect' : 'line',
        createdBy: 'offline',
        createdAt: new Date().toISOString(),
        annotations: anns
      };
      bPost.locations = (bPost.locations || []).concat([loc]);
      bPost.updatedAt = new Date().toISOString();
      await putBooking(bPost);
      await enqueue({
        method: 'POST',
        path: '/bookings/' + bid + '/locations',
        body: {
          pageIndex: loc.pageIndex,
          x: loc.x,
          y: loc.y,
          width: loc.width,
          height: loc.height,
          markKind: loc.markKind,
          annotations: (body.annotations || []).map(function (a) {
            return { workTypeId: a.workTypeId, layerCount: a.layerCount || 1 };
          })
        },
        clientLocId: locId,
        clientBookingId: bid
      });
      return { success: true, booking: bPost, locationId: locId };
    }

    if (bookingLocs && method === 'DELETE') {
      var bidDel = decodeURIComponent(bookingLocs[1]);
      var bDel = await loadBooking(ctx, bidDel);
      if (!bDel) throw new Error('Booking not available offline.');
      bDel.locations = [];
      bDel.updatedAt = new Date().toISOString();
      await putBooking(bDel);
      await dropLocationPostsForBooking(bidDel);
      if (!isLocalId(bidDel)) {
        await enqueue({
          method: 'DELETE',
          path: '/bookings/' + bidDel + '/locations',
          body: null,
          clientBookingId: bidDel
        });
      }
      return { success: true, booking: bDel };
    }

    var locMatch = path.match(/^\/locations\/([^/]+)$/);
    if (locMatch && method === 'PUT') {
      var lid = decodeURIComponent(locMatch[1]);
      var bPut = ctx.booking ? clone(ctx.booking) : null;
      if (!bPut) throw new Error('Booking not available offline.');
      var patch = {};
      if (body.x != null) patch.x = Number(body.x);
      if (body.y != null) patch.y = Number(body.y);
      if (body.width != null) patch.width = Number(body.width);
      if (body.height != null) patch.height = Number(body.height);
      if (body.pageIndex != null) patch.pageIndex = Number(body.pageIndex);
      if (body.markKind != null) patch.markKind = body.markKind === 'rect' ? 'rect' : 'line';
      if (body.annotations) patch.annotations = enrichAnnotations(body.annotations, ctx.workTypes);
      bPut = updateLocationInBooking(bPut, lid, patch);
      bPut.updatedAt = new Date().toISOString();
      await putBooking(bPut);
      if (isLocalId(lid)) {
        var merged = await mergePendingCreate(lid, {
          pageIndex: patch.pageIndex,
          x: patch.x,
          y: patch.y,
          width: patch.width,
          height: patch.height,
          markKind: patch.markKind,
          annotations: body.annotations || undefined
        });
        if (!merged) {
          await enqueue({
            method: 'PUT',
            path: '/locations/' + lid,
            body: body,
            clientLocId: lid,
            clientBookingId: bPut.id
          });
        }
      } else {
        await enqueue({
          method: 'PUT',
          path: '/locations/' + lid,
          body: body,
          clientLocId: lid,
          clientBookingId: bPut.id
        });
      }
      return { success: true, booking: bPut };
    }

    if (locMatch && method === 'DELETE') {
      var lidDel = decodeURIComponent(locMatch[1]);
      var bRm = ctx.booking ? clone(ctx.booking) : null;
      if (!bRm) throw new Error('Booking not available offline.');
      bRm = removeLocationFromBooking(bRm, lidDel);
      bRm.updatedAt = new Date().toISOString();
      await putBooking(bRm);
      if (isLocalId(lidDel)) {
        await dropOutboxForLocation(lidDel);
      } else {
        await enqueue({
          method: 'DELETE',
          path: '/locations/' + lidDel,
          body: null,
          clientLocId: lidDel,
          clientBookingId: bRm.id
        });
      }
      return { success: true, booking: bRm };
    }

    if (path.indexOf('/email') !== -1 || path.indexOf('/pdf') !== -1) {
      throw new Error('Connect to the internet to share or export the PDF.');
    }

    throw new Error('This action needs an internet connection.');
  }

  async function cacheAfterSuccess(path, method, data) {
    method = String(method || 'GET').toUpperCase();
    if (!data) return;
    if (method === 'GET' && path.indexOf('/bootstrap') === 0) {
      var floorQ = '';
      var m = /\bfloor=([^&]+)/.exec(path);
      if (m) floorQ = decodeURIComponent(m[1]);
      await putBootstrap(floorQ, data);
    }
    if (data.booking) await putBooking(data.booking);
  }

  /**
   * Flush outbox in order. apiCall(path, { method, body }) must hit the network only.
   */
  async function flushOutbox(apiCall, hooks) {
    hooks = hooks || {};
    if (syncing) return { skipped: true };
    if (!isOnline()) return { skipped: true, offline: true };
    syncing = true;
    var idMap = {};
    var flushed = 0;
    try {
      var ops = await listOutbox();
      for (var i = 0; i < ops.length; i++) {
        var op = ops[i];
        var path = rewritePath(op.path, idMap);
        var body = op.body ? clone(op.body) : null;

        /* Skip duplicate POST /bookings after local id already mapped. */
        if (op.method === 'POST' && op.path === '/bookings' && op.clientBookingId && idMap[op.clientBookingId]) {
          await deleteOutbox(op.id);
          flushed += 1;
          continue;
        }

        var data = await apiCall(path, { method: op.method, body: body });

        if (op.method === 'POST' && op.path === '/bookings' && data && data.booking && op.clientBookingId) {
          idMap[op.clientBookingId] = String(data.booking.id);
          try { await idbDel('bookings', op.clientBookingId); } catch (e) {}
          await putBooking(data.booking);
        }
        if (op.method === 'POST' && /\/locations$/.test(path) && data && data.locationId && op.clientLocId) {
          idMap[op.clientLocId] = String(data.locationId);
        }
        if (data && data.booking) await putBooking(data.booking);

        await deleteOutbox(op.id);
        flushed += 1;
        if (hooks.onOpDone) hooks.onOpDone(op, data, idMap);
      }
      return { flushed: flushed, idMap: idMap };
    } finally {
      syncing = false;
    }
  }

  function remapIdsInBooking(booking, idMap) {
    if (!booking || !idMap) return booking;
    var next = clone(booking);
    if (idMap[next.id]) next.id = idMap[next.id];
    next.locations = (next.locations || []).map(function (loc) {
      var l = Object.assign({}, loc);
      if (idMap[l.id]) l.id = idMap[l.id];
      return l;
    });
    return next;
  }

  global.PdOffline = {
    isOnline: isOnline,
    isNetworkError: isNetworkError,
    isLocalId: isLocalId,
    localId: localId,
    putBootstrap: putBootstrap,
    getBootstrap: getBootstrap,
    putPdf: putPdf,
    getPdf: getPdf,
    putBooking: putBooking,
    getBooking: getBooking,
    findDraftBooking: findDraftBooking,
    enqueue: enqueue,
    listOutbox: listOutbox,
    outboxCount: outboxCount,
    handleOffline: handleOffline,
    cacheAfterSuccess: cacheAfterSuccess,
    flushOutbox: flushOutbox,
    remapIdsInBooking: remapIdsInBooking,
    isSyncing: function () { return syncing; }
  };
})(window);
