/**
 * Operative document signing — PDF + field forms.
 */
(function () {
  'use strict';

  var TOKEN_KEY = 'proconix_operative_token';
  var USER_KEY = 'proconix_operative_user';
  var DSB_SCALE = 1.35;

  var pdfDoc = null;
  var docId = null;
  var docPayload = null;
  var userId = null;
  var pendingFields = [];

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
    } catch (e) {
      return null;
    }
  }

  function getOperativeUserId() {
    try {
      var raw = localStorage.getItem(USER_KEY);
      if (!raw) return null;
      var u = JSON.parse(raw);
      return u && u.id != null ? parseInt(u.id, 10) : null;
    } catch (e) {
      return null;
    }
  }

  function qsId() {
    var m = /[?&]id=(\d+)/.exec(window.location.search);
    return m ? parseInt(m[1], 10) : NaN;
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function normalizeFields(raw) {
    if (!Array.isArray(raw)) return [];
    return raw;
  }

  function applicableFieldsForUser(fields, uid) {
    return fields.filter(function (f) {
      if (!f || !['signature', 'initials', 'date', 'checkbox', 'text'].includes(f.type)) return false;
      if (f.required === false) return false;
      if (f.for_user_id != null && f.for_user_id !== '') {
        return parseInt(f.for_user_id, 10) === uid;
      }
      return true;
    });
  }

  function showErr(msg) {
    var el = document.getElementById('odsError');
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.classList.remove('d-none');
    } else {
      el.textContent = '';
      el.classList.add('d-none');
    }
  }

  function showOk(msg) {
    var el = document.getElementById('odsSuccess');
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.classList.remove('d-none');
    } else {
      el.classList.add('d-none');
    }
  }

  function apiSign(body) {
    var token = getToken();
    return fetch('/api/documents/' + docId + '/sign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Operative-Token': token,
      },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().then(function (data) {
        return { status: res.status, data: data };
      });
    });
  }

  function bindSignatureCanvas(canvas) {
    var ctx = canvas.getContext('2d');
    var drawing = false;
    function pos(e) {
      var r = canvas.getBoundingClientRect();
      var scaleX = canvas.width / r.width;
      var scaleY = canvas.height / r.height;
      var cx = (e.clientX !== undefined ? e.clientX : e.touches[0].clientX) - r.left;
      var cy = (e.clientY !== undefined ? e.clientY : e.touches[0].clientY) - r.top;
      return { x: cx * scaleX, y: cy * scaleY };
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
    if (pendingFields.length === 0) {
      mount.innerHTML = '<p class="ods-muted">No required fields left for you on this document.</p>';
      return;
    }
    pendingFields.forEach(function (f) {
      var wrap = document.createElement('div');
      wrap.className = 'ods-field-block';
      wrap.setAttribute('data-fid', f.id);
      var h = document.createElement('div');
      h.innerHTML = '<strong>' + escapeHtml(f.type) + '</strong> <span class="ods-muted">(field ' + escapeHtml(f.id) + ')</span>';
      wrap.appendChild(h);

      if (f.type === 'signature' || f.type === 'initials') {
        var cw = f.type === 'initials' ? 280 : 400;
        var ch = f.type === 'initials' ? 100 : 140;
        var sc = document.createElement('div');
        sc.className = 'ods-sig-wrap';
        var c = document.createElement('canvas');
        c.width = cw;
        c.height = ch;
        sc.appendChild(c);
        wrap.appendChild(sc);
        var clearFn = bindSignatureCanvas(c);
        var clr = document.createElement('button');
        clr.type = 'button';
        clr.className = 'ods-btn ods-btn-secondary';
        clr.textContent = 'Clear';
        clr.addEventListener('click', function () {
          clearFn();
        });
        wrap.appendChild(clr);
        wrap._canvas = c;
        wrap._getImage = function () {
          return c.toDataURL('image/png');
        };
      } else if (f.type === 'date') {
        var inp = document.createElement('input');
        inp.type = 'date';
        inp.className = 'ods-input';
        inp.id = 'ods-f-' + f.id;
        var today = new Date().toISOString().slice(0, 10);
        inp.value = today;
        wrap.appendChild(inp);
      } else if (f.type === 'checkbox') {
        var lab = document.createElement('label');
        lab.className = 'ods-muted';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = 'ods-f-' + f.id;
        lab.appendChild(cb);
        lab.appendChild(document.createTextNode(' I confirm / agree'));
        wrap.appendChild(lab);
      } else if (f.type === 'text') {
        var ti = document.createElement('input');
        ti.type = 'text';
        ti.className = 'ods-input';
        ti.id = 'ods-f-' + f.id;
        ti.placeholder = 'Your name or required text';
        wrap.appendChild(ti);
      }
      mount.appendChild(wrap);
    });
  }

  async function renderPdf() {
    var mount = document.getElementById('odsPages');
    if (!mount || !pdfDoc || !docPayload) return;
    mount.innerHTML = '';
    var signedSet = new Set((docPayload.my_field_ids_signed || []).map(String));
    var n = pdfDoc.numPages;
    for (var i = 1; i <= n; i++) {
      var page = await pdfDoc.getPage(i);
      var viewport = page.getViewport({ scale: DSB_SCALE });
      var pwrap = document.createElement('div');
      pwrap.className = 'ods-page-wrap';
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      var overlay = document.createElement('div');
      overlay.className = 'ods-overlay';
      pwrap.appendChild(canvas);
      pwrap.appendChild(overlay);
      mount.appendChild(pwrap);

      var fields = normalizeFields(docPayload.fields_json);
      fields
        .filter(function (f) {
          return f.page === i;
        })
        .forEach(function (f) {
          var el = document.createElement('div');
          el.className = 'ods-field' + (signedSet.has(String(f.id)) ? ' is-done' : '');
          el.style.left = Number(f.x) * 100 + '%';
          el.style.top = Number(f.y) * 100 + '%';
          el.style.width = Number(f.w) * 100 + '%';
          el.style.height = Number(f.h) * 100 + '%';
          overlay.appendChild(el);
        });
    }
  }

  function load() {
    docId = qsId();
    userId = getOperativeUserId();
    if (!getToken()) {
      window.location.href = '/';
      return;
    }
    if (!Number.isInteger(docId) || docId < 1) {
      showErr('Invalid document.');
      return;
    }
    if (!userId) {
      showErr('Could not read your user id. Open the dashboard first.');
      return;
    }

    fetch('/api/documents/operative/document/' + docId, {
      headers: { 'X-Operative-Token': getToken() },
      credentials: 'same-origin',
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .then(function (out) {
        if (out.status === 401) {
          window.location.href = '/';
          return;
        }
        if (!out.ok || !out.data.success) {
          showErr((out.data && out.data.message) || 'Could not load document.');
          return;
        }
        docPayload = out.data.document;
        var title = document.getElementById('odsTitle');
        if (title) title.textContent = docPayload.title || 'Document';
        var meta = document.getElementById('odsMeta');
        if (meta) {
          meta.textContent =
            (docPayload.my_completed_fields || 0) +
            '/' +
            (docPayload.my_required_fields || 0) +
            ' fields';
        }

        var fields = normalizeFields(docPayload.fields_json);
        var need = applicableFieldsForUser(fields, userId);
        var signed = new Set((docPayload.my_field_ids_signed || []).map(String));
        pendingFields = need.filter(function (f) {
          return !signed.has(String(f.id));
        });

        if (docPayload.status === 'completed') {
          document.getElementById('odsPanel').innerHTML =
            '<div class="ods-success"><i class="bi bi-check-circle"></i> This document is fully completed.</div>' +
            '<a class="ods-btn ods-btn-primary" href="operative_dashboard.html" style="display:block;text-align:center;text-decoration:none;margin-top:0.75rem">Back to dashboard</a>';
        } else if (pendingFields.length === 0) {
          var hint = document.getElementById('odsHint');
          if (hint) {
            hint.textContent =
              'You have submitted all fields assigned to you. Other operatives may still need to sign.';
          }
          renderFieldForms();
          var bs = document.getElementById('odsBtnSubmit');
          if (bs) bs.classList.add('d-none');
        } else {
          renderFieldForms();
        }

        if (typeof pdfjsLib === 'undefined') {
          showErr('PDF library failed to load.');
          return;
        }
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        var pdfUrl = docPayload.file_url;
        return pdfjsLib.getDocument({ url: pdfUrl, withCredentials: true }).promise.then(function (pd) {
          pdfDoc = pd;
          return renderPdf();
        });
      })
      .catch(function () {
        showErr('Network error.');
      });
  }

  function collectAndSubmit() {
    var confirmEl = document.getElementById('odsConfirmRead');
    if (!confirmEl || !confirmEl.checked) {
      showErr('Please confirm that you have read the document.');
      return;
    }
    showErr('');

    var blocks = document.querySelectorAll('#odsFieldsMount .ods-field-block');
    var payloads = [];

    for (var i = 0; i < pendingFields.length; i++) {
      var f = pendingFields[i];
      var block = document.querySelector('#odsFieldsMount .ods-field-block[data-fid="' + f.id + '"]');
      if (!block) continue;

      if (f.type === 'signature' || f.type === 'initials') {
        var img = block._getImage && block._getImage();
        if (!img || img.length < 100) {
          showErr('Please draw your ' + f.type + ' for field ' + f.id + '.');
          return;
        }
        payloads.push({
          field_id: f.id,
          confirmed_read: true,
          signatureImageBase64: img,
        });
      } else if (f.type === 'checkbox') {
        var cb = block.querySelector('input[type="checkbox"]');
        if (!cb || !cb.checked) {
          showErr('Please tick the checkbox for field ' + f.id + '.');
          return;
        }
        payloads.push({
          field_id: f.id,
          confirmed_read: true,
          checkbox_value: true,
        });
      } else if (f.type === 'date') {
        var di = block.querySelector('input[type="date"]');
        if (!di || !di.value) {
          showErr('Please set the date for field ' + f.id + '.');
          return;
        }
        payloads.push({
          field_id: f.id,
          confirmed_read: true,
          date_value: new Date(di.value + 'T12:00:00').toISOString(),
        });
      } else if (f.type === 'text') {
        var ti = block.querySelector('input[type="text"]');
        if (!ti || !ti.value.trim()) {
          showErr('Please fill the text for field ' + f.id + '.');
          return;
        }
        payloads.push({
          field_id: f.id,
          confirmed_read: true,
          text_value: ti.value.trim(),
        });
      }
    }

    var btn = document.getElementById('odsBtnSubmit');
    if (btn) btn.disabled = true;

    var chain = Promise.resolve();
    var lastCompleted = false;
    payloads.forEach(function (body) {
      chain = chain.then(function () {
        return apiSign(body).then(function (r) {
          if (r.status !== 200 || !r.data.success) {
            throw new Error((r.data && r.data.message) || 'Sign failed');
          }
          if (r.data.document_completed) lastCompleted = true;
        });
      });
    });

    chain
      .then(function () {
        showErr('');
        showOk('You have signed successfully.');
        document.getElementById('odsFieldsMount').innerHTML = '';
        document.getElementById('odsHint').classList.add('d-none');
        if (btn) {
          btn.classList.add('d-none');
          btn.disabled = false;
        }
        var bd = document.getElementById('odsBtnViewDash');
        if (bd) bd.classList.remove('d-none');
        if (lastCompleted) {
          showOk('All signatures collected. Thank you.');
        }
      })
      .catch(function (e) {
        if (btn) btn.disabled = false;
        showErr(e.message || 'Submit failed.');
      });
  }

  function init() {
    var btn = document.getElementById('odsBtnSubmit');
    if (btn) btn.addEventListener('click', collectAndSubmit);
    var bd = document.getElementById('odsBtnViewDash');
    if (bd)
      bd.addEventListener('click', function () {
        window.location.href = 'operative_dashboard.html';
      });
    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
