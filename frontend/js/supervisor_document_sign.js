/**
 * Supervisor document sign-in: list project PDFs, append logical signature pages,
 * assign operatives, collect signatures (stored under operative user_id).
 */
(function () {
  'use strict';

  var TOKEN_KEY = 'proconix_operative_token';
  var SCALE = 1.25;
  var docId = null;
  var docPayload = null;
  var pdfDoc = null;
  var operatives = [];
  var canvasRefs = {};

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
    } catch (e) {
      return null;
    }
  }

  function authHeaders() {
    var t = getToken();
    if (!t) return null;
    return {
      'Content-Type': 'application/json',
      'X-Operative-Token': t,
    };
  }

  function showErr(msg) {
    var el = document.getElementById('svdsError');
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.classList.remove('svds-hidden');
    } else {
      el.textContent = '';
      el.classList.add('svds-hidden');
    }
  }

  function esc(v) {
    var d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }

  function genId() {
    return 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  function api(path, opts) {
    var h = authHeaders();
    if (!h) return Promise.reject(new Error('Not signed in'));
    return fetch(path, Object.assign({ credentials: 'same-origin' }, opts || {}, { headers: Object.assign({}, h, (opts && opts.headers) || {}) }));
  }

  function loadOperatives() {
    return api('/api/documents/supervisor/operatives')
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, data: d };
        });
      })
      .then(function (out) {
        if (!out.ok || !out.data.success) throw new Error((out.data && out.data.message) || 'Operatives failed');
        operatives = out.data.operatives || [];
      });
  }

  function loadList() {
    var hint = document.getElementById('svdsListHint');
    if (hint) hint.textContent = 'Loading…';
    return api('/api/documents/supervisor/list')
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, data: d };
        });
      })
      .then(function (out) {
        if (!out.ok || !out.data.success) throw new Error((out.data && out.data.message) || 'List failed');
        var docs = out.data.documents || [];
        if (hint) {
          hint.textContent = docs.length
            ? 'Select a document attached to your project.'
            : 'No PDF documents for this project yet (manager must upload & link to the project).';
        }
        renderList(docs);
      })
      .catch(function (e) {
        if (hint) hint.textContent = '';
        showErr(e.message || 'Could not load documents.');
      });
  }

  function renderList(docs) {
    var mount = document.getElementById('svdsListMount');
    if (!mount) return;
    mount.innerHTML = '';
    docs.forEach(function (d) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'svds-doc-row';
      b.innerHTML =
        '<div class="svds-doc-title">' +
        esc(d.title || 'Untitled') +
        '</div><div class="svds-doc-meta">Status: ' +
        esc(d.status || '') +
        ' · Progress: ' +
        esc(d.signatures_progress || '—') +
        '</div>';
      b.addEventListener('click', function () {
        openDocument(d.id);
      });
      mount.appendChild(b);
    });
  }

  function openDocument(id) {
    docId = id;
    showErr('');
    document.getElementById('svdsListSection').hidden = true;
    document.getElementById('svdsDetailSection').hidden = false;
    var back = document.getElementById('svdsBackBtn');
    if (back) back.hidden = false;
    return loadOperatives()
      .then(function () {
        return api('/api/documents/supervisor/' + id).then(function (r) {
          return r.json().then(function (d) {
            return { ok: r.ok, data: d };
          });
        });
      })
      .then(function (out) {
        if (!out.ok || !out.data.success) throw new Error((out.data && out.data.message) || 'Load failed');
        docPayload = out.data.document;
        document.getElementById('svdsDocTitle').textContent = docPayload.title || 'Document';
        document.getElementById('svdsDocMeta').textContent =
          'Status: ' +
          (docPayload.status || '') +
          ' · Assignees: ' +
          (docPayload.assignees_count != null ? docPayload.assignees_count : '—');
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        return pdfjsLib.getDocument({ url: docPayload.file_url, withCredentials: true }).promise;
      })
      .then(function (pd) {
        pdfDoc = pd;
        renderOpCheckboxes();
        return renderPdfPages();
      })
      .then(function () {
        renderSignForms();
      })
      .catch(function (e) {
        showErr(e.message || 'Error');
      });
  }

  function renderOpCheckboxes() {
    var mount = document.getElementById('svdsOpList');
    if (!mount) return;
    mount.innerHTML = '';
    operatives.forEach(function (op) {
      var row = document.createElement('label');
      row.className = 'svds-op-row';
      row.innerHTML =
        '<input type="checkbox" name="svds-op" value="' +
        esc(op.id) +
        '"><span>' +
        esc(op.name || op.email || 'User #' + op.id) +
        '</span>';
      mount.appendChild(row);
    });
  }

  function renderPdfPages() {
    var mount = document.getElementById('svdsPages');
    if (!mount || !pdfDoc) return Promise.resolve();
    mount.innerHTML = '';
    var n = pdfDoc.numPages;
    var fields = Array.isArray(docPayload.fields_json) ? docPayload.fields_json : [];
    var maxFieldPage = fields.reduce(function (m, f) {
      return Math.max(m, parseInt(f.page, 10) || 1);
    }, 1);

    function renderOne(pageNum) {
      return pdfDoc.getPage(pageNum).then(function (page) {
        var vp = page.getViewport({ scale: SCALE });
        var wrap = document.createElement('div');
        wrap.className = 'svds-page-wrap';
        var label = document.createElement('div');
        label.className = 'svds-page-label';
        label.textContent =
          pageNum <= n ? 'Page ' + pageNum + ' of ' + n : 'Appendix page ' + pageNum + ' (signature sheet)';
        wrap.appendChild(label);
        var inner = document.createElement('div');
        inner.className = 'svds-page-inner';
        var canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        inner.appendChild(canvas);
        wrap.appendChild(inner);
        mount.appendChild(wrap);
        var ctx = canvas.getContext('2d');
        return page.render({ canvasContext: ctx, viewport: vp }).promise;
      });
    }

    var chain = Promise.resolve();
    for (var p = 1; p <= n; p++) {
      (function (pn) {
        chain = chain.then(function () {
          return renderOne(pn);
        });
      })(p);
    }
    for (var extra = n + 1; extra <= maxFieldPage; extra++) {
      (function (pn) {
        chain = chain.then(function () {
          return pdfDoc.getPage(n).then(function (refPage) {
            var vp = refPage.getViewport({ scale: SCALE });
            var wrap = document.createElement('div');
            wrap.className = 'svds-page-wrap';
            var label = document.createElement('div');
            label.className = 'svds-page-label';
            label.textContent = 'Appendix page ' + pn + ' — fields overlaid in merged PDF export';
            wrap.appendChild(label);
            var inner = document.createElement('div');
            inner.className = 'svds-page-inner';
            var canvas = document.createElement('canvas');
            canvas.width = vp.width;
            canvas.height = vp.height;
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = 'rgba(0,0,0,0.12)';
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
            ctx.fillStyle = 'rgba(60,60,67,0.35)';
            ctx.font = '14px sans-serif';
            ctx.fillText('Extra signature page', 16, 28);
            inner.appendChild(canvas);
            wrap.appendChild(inner);
            mount.appendChild(wrap);
          });
        });
      })(extra);
    }
    return chain;
  }

  function getSelectedOperatives() {
    var boxes = document.querySelectorAll('input[name="svds-op"]:checked');
    var out = [];
    boxes.forEach(function (cb) {
      var id = parseInt(cb.value, 10);
      var o = operatives.find(function (x) {
        return Number(x.id) === id;
      });
      if (o) out.push(o);
    });
    return out;
  }

  function buildSignatureFields(selected) {
    if (!pdfDoc || !selected.length) return [];
    var base = pdfDoc.numPages;
    var rowsPerPage = 4;
    var rowH = 0.22;
    var fields = [];
    selected.forEach(function (op, i) {
      var uid = Number(op.id);
      var pg = base + 1 + Math.floor(i / rowsPerPage);
      var slot = i % rowsPerPage;
      var y0 = 0.02 + slot * rowH;
      fields.push({
        id: genId(),
        type: 'text',
        page: pg,
        x: 0.06,
        y: y0 + 0.006,
        w: 0.88,
        h: 0.026,
        required: true,
        for_user_id: uid,
        label: 'Name',
      });
      fields.push({
        id: genId(),
        type: 'signature',
        page: pg,
        x: 0.06,
        y: y0 + 0.04,
        w: 0.5,
        h: 0.062,
        required: true,
        for_user_id: uid,
      });
      fields.push({
        id: genId(),
        type: 'initials',
        page: pg,
        x: 0.6,
        y: y0 + 0.045,
        w: 0.32,
        h: 0.048,
        required: true,
        for_user_id: uid,
      });
      fields.push({
        id: genId(),
        type: 'date',
        page: pg,
        x: 0.06,
        y: y0 + 0.12,
        w: 0.38,
        h: 0.028,
        required: true,
        for_user_id: uid,
      });
    });
    return fields;
  }

  function buildSheetAndAssign() {
    var selected = getSelectedOperatives();
    if (!selected.length) {
      showErr('Select at least one operative.');
      return;
    }
    if (!docId) return;
    showErr('');
    var fields = buildSignatureFields(selected);
    var assignments = selected.map(function (o) {
      return { user_id: o.id };
    });

    api('/api/documents/supervisor/' + docId + '/fields', {
      method: 'PATCH',
      body: JSON.stringify({ fields: fields }),
    })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, data: d };
        });
      })
      .then(function (out) {
        if (!out.ok || !out.data.success) throw new Error((out.data && out.data.message) || 'Save fields failed');
        return api('/api/documents/supervisor/' + docId + '/assign', {
          method: 'POST',
          body: JSON.stringify({ assignments: assignments }),
        });
      })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, data: d };
        });
      })
      .then(function (out) {
        if (!out.ok || !out.data.success) throw new Error((out.data && out.data.message) || 'Assign failed');
        return openDocument(docId);
      })
      .catch(function (e) {
        showErr(e.message || 'Error');
      });
  }

  function pendingTasks() {
    if (!docPayload) return [];
    var fields = Array.isArray(docPayload.fields_json) ? docPayload.fields_json : [];
    var sigs = Array.isArray(docPayload.signatures) ? docPayload.signatures : [];
    var done = {};
    sigs.forEach(function (s) {
      done[String(s.user_id) + ':' + String(s.field_id)] = true;
    });
    var tasks = [];
    fields.forEach(function (f) {
      if (!f || !f.for_user_id || f.required === false) return;
      var uid = parseInt(f.for_user_id, 10);
      var k = uid + ':' + f.id;
      if (done[k]) return;
      var op = operatives.find(function (x) {
        return Number(x.id) === uid;
      });
      tasks.push({
        field: f,
        target_user_id: uid,
        operative_name: op ? op.name || op.email : '',
      });
    });
    return tasks;
  }

  function bindSigCanvas(canvas) {
    var ctx = canvas.getContext('2d');
    var drawing = false;
    function pos(e) {
      var r = canvas.getBoundingClientRect();
      var sx = canvas.width / r.width;
      var sy = canvas.height / r.height;
      var cx = (e.clientX !== undefined ? e.clientX : e.touches[0].clientX) - r.left;
      var cy = (e.clientY !== undefined ? e.clientY : e.touches[0].clientY) - r.top;
      return { x: cx * sx, y: cy * sy };
    }
    function start(e) {
      e.preventDefault();
      drawing = true;
      ctx.beginPath();
      var p = pos(e);
      ctx.moveTo(p.x, p.y);
    }
    function move(e) {
      if (!drawing) return;
      e.preventDefault();
      var p = pos(e);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    }
    function end() {
      drawing = false;
    }
    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', end);
    canvas.addEventListener('mouseleave', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);
    return function clear() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }

  function renderSignForms() {
    var mount = document.getElementById('svdsFieldsMount');
    if (!mount) return;
    mount.innerHTML = '';
    canvasRefs = {};
    var tasks = pendingTasks();
    if (!tasks.length) {
      mount.innerHTML = '<p class="svds-muted">All required fields are complete, or save a field layout first.</p>';
      return;
    }
    tasks.forEach(function (t) {
      var f = t.field;
      var wrap = document.createElement('div');
      wrap.className = 'svds-field-block';
      wrap.setAttribute('data-fid', f.id);
      wrap.setAttribute('data-uid', String(t.target_user_id));
      var subtitle =
        '<div class="svds-label-strong">' +
        esc(f.type) +
        ' · ' +
        esc(t.operative_name || 'Operative #' + t.target_user_id) +
        '</div>';
      wrap.innerHTML = subtitle;

      if (f.type === 'signature' || f.type === 'initials') {
        var sc = document.createElement('div');
        sc.className = f.type === 'initials' ? 'svds-sig-wrap svds-small-canvas' : 'svds-sig-wrap';
        var c = document.createElement('canvas');
        c.width = f.type === 'initials' ? 280 : 400;
        c.height = f.type === 'initials' ? 90 : 120;
        sc.appendChild(c);
        wrap.appendChild(sc);
        canvasRefs[f.id + ':' + t.target_user_id] = { canvas: c, clear: bindSigCanvas(c) };
        var clr = document.createElement('button');
        clr.type = 'button';
        clr.className = 'svds-btn svds-btn-secondary';
        clr.textContent = 'Clear';
        clr.addEventListener('click', function () {
          canvasRefs[f.id + ':' + t.target_user_id].clear();
        });
        wrap.appendChild(clr);
      } else if (f.type === 'date') {
        var p = document.createElement('p');
        p.className = 'svds-muted';
        p.textContent = 'Date will be set automatically when you submit.';
        wrap.appendChild(p);
      } else if (f.type === 'text') {
        var p2 = document.createElement('p');
        p2.className = 'svds-muted';
        p2.textContent = 'Name will be taken from the operative profile when you submit.';
        wrap.appendChild(p2);
      }
      mount.appendChild(wrap);
    });
  }

  function submitAllSignatures() {
    var cb = document.getElementById('svdsConfirmRead');
    if (!cb || !cb.checked) {
      showErr('Confirm that operatives have read the document.');
      return;
    }
    showErr('');
    var tasks = pendingTasks();
    if (!tasks.length) return;

    function submitOne(idx) {
      if (idx >= tasks.length) {
        showErr('');
        return openDocument(docId).then(function () {
          alert('Saved.');
        });
      }
      var t = tasks[idx];
      var f = t.field;
      var body = {
        target_user_id: t.target_user_id,
        field_id: f.id,
        confirmed_read: true,
      };
      if (f.type === 'signature' || f.type === 'initials') {
        var ref = canvasRefs[f.id + ':' + t.target_user_id];
        if (!ref || !ref.canvas) return submitOne(idx + 1);
        body.signatureImageBase64 = ref.canvas.toDataURL('image/png');
      } else if (f.type === 'date') {
        body.date_value = new Date().toISOString();
      } else if (f.type === 'text') {
        body.text_value = t.operative_name || '';
      }

      return api('/api/documents/supervisor/' + docId + '/collect-sign', {
        method: 'POST',
        body: JSON.stringify(body),
      })
        .then(function (r) {
          return r.json().then(function (d) {
            return { ok: r.ok, data: d };
          });
        })
        .then(function (out) {
          if (!out.ok || !out.data.success) throw new Error((out.data && out.data.message) || 'Save failed');
          return submitOne(idx + 1);
        });
    }

    submitOne(0).catch(function (e) {
      showErr(e.message || 'Submit error');
    });
  }

  document.getElementById('svdsBuildSheetBtn').addEventListener('click', buildSheetAndAssign);
  document.getElementById('svdsSubmitSignBtn').addEventListener('click', submitAllSignatures);
  document.getElementById('svdsBackDetailBtn').addEventListener('click', function () {
    document.getElementById('svdsDetailSection').hidden = true;
    document.getElementById('svdsListSection').hidden = false;
    var back = document.getElementById('svdsBackBtn');
    if (back) back.hidden = true;
    docPayload = null;
    pdfDoc = null;
    docId = null;
    loadList();
  });
  var backTop = document.getElementById('svdsBackBtn');
  if (backTop) {
    backTop.addEventListener('click', function () {
      document.getElementById('svdsDetailSection').hidden = true;
      document.getElementById('svdsListSection').hidden = false;
      backTop.hidden = true;
      docPayload = null;
      pdfDoc = null;
      docId = null;
      loadList();
    });
  }

  document.getElementById('svdsDownloadPdf').addEventListener('click', function (e) {
    e.preventDefault();
    if (!docId) return;
    showErr('');
    api('/api/documents/supervisor/' + docId + '/signed-pdf')
      .then(function (r) {
        if (!r.ok) {
          return r.json().then(function (d) {
            throw new Error((d && d.message) || 'Download failed');
          });
        }
        return r.blob();
      })
      .then(function (blob) {
        var a = document.createElement('a');
        var url = URL.createObjectURL(blob);
        a.href = url;
        a.download = 'signed-' + docId + '.pdf';
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(function (err) {
        showErr(err.message || 'Download error');
      });
  });

  loadList();
})();
