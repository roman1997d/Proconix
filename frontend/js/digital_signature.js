/**
 * Documents & Digital Signatures — manager iframe module.
 * Projects: GET /api/projects/list | Documents: GET/POST /api/documents
 */
(function () {
  'use strict';

  var SESSION_KEY = 'proconix_manager_session';

  function getSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw);
      if (window.parent && window.parent !== window) {
        try {
          raw = window.parent.localStorage.getItem(SESSION_KEY);
          if (raw) return JSON.parse(raw);
        } catch (_) {
          /* cross-origin */
        }
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  function getHeadersJson() {
    var session = getSession();
    if (!session || session.manager_id == null || !session.email) return null;
    return {
      'Content-Type': 'application/json',
      'X-Manager-Id': String(session.manager_id),
      'X-Manager-Email': session.email,
    };
  }

  function getHeadersUpload() {
    var session = getSession();
    if (!session || session.manager_id == null || !session.email) return null;
    return {
      'X-Manager-Id': String(session.manager_id),
      'X-Manager-Email': session.email,
    };
  }

  function projectLabel(p) {
    var n = p.project_name != null ? String(p.project_name) : p.name != null ? String(p.name) : '';
    n = n.trim();
    return n || 'Project #' + p.id;
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function statusLabel(st) {
    var map = {
      draft: 'Draft',
      pending_signatures: 'Pending',
      completed: 'Completed',
      cancelled: 'Cancelled',
      expired: 'Expired',
    };
    return map[st] || st || '—';
  }

  function statusClass(st) {
    if (st === 'completed') return 'ds-badge--signed';
    if (st === 'draft') return 'ds-badge--draft';
    return 'ds-badge--pending';
  }

  var projectsCache = [];

  function fillProjectSelects() {
    var filterSel = document.getElementById('dsFilterProject');
    var modalSel = document.getElementById('dsUpProject');
    var projectOpts = projectsCache
      .map(function (p) {
        return '<option value="' + p.id + '">' + escapeHtml(projectLabel(p)) + '</option>';
      })
      .join('');
    if (filterSel) {
      filterSel.innerHTML = '<option value="">All projects</option>' + projectOpts;
    }
    if (modalSel) {
      modalSel.innerHTML = '<option value="">— No project —</option>' + projectOpts;
    }
  }

  function loadProjects() {
    var headers = getHeadersJson();
    if (!headers) return Promise.resolve();
    return fetch('/api/projects/list', { headers: headers, credentials: 'same-origin' })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (out) {
        if (out.ok && out.data && out.data.success && Array.isArray(out.data.projects)) {
          projectsCache = out.data.projects;
          fillProjectSelects();
        } else {
          projectsCache = [];
          fillProjectSelects();
        }
      })
      .catch(function () {
        projectsCache = [];
        fillProjectSelects();
      });
  }

  function attrEscape(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function loadDocuments() {
    var headers = getHeadersJson();
    var listEl = document.getElementById('dsListMount');
    var emptyEl = document.getElementById('dsEmpty');
    if (!headers || !listEl) return;

    var params = new URLSearchParams();
    var proj = document.getElementById('dsFilterProject');
    var st = document.getElementById('dsFilterStatus');
    var q = document.getElementById('dsSearch');
    if (proj && proj.value) params.set('project_id', proj.value);
    if (st && st.value) params.set('status', st.value);
    if (q && q.value.trim()) params.set('q', q.value.trim());

    var url = '/api/documents' + (params.toString() ? '?' + params.toString() : '');

    return fetch(url, { headers: headers, credentials: 'same-origin' })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .then(function (out) {
        if (out.status === 401) {
          if (emptyEl) emptyEl.classList.add('d-none');
          listEl.innerHTML =
            '<div class="ds-empty"><p>Session expired. Reload the dashboard and sign in again.</p></div>';
          return;
        }
        if (!out.ok || !out.data || !out.data.success) {
          if (emptyEl) emptyEl.classList.add('d-none');
          var msg = (out.data && out.data.message) || 'Could not load documents.';
          if (out.status === 503) {
            msg = 'Documents module: run DB migration scripts/create_digital_documents_tables.sql';
          }
          listEl.innerHTML = '<div class="ds-empty"><p>' + escapeHtml(msg) + '</p></div>';
          return;
        }
        var docs = out.data.documents || [];
        if (docs.length === 0) {
          listEl.innerHTML = '';
          if (emptyEl) emptyEl.classList.remove('d-none');
          return;
        }
        if (emptyEl) emptyEl.classList.add('d-none');
        listEl.innerHTML = docs
          .map(function (d) {
            var prog = d.signatures_progress || '0/0';
            var buildHref = 'digital_signature_builder.html?id=' + d.id;
            var actions =
              '<a href="' +
              attrEscape(buildHref) +
              '">Build &amp; assign</a>';
            if (d.status === 'pending_signatures' || d.status === 'completed') {
              actions +=
                ' · <a href="#" class="ds-link-progress" data-doc-id="' +
                d.id +
                '">Progress</a>';
            }
            actions +=
              (d.file_url
                ? ' · <a href="' +
                  attrEscape(d.file_url) +
                  '" target="_blank" rel="noopener noreferrer">PDF</a>'
                : '');
            return (
              '<article class="ds-card" data-id="' +
              d.id +
              '">' +
              '<span class="ds-badge ' +
              statusClass(d.status) +
              '">' +
              escapeHtml(statusLabel(d.status)) +
              '</span>' +
              '<h3 class="ds-card-title">' +
              escapeHtml(d.title || 'Untitled') +
              '</h3>' +
              '<p class="ds-card-meta">' +
              (d.document_type ? escapeHtml(d.document_type) + ' · ' : '') +
              'Progress: ' +
              escapeHtml(prog) +
              '</p>' +
              '<div class="ds-progress"><div class="ds-progress-bar" style="width:' +
              progressPercent(d) +
              '%"></div></div>' +
              '<div class="ds-card-actions">' +
              actions +
              '</div></article>'
            );
          })
          .join('');
      })
      .catch(function () {
        if (emptyEl) emptyEl.classList.add('d-none');
        listEl.innerHTML = '<div class="ds-empty"><p>Network error loading documents.</p></div>';
      });
  }

  function progressPercent(d) {
    var a = parseInt(d.assignees_count, 10) || 0;
    var s = parseInt(d.signed_users_count, 10) || 0;
    if (a <= 0) return 0;
    return Math.min(100, Math.round((s / a) * 100));
  }

  function showAssignmentProgress(docId) {
    var headers = getHeadersJson();
    if (!headers) return;
    fetch('/api/documents/' + docId, { headers: headers, credentials: 'same-origin' })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (out) {
        if (!out.ok || !out.data.success) {
          window.alert((out.data && out.data.message) || 'Could not load document.');
          return;
        }
        var asg = out.data.document.assignments || [];
        var msg = asg
          .map(function (a) {
            return (
              (a.name || a.email || 'User ' + a.user_id) +
              ': ' +
              (a.completed_fields != null ? a.completed_fields : 0) +
              '/' +
              (a.required_fields != null ? a.required_fields : 0) +
              (a.is_complete ? ' ✓' : '')
            );
          })
          .join('\n');
        window.alert(msg || 'No assignees.');
      })
      .catch(function () {
        window.alert('Network error.');
      });
  }

  function openModal() {
    var backdrop = document.getElementById('dsModalBackdrop');
    var modal = document.getElementById('dsModalNew');
    var err = document.getElementById('dsFormError');
    if (err) {
      err.classList.add('d-none');
      err.textContent = '';
    }
    if (backdrop) {
      backdrop.classList.remove('d-none');
      backdrop.setAttribute('aria-hidden', 'false');
    }
    if (modal) {
      modal.classList.remove('d-none');
      modal.setAttribute('aria-hidden', 'false');
    }
    var title = document.getElementById('dsUpTitle');
    var file = document.getElementById('dsUpFile');
    var desc = document.getElementById('dsUpDesc');
    if (title) title.value = '';
    if (file) file.value = '';
    if (desc) desc.value = '';
  }

  function closeModal() {
    var backdrop = document.getElementById('dsModalBackdrop');
    var modal = document.getElementById('dsModalNew');
    if (backdrop) {
      backdrop.classList.add('d-none');
      backdrop.setAttribute('aria-hidden', 'true');
    }
    if (modal) {
      modal.classList.add('d-none');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  function init() {
    var session = getSession();
    var btn = document.getElementById('dsBtnNewDoc');
    var search = document.getElementById('dsSearch');
    var filterProj = document.getElementById('dsFilterProject');
    var filterSt = document.getElementById('dsFilterStatus');
    var form = document.getElementById('dsFormUpload');

    if (!session || session.manager_id == null) {
      if (btn) {
        btn.setAttribute('disabled', '');
        btn.setAttribute('title', 'Open this module from the manager dashboard (signed in).');
      }
      var listEl = document.getElementById('dsListMount');
      var emptyEl = document.getElementById('dsEmpty');
      if (emptyEl) emptyEl.classList.add('d-none');
      if (listEl) {
        listEl.innerHTML =
          '<div class="ds-empty"><p>Sign in via <strong>Manager Dashboard</strong> and open <strong>Documents & Signatures</strong> from the menu.</p></div>';
      }
      return;
    }

    if (btn) {
      btn.removeAttribute('disabled');
      btn.removeAttribute('title');
      btn.addEventListener('click', function () {
        openModal();
      });
    }
    if (search) {
      search.removeAttribute('disabled');
    }

    document.getElementById('dsModalClose') &&
      document.getElementById('dsModalClose').addEventListener('click', closeModal);
    document.getElementById('dsModalCancel') &&
      document.getElementById('dsModalCancel').addEventListener('click', closeModal);
    document.getElementById('dsModalBackdrop') &&
      document.getElementById('dsModalBackdrop').addEventListener('click', closeModal);

    if (filterProj) {
      filterProj.addEventListener('change', function () {
        loadDocuments();
      });
    }
    if (filterSt) {
      filterSt.addEventListener('change', function () {
        loadDocuments();
      });
    }
    if (search) {
      var t;
      search.addEventListener('input', function () {
        clearTimeout(t);
        t = setTimeout(function () {
          loadDocuments();
        }, 350);
      });
    }

    var listMount = document.getElementById('dsListMount');
    if (listMount) {
      listMount.addEventListener('click', function (e) {
        var link = e.target.closest && e.target.closest('.ds-link-progress');
        if (!link) return;
        e.preventDefault();
        var did = link.getAttribute('data-doc-id');
        if (did) showAssignmentProgress(parseInt(did, 10));
      });
    }

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var errEl = document.getElementById('dsFormError');
        var upHeaders = getHeadersUpload();
        var fileInput = document.getElementById('dsUpFile');
        var titleInput = document.getElementById('dsUpTitle');
        if (!upHeaders || !fileInput || !fileInput.files || !fileInput.files[0]) {
          if (errEl) {
            errEl.textContent = 'Choose a PDF file.';
            errEl.classList.remove('d-none');
          }
          return;
        }
        if (!titleInput || !titleInput.value.trim()) {
          if (errEl) {
            errEl.textContent = 'Title is required.';
            errEl.classList.remove('d-none');
          }
          return;
        }

        var fd = new FormData();
        fd.append('file', fileInput.files[0]);
        fd.append('title', titleInput.value.trim());
        var desc = document.getElementById('dsUpDesc');
        var typ = document.getElementById('dsUpType');
        var proj = document.getElementById('dsUpProject');
        if (desc && desc.value.trim()) fd.append('description', desc.value.trim());
        if (typ && typ.value) fd.append('document_type', typ.value);
        if (proj && proj.value) fd.append('project_id', proj.value);

        var submitBtn = document.getElementById('dsModalSubmit');
        if (submitBtn) submitBtn.disabled = true;

        fetch('/api/documents/upload', {
          method: 'POST',
          headers: upHeaders,
          body: fd,
          credentials: 'same-origin',
        })
          .then(function (res) {
            return res.json().then(function (data) {
              return { ok: res.ok, status: res.status, data: data };
            });
          })
          .then(function (out) {
            if (submitBtn) submitBtn.disabled = false;
            if (out.ok && out.data && out.data.success) {
              closeModal();
              var newId = out.data.document && out.data.document.id;
              if (newId) {
                window.location.href = 'digital_signature_builder.html?id=' + newId;
                return;
              }
              loadDocuments();
              return;
            }
            var msg = (out.data && out.data.message) || 'Upload failed.';
            if (errEl) {
              errEl.textContent = msg;
              errEl.classList.remove('d-none');
            }
          })
          .catch(function () {
            if (submitBtn) submitBtn.disabled = false;
            if (errEl) {
              errEl.textContent = 'Network error.';
              errEl.classList.remove('d-none');
            }
          });
      });
    }

    loadProjects().then(function () {
      return loadDocuments();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
