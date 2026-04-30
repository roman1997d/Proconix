(function () {
  'use strict';

  var SESSION_KEY = 'proconix_manager_session';
  var SCALE = 1.35;
  var docId = null;
  var docPayload = null;
  var pdfDoc = null;
  var pendingFields = [];
  var allowResignAll = false;

  function getSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function headers() {
    var s = getSession();
    if (!s || s.manager_id == null || !s.email) return null;
    return { 'Content-Type': 'application/json', 'X-Manager-Id': String(s.manager_id), 'X-Manager-Email': s.email };
  }

  function qsId() {
    var m = /[?&]id=(\d+)/.exec(window.location.search);
    return m ? parseInt(m[1], 10) : NaN;
  }

  function esc(v) {
    var d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }

  function showErr(msg) {
    var el = document.getElementById('odsError');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('d-none', !msg);
  }

  function showOk(msg) {
    var el = document.getElementById('odsSuccess');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('d-none', !msg);
  }

  function bindSignatureCanvas(canvas) {
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

  function renderFieldForms() {
    var mount = document.getElementById('odsFieldsMount');
    if (!mount) return;
    mount.innerHTML = '';
    if (!pendingFields.length) {
      mount.innerHTML = '<p class="ods-muted">No signature fields left.</p>';
      return;
    }
    pendingFields.forEach(function (f) {
      var wrap = document.createElement('div');
      wrap.className = 'ods-field-block';
      wrap.setAttribute('data-fid', f.id);
      wrap.innerHTML = '<div><strong>' + esc(f.type) + '</strong> <span class="ods-muted">(field ' + esc(f.id) + ')</span></div>';
      if (f.type === 'signature' || f.type === 'initials') {
        var sc = document.createElement('div');
        sc.className = 'ods-sig-wrap';
        var c = document.createElement('canvas');
        c.width = f.type === 'initials' ? 280 : 400;
        c.height = f.type === 'initials' ? 100 : 140;
        sc.appendChild(c);
        wrap.appendChild(sc);
        var clrFn = bindSignatureCanvas(c);
        var clr = document.createElement('button');
        clr.type = 'button';
        clr.className = 'ods-btn ods-btn-secondary';
        clr.textContent = 'Clear';
        clr.addEventListener('click', function () { clrFn(); });
        wrap.appendChild(clr);
        wrap._getImage = function () { return c.toDataURL('image/png'); };
      } else if (f.type === 'text') {
        var ti = document.createElement('input');
        ti.type = 'text';
        ti.className = 'ods-input';
        ti.value = (document.getElementById('odsSignerName') && document.getElementById('odsSignerName').value) || '';
        ti.placeholder = 'Will use Signer name';
        ti.readOnly = true;
        wrap.appendChild(ti);
      } else if (f.type === 'checkbox') {
        var lb = document.createElement('label');
        lb.className = 'ods-muted';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.disabled = true;
        lb.appendChild(cb);
        lb.appendChild(document.createTextNode(' Confirmed'));
        wrap.appendChild(lb);
      } else if (f.type === 'date') {
        var di = document.createElement('input');
        di.type = 'text';
        di.className = 'ods-input';
        di.value = new Date().toLocaleDateString();
        di.readOnly = true;
        wrap.appendChild(di);
      }
      mount.appendChild(wrap);
    });
  }

  async function renderPdf() {
    var mount = document.getElementById('odsPages');
    if (!mount || !pdfDoc || !docPayload) return;
    mount.innerHTML = '';
    var fields = Array.isArray(docPayload.fields_json) ? docPayload.fields_json : [];
    var signedSet = new Set((docPayload.signatures || []).map(function (s) { return String(s.field_id); }));
    for (var i = 1; i <= pdfDoc.numPages; i += 1) {
      var page = await pdfDoc.getPage(i);
      var viewport = page.getViewport({ scale: SCALE });
      var wrap = document.createElement('div');
      wrap.className = 'ods-page-wrap';
      var canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
      var overlay = document.createElement('div');
      overlay.className = 'ods-overlay';
      fields.filter(function (f) { return (f.page || 1) === i; }).forEach(function (f) {
        var el = document.createElement('div');
        el.className = 'ods-field' + (signedSet.has(String(f.id)) ? ' is-done' : '');
        el.style.left = Number(f.x) * 100 + '%';
        el.style.top = Number(f.y) * 100 + '%';
        el.style.width = Number(f.w) * 100 + '%';
        el.style.height = Number(f.h) * 100 + '%';
        overlay.appendChild(el);
      });
      wrap.appendChild(canvas);
      wrap.appendChild(overlay);
      mount.appendChild(wrap);
    }
  }

  function load() {
    docId = qsId();
    var h = headers();
    if (!h) return showErr('Open from Manager Dashboard.');
    if (!Number.isInteger(docId) || docId < 1) return showErr('Invalid document id.');
    fetch('/api/documents/' + docId, { headers: h, credentials: 'same-origin' })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (out) {
        if (!out.ok || !out.data || !out.data.success) return showErr((out.data && out.data.message) || 'Could not load document.');
        docPayload = out.data.document;
        var title = document.getElementById('odsTitle');
        if (title) title.textContent = docPayload.title || 'Document';
        var fields = Array.isArray(docPayload.fields_json) ? docPayload.fields_json : [];
        var signedSet = new Set((docPayload.signatures || []).map(function (s) { return String(s.field_id); }));
        pendingFields = fields.filter(function (f) {
          if (!f || f.required === false) return false;
          if (['signature', 'initials', 'text', 'checkbox', 'date'].indexOf(f.type) < 0) return false;
          if (allowResignAll) return true;
          return !signedSet.has(String(f.id));
        });
        var meta = document.getElementById('odsMeta');
        if (meta) meta.textContent = (fields.length - pendingFields.length) + '/' + fields.length + ' fields';
        renderFieldForms();
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        return pdfjsLib.getDocument({ url: docPayload.file_url, withCredentials: true }).promise.then(function (pd) {
          pdfDoc = pd;
          return renderPdf();
        });
      })
      .catch(function () { showErr('Network error.'); });
  }

  function submitAll() {
    var h = headers();
    if (!h) return;
    var signer = (document.getElementById('odsSignerName').value || '').trim();
    if (!signer) return showErr('Signer name is required.');
    var c = document.getElementById('odsConfirmRead');
    if (!c || !c.checked) return showErr('Please confirm document read.');
    var blocks = document.querySelectorAll('#odsFieldsMount .ods-field-block');
    var jobs = [];
    for (var i = 0; i < pendingFields.length; i += 1) {
      var f = pendingFields[i];
      var b = document.querySelector('#odsFieldsMount .ods-field-block[data-fid="' + f.id + '"]');
      if (!b) continue;
      if (f.type === 'signature' || f.type === 'initials') {
        if (!b._getImage) continue;
        var img = b._getImage();
        if (!img || img.length < 100) return showErr('Please sign field ' + f.id + '.');
        jobs.push({
          field_id: String(f.id),
          confirmed_read: true,
          signer_name: signer,
          signatureImageBase64: img,
        });
      } else {
        jobs.push({
          field_id: String(f.id),
          confirmed_read: true,
          signer_name: signer,
        });
      }
    }
    var btn = document.getElementById('odsBtnSubmit');
    var addMoreBtn = document.getElementById('odsBtnAddMore');
    if (btn) btn.disabled = true;
    showErr('');
    var chain = Promise.resolve();
    jobs.forEach(function (body) {
      chain = chain.then(function () {
        return fetch('/api/documents/' + docId + '/manager-sign', {
          method: 'POST',
          headers: h,
          credentials: 'same-origin',
          body: JSON.stringify(body),
        }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
          .then(function (out) {
            if (!out.ok || !out.data || !out.data.success) throw new Error((out.data && out.data.message) || 'Sign failed');
          });
      });
    });
    chain.then(function () {
      showOk('Signatures saved successfully.');
      if (btn) btn.disabled = false;
      if (addMoreBtn) addMoreBtn.classList.remove('d-none');
      allowResignAll = false;
      load();
    }).catch(function (e) {
      if (btn) btn.disabled = false;
      showErr(e.message || 'Submit failed.');
    });
  }

  function init() {
    var b = document.getElementById('odsBtnSubmit');
    if (b) b.addEventListener('click', submitAll);
    var addMore = document.getElementById('odsBtnAddMore');
    if (addMore) {
      addMore.addEventListener('click', function () {
        allowResignAll = true;
        showErr('');
        showOk('');
        load();
      });
    }
    var back = document.getElementById('odsBtnViewDash');
    if (back) back.addEventListener('click', function () { window.location.href = 'digital_signature.html'; });
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
