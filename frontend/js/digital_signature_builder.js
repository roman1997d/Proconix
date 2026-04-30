/**
 * Document Builder — PDF.js + field layout + assign (manager).
 */
(function () {
  'use strict';

  var SESSION_KEY = 'proconix_manager_session';
  var DSB_SCALE = 1.35;

  var pdfDoc = null;
  var docId = null;
  var docRow = null;
  var fields = [];
  var selectedId = null;
  var activeTool = null;
  var operativesCache = [];
  var dragState = null;
  var hasUnsavedChanges = false;
  var templateSaved = false;

  function getSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw);
      if (window.opener) {
        try {
          raw = window.opener.localStorage.getItem(SESSION_KEY);
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

  function qsId() {
    var m = /[?&]id=(\d+)/.exec(window.location.search);
    return m ? parseInt(m[1], 10) : NaN;
  }

  function showError(msg) {
    var el = document.getElementById('dsbError');
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.classList.remove('dsb-hidden');
    } else {
      el.textContent = '';
      el.classList.add('dsb-hidden');
    }
  }

  function genId() {
    return 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  function defaultSize(type) {
    if (type === 'checkbox') return { w: 0.06, h: 0.04 };
    if (type === 'date' || type === 'text') return { w: 0.28, h: 0.045 };
    if (type === 'initials') return { w: 0.12, h: 0.06 };
    return { w: 0.28, h: 0.1 };
  }

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  function normalizeFieldsFromServer(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(function (f) {
      return {
        id: String(f.id),
        type: f.type,
        page: parseInt(f.page, 10) || 1,
        x: Number(f.x) || 0,
        y: Number(f.y) || 0,
        w: Number(f.w) || 0.2,
        h: Number(f.h) || 0.08,
        required: f.required !== false,
        for_user_id: f.for_user_id != null && f.for_user_id !== '' ? parseInt(f.for_user_id, 10) : null,
        label: typeof f.label === 'string' ? f.label : '',
      };
    });
  }

  function fieldsToPayload() {
    return fields.map(function (f) {
      var o = {
        id: f.id,
        type: f.type,
        page: f.page,
        x: clamp01(f.x),
        y: clamp01(f.y),
        w: clamp01(f.w),
        h: clamp01(f.h),
        required: !!f.required,
      };
      if (f.for_user_id != null && Number.isInteger(f.for_user_id)) o.for_user_id = f.for_user_id;
      if (f.label) o.label = f.label;
      return o;
    });
  }

  function setStep(step) {
    var build = document.getElementById('dsbPanelBuild');
    var assign = document.getElementById('dsbPanelAssign');
    var t1 = document.getElementById('dsbTabBuild');
    var t2 = document.getElementById('dsbTabAssign');
    if (step === 'assign') {
      if (build) build.classList.add('dsb-hidden');
      if (assign) assign.classList.remove('dsb-hidden');
      if (t1) t1.classList.remove('is-active');
      if (t2) t2.classList.add('is-active');
    } else {
      if (build) build.classList.remove('dsb-hidden');
      if (assign) assign.classList.add('dsb-hidden');
      if (t1) t1.classList.add('is-active');
      if (t2) t2.classList.remove('is-active');
    }
  }

  function hasSignableField() {
    return fields.some(function (f) {
      return f.type === 'signature' || f.type === 'initials';
    });
  }

  function markDirty() {
    hasUnsavedChanges = true;
    templateSaved = false;
    updateStatusBar();
  }

  function markSaved() {
    hasUnsavedChanges = false;
    templateSaved = true;
    updateStatusBar();
  }

  function updateStatusBar() {
    var statFields = document.getElementById('dsbStatFields');
    var statSign = document.getElementById('dsbStatSignFields');
    var statRecipients = document.getElementById('dsbStatRecipients');
    var statTemplate = document.getElementById('dsbStatTemplate');
    var assignTab = document.getElementById('dsbTabAssign');
    var selectedRecipients = document.querySelectorAll('#dsbOperativeList input[name="op"]:checked').length;
    var signFields = fields.filter(function (f) {
      return f.type === 'signature' || f.type === 'initials';
    }).length;
    if (statFields) statFields.textContent = String(fields.length);
    if (statSign) statSign.textContent = String(signFields);
    if (statRecipients) statRecipients.textContent = String(selectedRecipients);
    if (statTemplate) statTemplate.textContent = templateSaved ? 'Saved' : hasUnsavedChanges ? 'Unsaved changes' : 'Not saved';
    if (assignTab) {
      assignTab.disabled = !hasSignableField();
      assignTab.title = hasSignableField()
        ? 'Open assignment step'
        : 'Add at least one Signature or Initials field first';
    }
  }

  function renderFieldOverlays() {
    document.querySelectorAll('.dsb-overlay').forEach(function (overlay) {
      var pageNum = parseInt(overlay.getAttribute('data-page'), 10);
      overlay.querySelectorAll('.dsb-field').forEach(function (n) {
        n.remove();
      });
      fields
        .filter(function (f) {
          return f.page === pageNum;
        })
        .forEach(function (f) {
          var el = document.createElement('div');
          el.className = 'dsb-field' + (selectedId === f.id ? ' is-selected' : '');
          el.setAttribute('data-fid', f.id);
          el.style.left = f.x * 100 + '%';
          el.style.top = f.y * 100 + '%';
          el.style.width = f.w * 100 + '%';
          el.style.height = f.h * 100 + '%';
          var lab = document.createElement('span');
          lab.className = 'dsb-field-label';
          lab.textContent = f.type;
          el.appendChild(lab);
          overlay.appendChild(el);
        });
    });
    updateStatusBar();
  }

  function attachOverlayHandlers(overlay, pageNum) {
    overlay.setAttribute('data-page', String(pageNum));

    overlay.addEventListener('mousedown', function (e) {
      var t = e.target.closest('.dsb-field');
      if (t) {
        var fid = t.getAttribute('data-fid');
        selectedId = fid;
        var f = fields.find(function (x) {
          return x.id === fid;
        });
        if (!f) return;
        var rect = overlay.getBoundingClientRect();
        var fx = (e.clientX - rect.left) / rect.width;
        var fy = (e.clientY - rect.top) / rect.height;
        dragState = {
          fid: fid,
          startX: fx,
          startY: fy,
          origX: f.x,
          origY: f.y,
        };
        e.preventDefault();
        syncProps();
        renderFieldOverlays();
        return;
      }
      if (!activeTool) return;
      var rect = overlay.getBoundingClientRect();
      var cx = (e.clientX - rect.left) / rect.width;
      var cy = (e.clientY - rect.top) / rect.height;
      var sz = defaultSize(activeTool);
      var x = clamp01(cx - sz.w / 2);
      var y = clamp01(cy - sz.h / 2);
      if (x + sz.w > 1) x = 1 - sz.w;
      if (y + sz.h > 1) y = 1 - sz.h;
      var nf = {
        id: genId(),
        type: activeTool,
        page: pageNum,
        x: x,
        y: y,
        w: sz.w,
        h: sz.h,
        required: true,
        for_user_id: null,
        label: '',
      };
      fields.push(nf);
      selectedId = nf.id;
      markDirty();
      syncProps();
      renderFieldOverlays();
    });

  }

  function onWinMouseMove(e) {
    if (!dragState) return;
    var f = fields.find(function (x) {
      return x.id === dragState.fid;
    });
    if (!f) return;
    var ov = document.querySelector('.dsb-overlay[data-page="' + f.page + '"]');
    if (!ov) return;
    var rect = ov.getBoundingClientRect();
    var fx = (e.clientX - rect.left) / rect.width;
    var fy = (e.clientY - rect.top) / rect.height;
    var dx = fx - dragState.startX;
    var dy = fy - dragState.startY;
    f.x = clamp01(dragState.origX + dx);
    f.y = clamp01(dragState.origY + dy);
    if (f.x + f.w > 1) f.x = 1 - f.w;
    if (f.y + f.h > 1) f.y = 1 - f.h;
    markDirty();
    renderFieldOverlays();
  }

  function onWinMouseUp() {
    dragState = null;
  }

  async function renderPdf() {
    var mount = document.getElementById('dsbPages');
    if (!mount || !pdfDoc) return;
    mount.innerHTML = '';
    var n = pdfDoc.numPages;
    for (var i = 1; i <= n; i++) {
      var page = await pdfDoc.getPage(i);
      var viewport = page.getViewport({ scale: DSB_SCALE });
      var wrap = document.createElement('div');
      wrap.className = 'dsb-page-wrap';
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      var overlay = document.createElement('div');
      overlay.className = 'dsb-overlay';
      wrap.appendChild(canvas);
      wrap.appendChild(overlay);
      mount.appendChild(wrap);
      attachOverlayHandlers(overlay, i);
    }
    renderFieldOverlays();
  }

  function syncProps() {
    var box = document.getElementById('dsbProps');
    var f = fields.find(function (x) {
      return x.id === selectedId;
    });
    if (!f) {
      if (box) box.classList.add('dsb-hidden');
      return;
    }
    if (box) box.classList.remove('dsb-hidden');
    var w = document.getElementById('dsbPropW');
    var h = document.getElementById('dsbPropH');
    var rq = document.getElementById('dsbPropReq');
    var u = document.getElementById('dsbPropUser');
    if (w) w.value = String(f.w);
    if (h) h.value = String(f.h);
    if (rq) rq.checked = f.required !== false;
    if (u) {
      u.value = f.for_user_id != null ? String(f.for_user_id) : '';
    }
  }

  function loadOperatives() {
    var headers = getHeaders();
    if (!headers) return Promise.resolve();
    return fetch('/api/operatives', { headers: headers, credentials: 'same-origin' })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (out) {
        if (out.ok && out.data && out.data.success && Array.isArray(out.data.operatives)) {
          operativesCache = out.data.operatives.filter(function (o) {
            return o.active !== false;
          });
        } else {
          operativesCache = [];
        }
        var sel = document.getElementById('dsbPropUser');
        if (sel) {
          var opts = '<option value="">— All assignees —</option>';
          operativesCache.forEach(function (op) {
            opts +=
              '<option value="' +
              op.id +
              '">' +
              (op.name || '') +
              ' ' +
              (op.email || '') +
              '</option>';
          });
          sel.innerHTML = opts;
        }
        var list = document.getElementById('dsbOperativeList');
        if (list) {
          list.innerHTML = operativesCache
            .map(function (op) {
              var name = (op.name || 'User').trim();
              var email = (op.email || '').trim();
              var searchText = (name + ' ' + email).toLowerCase();
              return (
                '<label class="dsb-cb-item" data-search="' +
                escapeHtml(searchText) +
                '"><input type="checkbox" name="op" value="' +
                op.id +
                '"><span class="dsb-cb-item-meta"><span class="dsb-cb-item-name">' +
                escapeHtml(name || 'User') +
                '</span><span class="dsb-cb-item-email">' +
                escapeHtml(email) +
                '</span></span></label>'
              );
            })
            .join('');
          bindOperativeListUi();
          updateSelectedCount();
          updateStatusBar();
        }
      });
  }

  function updateSelectedCount() {
    var countEl = document.getElementById('dsbSelectedCount');
    var list = document.getElementById('dsbOperativeList');
    if (!countEl || !list) return;
    var checked = list.querySelectorAll('input[name="op"]:checked').length;
    var total = list.querySelectorAll('input[name="op"]').length;
    countEl.textContent = checked + ' selected of ' + total;
    updateStatusBar();
  }

  function filterOperativesList() {
    var list = document.getElementById('dsbOperativeList');
    var search = document.getElementById('dsbOperativeSearch');
    if (!list || !search) return;
    var q = search.value.trim().toLowerCase();
    list.querySelectorAll('.dsb-cb-item').forEach(function (item) {
      var text = item.getAttribute('data-search') || '';
      var visible = !q || text.indexOf(q) !== -1;
      item.style.display = visible ? '' : 'none';
    });
  }

  function bindOperativeListUi() {
    var list = document.getElementById('dsbOperativeList');
    if (!list || list.getAttribute('data-ui-bound') === '1') return;
    list.setAttribute('data-ui-bound', '1');
    list.addEventListener('change', function (e) {
      if (e.target && e.target.matches('input[name="op"]')) {
        updateSelectedCount();
      }
    });
  }

  function loadDocument() {
    docId = qsId();
    if (!Number.isInteger(docId) || docId < 1) {
      showError('Missing document id. Open from Documents & Signatures.');
      return;
    }
    var headers = getHeaders();
    if (!headers) {
      showError('Sign in via Manager Dashboard first.');
      return;
    }
    showError('');
    fetch('/api/documents/' + docId, { headers: headers, credentials: 'same-origin' })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (out) {
        if (!out.ok || !out.data.success) {
          showError((out.data && out.data.message) || 'Could not load document.');
          return;
        }
        docRow = out.data.document;
        var titleEl = document.getElementById('dsbTitle');
        if (titleEl && docRow.title) {
          titleEl.innerHTML = '<i class="bi bi-vector-pen"></i> ' + escapeHtml(docRow.title);
        }
        fields = normalizeFieldsFromServer(docRow.fields_json);
        selectedId = fields.length ? fields[0].id : null;
        hasUnsavedChanges = false;
        templateSaved = fields.length > 0;
        updateStatusBar();
        syncProps();

        if (typeof pdfjsLib === 'undefined') {
          showError('PDF library failed to load.');
          return;
        }
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        var pdfUrl = docRow.file_url.indexOf('http') === 0 ? docRow.file_url : docRow.file_url;
        return pdfjsLib.getDocument({ url: pdfUrl, withCredentials: true }).promise.then(function (pd) {
          pdfDoc = pd;
          return renderPdf();
        });
      })
      .catch(function () {
        showError('Network error loading document.');
      });
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function saveFields() {
    var headers = getHeaders();
    if (!headers) return;
    if (!hasSignableField()) {
      showError('Add at least one Signature or Initials field before saving.');
      return;
    }
    showError('');
    fetch('/api/documents/' + docId + '/fields', {
      method: 'PATCH',
      headers: headers,
      credentials: 'same-origin',
      body: JSON.stringify({ fields: fieldsToPayload() }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (out) {
        if (out.ok && out.data.success) {
          markSaved();
          setStep('assign');
          loadOperatives();
        } else {
          showError((out.data && out.data.message) || 'Save failed.');
        }
      })
      .catch(function () {
        showError('Network error.');
      });
  }

  function sendAssign() {
    var headers = getHeaders();
    if (!headers) return;
    var boxes = document.querySelectorAll('#dsbOperativeList input[name="op"]:checked');
    var assignments = [];
    var dl = document.getElementById('dsbDeadline');
    var deadline = dl && dl.value ? new Date(dl.value).toISOString() : null;
    boxes.forEach(function (cb) {
      assignments.push({
        user_id: parseInt(cb.value, 10),
        deadline: deadline,
        mandatory: true,
      });
    });
    if (assignments.length < 1) {
      showError('Select at least one operative.');
      return;
    }
    showError('');
    fetch('/api/documents/' + docId + '/assign', {
      method: 'POST',
      headers: headers,
      credentials: 'same-origin',
      body: JSON.stringify({ assignments: assignments }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (out) {
        if (out.ok && out.data.success) {
          window.location.href = 'digital_signature.html';
        } else {
          showError((out.data && out.data.message) || 'Assignment failed.');
        }
      })
      .catch(function () {
        showError('Network error.');
      });
  }

  function init() {
    document.querySelectorAll('.dsb-pal-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeTool = btn.getAttribute('data-tool');
        document.querySelectorAll('.dsb-pal-btn').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
      });
    });

    document.getElementById('dsbTabBuild').addEventListener('click', function () {
      setStep('build');
    });
    document.getElementById('dsbTabAssign').addEventListener('click', function () {
      if (!hasSignableField()) {
        showError('Add at least one Signature or Initials field before opening Assign.');
        return;
      }
      setStep('assign');
      loadOperatives();
    });

    document.getElementById('dsbSaveFields').addEventListener('click', saveFields);

    document.getElementById('dsbSendAssign').addEventListener('click', sendAssign);
    var searchOps = document.getElementById('dsbOperativeSearch');
    if (searchOps) {
      searchOps.addEventListener('input', filterOperativesList);
    }
    var btnSelectAllOps = document.getElementById('dsbSelectAllOps');
    if (btnSelectAllOps) {
      btnSelectAllOps.addEventListener('click', function () {
        var list = document.getElementById('dsbOperativeList');
        if (!list) return;
        list.querySelectorAll('.dsb-cb-item').forEach(function (row) {
          if (row.style.display === 'none') return;
          var cb = row.querySelector('input[name="op"]');
          if (cb) cb.checked = true;
        });
        updateSelectedCount();
      });
    }
    var btnClearAllOps = document.getElementById('dsbClearAllOps');
    if (btnClearAllOps) {
      btnClearAllOps.addEventListener('click', function () {
        var list = document.getElementById('dsbOperativeList');
        if (!list) return;
        list.querySelectorAll('input[name="op"]').forEach(function (cb) {
          cb.checked = false;
        });
        updateSelectedCount();
      });
    }

    var btnResetDoc = document.getElementById('dsbBtnResetDoc');
    if (btnResetDoc) {
      btnResetDoc.addEventListener('click', function () {
        if (!docId) return;
        if (
          !window.confirm(
            'Reset to the original uploaded PDF?\n\nAll field placements, assignments and signatures will be removed. The PDF file stays.'
          )
        ) {
          return;
        }
        var headers = getHeaders();
        if (!headers) return;
        showError('');
        fetch('/api/documents/' + docId + '/reset', {
          method: 'POST',
          headers: headers,
          credentials: 'same-origin',
        })
          .then(function (res) {
            return res.json().then(function (data) {
              return { ok: res.ok, data: data };
            });
          })
          .then(function (out) {
            if (out.ok && out.data.success) {
              fields = [];
              selectedId = null;
              hasUnsavedChanges = false;
              templateSaved = false;
              syncProps();
              renderFieldOverlays();
              setStep('build');
              showError('');
            } else {
              showError((out.data && out.data.message) || 'Reset failed.');
            }
          })
          .catch(function () {
            showError('Network error.');
          });
      });
    }

    var btnDeleteDoc = document.getElementById('dsbBtnDeleteDoc');
    if (btnDeleteDoc) {
      btnDeleteDoc.addEventListener('click', function () {
        if (!docId) return;
        if (
          !window.confirm(
            'Delete this document permanently? The PDF and all related data will be removed from the server.'
          )
        ) {
          return;
        }
        var headers = getHeaders();
        if (!headers) return;
        fetch('/api/documents/' + docId, {
          method: 'DELETE',
          headers: headers,
          credentials: 'same-origin',
        })
          .then(function (res) {
            return res.json().then(function (data) {
              return { ok: res.ok, data: data };
            });
          })
          .then(function (out) {
            if (out.ok && out.data.success) {
              window.location.href = 'digital_signature.html';
            } else {
              showError((out.data && out.data.message) || 'Delete failed.');
            }
          })
          .catch(function () {
            showError('Network error.');
          });
      });
    }

    ['dsbPropW', 'dsbPropH'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', function () {
          var f = fields.find(function (x) {
            return x.id === selectedId;
          });
          if (!f) return;
          f.w = clamp01(parseFloat(document.getElementById('dsbPropW').value) || f.w);
          f.h = clamp01(parseFloat(document.getElementById('dsbPropH').value) || f.h);
          if (f.x + f.w > 1) f.x = 1 - f.w;
          if (f.y + f.h > 1) f.y = 1 - f.h;
          markDirty();
          renderFieldOverlays();
        });
      }
    });

    var rq = document.getElementById('dsbPropReq');
    if (rq) {
      rq.addEventListener('change', function () {
        var f = fields.find(function (x) {
          return x.id === selectedId;
        });
        if (f) {
          f.required = rq.checked;
          markDirty();
        }
      });
    }

    var pu = document.getElementById('dsbPropUser');
    if (pu) {
      pu.addEventListener('change', function () {
        var f = fields.find(function (x) {
          return x.id === selectedId;
        });
        if (!f) return;
        var v = pu.value;
        f.for_user_id = v ? parseInt(v, 10) : null;
        markDirty();
      });
    }

    document.getElementById('dsbDeleteField').addEventListener('click', function () {
      if (!selectedId) return;
      fields = fields.filter(function (x) {
        return x.id !== selectedId;
      });
      selectedId = fields.length ? fields[0].id : null;
      markDirty();
      syncProps();
      renderFieldOverlays();
    });

    window.addEventListener('beforeunload', function (e) {
      if (!hasUnsavedChanges) return;
      e.preventDefault();
      e.returnValue = '';
    });

    window.addEventListener('mousemove', onWinMouseMove);
    window.addEventListener('mouseup', onWinMouseUp);

    loadDocument();
    loadOperatives();
    updateStatusBar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
