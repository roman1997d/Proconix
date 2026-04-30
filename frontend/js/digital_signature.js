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
      pending_signatures: 'In progress',
      completed: 'Signed',
      cancelled: 'Cancelled',
      expired: 'Expired',
    };
    return map[st] || st || '—';
  }

  function statusClass(st) {
    if (st === 'completed') return 'ds-badge--signed';
    if (st === 'draft') return 'ds-badge--draft';
    if (st === 'expired') return 'ds-badge--expired';
    if (st === 'cancelled') return 'ds-badge--cancelled';
    return 'ds-badge--pending';
  }

  function formatDate(value) {
    if (!value) return '—';
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  function recipientLabel(value) {
    if (!value) return '';
    var v = String(value).toLowerCase();
    if (v === 'operatives') return 'Operatives';
    if (v === 'client') return 'Client';
    return 'Other';
  }

  function recipientMeta(value) {
    var v = String(value || '').toLowerCase();
    if (v === 'operatives') return { label: 'Operatives', icon: 'bi-people', cls: 'ds-recipient--operatives' };
    if (v === 'client') return { label: 'Client', icon: 'bi-building', cls: 'ds-recipient--client' };
    return { label: 'Other', icon: 'bi-person-badge', cls: 'ds-recipient--other' };
  }

  function countByStatus(docs, status) {
    return docs.filter(function (d) {
      return d.status === status;
    }).length;
  }

  function renderStats(docs) {
    var statsEl = document.getElementById('dsStats');
    if (!statsEl) return;
    var total = docs.length;
    var inProgress = countByStatus(docs, 'pending_signatures');
    var signed = countByStatus(docs, 'completed');
    var drafts = countByStatus(docs, 'draft');

    statsEl.innerHTML =
      '<article class="ds-stat-card">' +
      '<p class="ds-stat-label"><i class="bi bi-files"></i> Total documents</p>' +
      '<p class="ds-stat-value">' +
      total +
      '</p>' +
      '</article>' +
      '<article class="ds-stat-card">' +
      '<p class="ds-stat-label"><i class="bi bi-pen"></i> Signatures in progress</p>' +
      '<p class="ds-stat-value">' +
      inProgress +
      '</p>' +
      '</article>' +
      '<article class="ds-stat-card">' +
      '<p class="ds-stat-label"><i class="bi bi-patch-check"></i> Signed documents</p>' +
      '<p class="ds-stat-value">' +
      signed +
      '</p>' +
      '</article>' +
      '<article class="ds-stat-card">' +
      '<p class="ds-stat-label"><i class="bi bi-file-earmark"></i> Drafts</p>' +
      '<p class="ds-stat-value">' +
      drafts +
      '</p>' +
      '</article>';
  }

  function syncTabsWithStatus(status) {
    var tabs = document.querySelectorAll('.ds-tab');
    tabs.forEach(function (tab) {
      var isActive = (tab.getAttribute('data-status') || '') === (status || '');
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
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
          renderStats([]);
          listEl.innerHTML =
            '<div class="ds-empty"><p>Session expired. Reload the dashboard and sign in again.</p></div>';
          return;
        }
        if (!out.ok || !out.data || !out.data.success) {
          if (emptyEl) emptyEl.classList.add('d-none');
          renderStats([]);
          var msg = (out.data && out.data.message) || 'Could not load documents.';
          if (out.status === 503) {
            msg = 'Documents module: run DB migration scripts/create_digital_documents_tables.sql';
          }
          listEl.innerHTML = '<div class="ds-empty"><p>' + escapeHtml(msg) + '</p></div>';
          return;
        }
        var docs = out.data.documents || [];
        renderStats(docs);
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
              '<a class="ds-action ds-action-primary" href="' +
              attrEscape(buildHref) +
              '"><i class="bi bi-pencil-square"></i> Build &amp; Assign</a>';
            if (d.status === 'pending_signatures' || d.status === 'completed') {
              actions +=
                '<a class="ds-action ds-link-progress" href="#" data-doc-id="' +
                d.id +
                '"><i class="bi bi-activity"></i> Progress</a>';
              actions +=
                '<a class="ds-action" href="' +
                attrEscape('digital_signature_view.html?id=' + d.id) +
                '"><i class="bi bi-eye"></i> View signatures</a>';
            }
            actions +=
              (d.file_url
                ? '<a class="ds-action" href="' +
                  attrEscape(d.file_url) +
                  '" target="_blank" rel="noopener noreferrer"><i class="bi bi-file-earmark-pdf"></i> Original PDF</a>'
                : '');
            actions +=
              '<a href="#" class="ds-action ds-link-reset" data-doc-id="' +
              d.id +
              '"><i class="bi bi-arrow-counterclockwise"></i> Reset</a>';
            actions +=
              '<a href="#" class="ds-action ds-link-delete" data-doc-id="' +
              d.id +
              '"><i class="bi bi-trash3"></i> Delete</a>';
            return (
              '<article class="ds-row" data-id="' +
              d.id +
              '">' +
              '<div class="ds-row-doc">' +
              '<h3 class="ds-row-title">' +
              escapeHtml(d.title || 'Untitled') +
              '</h3>' +
              '<p class="ds-row-meta">' +
              (d.document_type ? escapeHtml(d.document_type) + ' · ' : '') +
              'ID #' +
              d.id +
              '</p>' +
              '</div>' +
              '<div class="ds-row-date">' +
              formatDate(d.created_at) +
              '</div>' +
              '<div class="ds-row-progress"><span>' +
              escapeHtml(prog) +
              '</span><div class="ds-progress"><div class="ds-progress-bar" style="width:' +
              progressPercent(d) +
              '%"></div></div></div>' +
              '<div><span class="ds-badge ' +
              statusClass(d.status) +
              '">' +
              escapeHtml(statusLabel(d.status)) +
              '</span></div>' +
              '<div class="ds-row-recipient">' +
              (function () {
                var rm = recipientMeta(d.recipient_group || d.recipient_type);
                return (
                  '<span class="ds-recipient-pill ' +
                  rm.cls +
                  '"><i class="bi ' +
                  rm.icon +
                  '"></i>' +
                  escapeHtml(rm.label) +
                  '</span>'
                );
              })() +
              '</div>' +
              '<div class="ds-row-actions">' +
              actions +
              '</div>' +
              '</article>'
            );
          })
          .join('');
      })
      .catch(function () {
        if (emptyEl) emptyEl.classList.add('d-none');
        renderStats([]);
        listEl.innerHTML = '<div class="ds-empty"><p>Network error loading documents.</p></div>';
      });
  }

  function progressPercent(d) {
    var a = parseInt(d.assignees_count, 10) || 0;
    var s = parseInt(d.signed_users_count, 10) || 0;
    if (a <= 0) return 0;
    return Math.min(100, Math.round((s / a) * 100));
  }

  function deleteDocument(docId) {
    var headers = getHeadersJson();
    if (!headers) return;
    if (
      !window.confirm(
        'Delete this document permanently? The PDF file and all signatures will be removed from the server.'
      )
    ) {
      return;
    }
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
        if (out.ok && out.data && out.data.success) {
          loadDocuments();
        } else {
          window.alert((out.data && out.data.message) || 'Delete failed.');
        }
      })
      .catch(function () {
        window.alert('Network error.');
      });
  }

  function resetDocument(docId) {
    var headers = getHeadersJson();
    if (!headers) return;
    if (
      !window.confirm(
        'Reset to the original uploaded PDF?\n\nAll field placements, assignments and recorded signatures will be removed. The PDF file stays; you can edit fields again.'
      )
    ) {
      return;
    }
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
        if (out.ok && out.data && out.data.success) {
          loadDocuments();
        } else {
          window.alert((out.data && out.data.message) || 'Reset failed.');
        }
      })
      .catch(function () {
        window.alert('Network error.');
      });
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
    var recipient = document.getElementById('dsUpRecipientGroup');
    if (title) title.value = '';
    if (file) file.value = '';
    if (desc) desc.value = '';
    if (recipient) recipient.value = 'operatives';
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
    var btnCloud = document.getElementById('dsBtnCloudDoc');
    var quickSign = document.getElementById('dsQuickSignDoc');
    var quickTemplate = document.getElementById('dsQuickUseTemplate');
    var quickDraft = document.getElementById('dsQuickContinueDraft');
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
    if (btnCloud) {
      btnCloud.addEventListener('click', function () {
        window.location.href = 'site_cloud.html';
      });
    }
    if (quickSign) {
      quickSign.addEventListener('click', function () {
        openModal();
      });
    }
    if (quickTemplate) {
      quickTemplate.addEventListener('click', function () {
        var st = document.getElementById('dsFilterStatus');
        if (st) st.value = 'draft';
        syncTabsWithStatus('draft');
        loadDocuments();
      });
    }
    if (quickDraft) {
      quickDraft.addEventListener('click', function () {
        var st = document.getElementById('dsFilterStatus');
        if (st) st.value = 'draft';
        syncTabsWithStatus('draft');
        loadDocuments();
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
        syncTabsWithStatus(filterSt.value);
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
    var tabsWrap = document.getElementById('dsTabs');
    if (tabsWrap && filterSt) {
      tabsWrap.addEventListener('click', function (e) {
        var btnTab = e.target.closest && e.target.closest('.ds-tab');
        if (!btnTab) return;
        var status = btnTab.getAttribute('data-status') || '';
        filterSt.value = status;
        syncTabsWithStatus(status);
        loadDocuments();
      });
      syncTabsWithStatus(filterSt.value);
    }

    var listMount = document.getElementById('dsListMount');
    if (listMount) {
      listMount.addEventListener('click', function (e) {
        var prog = e.target.closest && e.target.closest('.ds-link-progress');
        if (prog) {
          e.preventDefault();
          var pid = prog.getAttribute('data-doc-id');
          if (pid) showAssignmentProgress(parseInt(pid, 10));
          return;
        }
        var reset = e.target.closest && e.target.closest('.ds-link-reset');
        if (reset) {
          e.preventDefault();
          var rid = reset.getAttribute('data-doc-id');
          if (rid) resetDocument(parseInt(rid, 10));
          return;
        }
        var del = e.target.closest && e.target.closest('.ds-link-delete');
        if (del) {
          e.preventDefault();
          var did = del.getAttribute('data-doc-id');
          if (did) deleteDocument(parseInt(did, 10));
        }
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
        var recipient = document.getElementById('dsUpRecipientGroup');
        if (desc && desc.value.trim()) fd.append('description', desc.value.trim());
        if (typ && typ.value) fd.append('document_type', typ.value);
        if (proj && proj.value) fd.append('project_id', proj.value);
        if (recipient && recipient.value) fd.append('recipient_group', recipient.value);

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
