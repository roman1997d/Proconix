/**
 * Manager: view PDF with signature overlays (read-only).
 */
(function () {
  'use strict';

  var SESSION_KEY = 'proconix_manager_session';
  var DSV_SCALE = 1.35;

  function getSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw);
      if (window.parent && window.parent !== window) {
        try {
          raw = window.parent.localStorage.getItem(SESSION_KEY);
          if (raw) return JSON.parse(raw);
        } catch (_) {}
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  function getHeaders() {
    var session = getSession();
    if (!session || session.manager_id == null || !session.email) return null;
    return {
      'Content-Type': 'application/json',
      'X-Manager-Id': String(session.manager_id),
      'X-Manager-Email': session.email,
    };
  }

  /** Auth only (no Content-Type) — use for GET binary responses. */
  function getAuthHeaders() {
    var session = getSession();
    if (!session || session.manager_id == null || !session.email) return null;
    return {
      'X-Manager-Id': String(session.manager_id),
      'X-Manager-Email': session.email,
    };
  }

  function parseFilenameFromContentDisposition(cd) {
    if (!cd) return 'signed-document.pdf';
    var m = /filename\*=(?:UTF-8'')?([^;\s]+)|filename="([^"]+)"/i.exec(cd);
    if (!m) return 'signed-document.pdf';
    var raw = (m[1] || m[2] || '').replace(/^"|"$/g, '');
    try {
      return decodeURIComponent(raw);
    } catch (_) {
      return raw || 'signed-document.pdf';
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

  function metaLabel(sig) {
    var m = sig.client_meta || {};
    if (typeof m === 'string') {
      try {
        m = JSON.parse(m);
      } catch (_) {
        m = {};
      }
    }
    if (m.text_value) return String(m.text_value);
    if (m.date_value) {
      try {
        return new Date(m.date_value).toLocaleString();
      } catch (_) {
        return String(m.date_value);
      }
    }
    if (m.checkbox_value === true || m.checkbox_value === 'true') return 'Confirmed / agreed';
    return '';
  }

  function isInkField(sig) {
    var m = sig.client_meta || {};
    if (typeof m === 'string') {
      try {
        m = JSON.parse(m);
      } catch (_) {
        m = {};
      }
    }
    var t = m.field_type;
    if (t === 'checkbox' || t === 'date' || t === 'text') return false;
    if (t === 'signature' || t === 'initials') return true;
    return true;
  }

  function signaturesByField(signatures) {
    var map = {};
    (signatures || []).forEach(function (s) {
      var fid = String(s.field_id);
      if (!map[fid]) map[fid] = [];
      map[fid].push(s);
    });
    return map;
  }

  function formatWhen(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString();
    } catch (_) {
      return '—';
    }
  }

  function renderAuditList(signatures) {
    var ul = document.getElementById('dsvAuditList');
    if (!ul) return;
    ul.innerHTML = '';
    (signatures || []).forEach(function (s) {
      var li = document.createElement('li');
      var parts = [];
      parts.push('<strong>' + escapeHtml(s.user_name || s.user_email || 'User ' + s.user_id) + '</strong>');
      parts.push('<span class="dsv-muted">Field ' + escapeHtml(s.field_id) + '</span>');
      var line = metaLabel(s);
      if (line && !isInkField(s)) {
        parts.push('<div class="dsv-sig-text">' + escapeHtml(line) + '</div>');
      }
      parts.push('<div class="dsv-sig-user">' + escapeHtml(formatWhen(s.signed_at)) + '</div>');
      li.innerHTML = parts.join(' ');
      ul.appendChild(li);
    });
    if (!signatures || !signatures.length) {
      ul.innerHTML = '<li class="dsv-muted">No signatures recorded yet.</li>';
    }
  }

  async function renderPdf(doc, signatures) {
    var mount = document.getElementById('dsvPages');
    if (!mount || typeof pdfjsLib === 'undefined') return;
    mount.innerHTML = '';
    var fields = normalizeFields(doc.fields_json);
    var byField = signaturesByField(signatures);

    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    var pdf = await pdfjsLib.getDocument({ url: doc.file_url, withCredentials: true }).promise;
    var n = pdf.numPages;

    for (var i = 1; i <= n; i++) {
      var page = await pdf.getPage(i);
      var viewport = page.getViewport({ scale: DSV_SCALE });
      var wrap = document.createElement('div');
      wrap.className = 'dsv-page-wrap';
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      var overlay = document.createElement('div');
      overlay.className = 'dsv-overlay';

      fields
        .filter(function (f) {
          return (f.page || 1) === i;
        })
        .forEach(function (f) {
          var box = document.createElement('div');
          var fid = String(f.id);
          var sigs = byField[fid] || [];
          box.className = 'dsv-field' + (sigs.length ? '' : ' dsv-field-empty');
          box.style.left = Number(f.x) * 100 + '%';
          box.style.top = Number(f.y) * 100 + '%';
          box.style.width = Number(f.w) * 100 + '%';
          box.style.height = Number(f.h) * 100 + '%';

          var lab = document.createElement('div');
          lab.className = 'dsv-field-label';
          lab.textContent = (f.type || 'field') + ' · ' + fid;
          box.appendChild(lab);

          if (sigs.length === 0) {
            var pending = document.createElement('div');
            pending.className = 'dsv-muted';
            pending.style.fontSize = '0.65rem';
            pending.textContent = 'Pending';
            box.appendChild(pending);
          } else {
            sigs.forEach(function (sig) {
              var ink = isInkField(sig);
              var textLine = metaLabel(sig);
              if (!ink && textLine) {
                var t = document.createElement('div');
                t.className = 'dsv-sig-text';
                t.textContent = textLine;
                box.appendChild(t);
              } else if (ink && sig.signature_image_url) {
                var im = document.createElement('img');
                im.className = 'dsv-sig-img';
                im.alt = '';
                im.src = sig.signature_image_url;
                im.loading = 'lazy';
                box.appendChild(im);
              } else if (textLine) {
                var t2 = document.createElement('div');
                t2.className = 'dsv-sig-text';
                t2.textContent = textLine;
                box.appendChild(t2);
              }
              var u = document.createElement('div');
              u.className = 'dsv-sig-user';
              u.textContent = (sig.user_name || sig.user_email || '') + ' · ' + formatWhen(sig.signed_at);
              box.appendChild(u);
            });
          }
          overlay.appendChild(box);
        });

      wrap.appendChild(canvas);
      wrap.appendChild(overlay);
      mount.appendChild(wrap);
    }
  }

  function load() {
    var id = qsId();
    var headers = getHeaders();
    var errEl = document.getElementById('dsvError');

    if (!headers) {
      if (errEl) {
        errEl.textContent = 'Sign in via Manager Dashboard, then open this page from Documents & Signatures.';
        errEl.classList.remove('d-none');
      }
      return;
    }
    if (!Number.isInteger(id) || id < 1) {
      if (errEl) {
        errEl.textContent = 'Invalid document id.';
        errEl.classList.remove('d-none');
      }
      return;
    }

    fetch('/api/documents/' + id, { headers: headers, credentials: 'same-origin' })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (out) {
        if (!out.ok || !out.data.success) {
          if (errEl) {
            errEl.textContent = (out.data && out.data.message) || 'Could not load document.';
            errEl.classList.remove('d-none');
          }
          return;
        }
        var doc = out.data.document;
        var title = document.getElementById('dsvTitle');
        if (title) {
          title.innerHTML = '<i class="bi bi-file-earmark-check"></i> ' + escapeHtml(doc.title || 'Document');
        }
        var st = document.getElementById('dsvStatus');
        if (st) {
          st.textContent = doc.status || '';
          var n = (doc.signatures && doc.signatures.length) || 0;
          st.textContent += n ? ' · ' + n + ' field response(s)' : '';
        }
        renderAuditList(doc.signatures);
        return renderPdf(doc, doc.signatures || []);
      })
      .catch(function () {
        if (errEl) {
          errEl.textContent = 'Network error.';
          errEl.classList.remove('d-none');
        }
      });
  }

  function wireDownloadAndEmail() {
    var bd = document.getElementById('dsvBtnDownload');
    var em = document.getElementById('dsvBtnEmail');

    function runDownload() {
      var id = qsId();
      var headers = getAuthHeaders();
      if (!headers) {
        alert('Sign in via Manager Dashboard, then open this page from Documents & Signatures.');
        return;
      }
      if (!Number.isInteger(id) || id < 1) {
        alert('Invalid document id.');
        return;
      }
      if (bd) bd.disabled = true;
      fetch('/api/documents/' + id + '/signed-pdf', { headers: headers, credentials: 'same-origin' })
        .then(function (res) {
          var ct = (res.headers.get('Content-Type') || '').toLowerCase();
          if (ct.indexOf('application/json') !== -1) {
            return res.json().then(function (data) {
              throw new Error((data && data.message) || 'Download failed.');
            });
          }
          if (!res.ok) {
            return res.text().then(function () {
              throw new Error('Download failed (' + res.status + ').');
            });
          }
          var fname = parseFilenameFromContentDisposition(res.headers.get('Content-Disposition'));
          return res.blob().then(function (blob) {
            return { blob: blob, fname: fname };
          });
        })
        .then(function (o) {
          var url = URL.createObjectURL(o.blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = o.fname || 'signed-document.pdf';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        })
        .catch(function (e) {
          alert(e.message || String(e));
        })
        .finally(function () {
          if (bd) bd.disabled = false;
        });
    }

    function runEmail() {
      var id = qsId();
      var headers = getHeaders();
      if (!headers) {
        alert('Sign in via Manager Dashboard, then open this page from Documents & Signatures.');
        return;
      }
      if (!Number.isInteger(id) || id < 1) {
        alert('Invalid document id.');
        return;
      }
      if (em) em.disabled = true;
      fetch('/api/documents/' + id + '/email-signed', {
        method: 'POST',
        headers: headers,
        credentials: 'same-origin',
        body: '{}',
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { status: res.status, data: data };
          });
        })
        .then(function (out) {
          if (!out.data || !out.data.success) {
            var msg = (out.data && out.data.message) || 'Failed to send email.';
            throw new Error(msg);
          }
          alert(out.data.message || 'Signed PDF was sent to your email.');
        })
        .catch(function (e) {
          alert(e.message || String(e));
        })
        .finally(function () {
          if (em) em.disabled = false;
        });
    }

    if (bd) bd.addEventListener('click', runDownload);
    if (em) em.addEventListener('click', runEmail);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      wireDownloadAndEmail();
      load();
    });
  } else {
    wireDownloadAndEmail();
    load();
  }
})();
