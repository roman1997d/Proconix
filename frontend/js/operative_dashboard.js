/**
 * Operative Dashboard – API calls, clock in/out, modals, dynamic content.
 * Requires proconix_operative_token in localStorage.
 */

(function () {
  'use strict';

  var TOKEN_KEY = 'proconix_operative_token';
  var USER_KEY = 'proconix_operative_user';

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
    } catch (e) {
      return null;
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
    window.location.href = '/';
  }

  function api(path, options) {
    var token = getToken();
    if (!token) return Promise.reject(new Error('No token'));
    var opts = options || {};
    var headers = opts.headers || {};
    headers['X-Operative-Token'] = token;
    if (opts.body && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    opts.headers = headers;
    opts.credentials = 'same-origin';
    return fetch('/api/operatives' + path, opts).then(function (res) {
      var contentType = res.headers.get('Content-Type') || '';
      if (contentType.indexOf('application/json') !== -1) {
        return res.json().then(function (data) {
          if (res.status === 401) {
            clearSession();
            return Promise.reject(new Error(data.message || 'Session expired'));
          }
          if (res.status === 403 && (data.code === 'account_deactivated' || (data.message && data.message.indexOf('dezactivat') !== -1))) {
            showDeactivatedBlock();
            return Promise.reject(new Error(data.message || 'Account deactivated'));
          }
          return { status: res.status, data: data };
        });
      }
      return res.text().then(function (text) {
        return { status: res.status, data: { message: text } };
      });
    });
  }

  function showDeactivatedBlock() {
    var block = document.getElementById('op-deactivated-block');
    var main = document.querySelector('.op-main');
    var header = document.querySelector('.op-header');
    if (block) {
      block.classList.remove('d-none');
      if (main) main.classList.add('d-none');
      if (header) header.classList.add('d-none');
    }
  }

  var clockStatusEl = document.getElementById('op-clock-status');
  var hoursTodayEl = document.getElementById('op-hours-today');
  var btnClockIn = document.getElementById('op-btn-clock-in');
  var btnClockOut = document.getElementById('op-btn-clock-out');
  var clockFeedbackEl = document.getElementById('op-clock-feedback');
  var projectContentEl = document.getElementById('op-project-content');
  var weeklyTotalEl = document.getElementById('op-weekly-total');
  var weeklyBarsEl = document.getElementById('op-weekly-bars');
  var tasksListEl = document.getElementById('op-tasks-list');

  function showFeedback(el, message, isError) {
    if (!el) return;
    el.textContent = message || '';
    el.classList.remove('success', 'error', 'd-none');
    el.classList.add(isError ? 'error' : 'success');
    el.classList.remove('d-none');
  }

  function hideFeedback(el) {
    if (el) el.classList.add('d-none');
  }

  function formatTime(iso) {
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '—';
    }
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    } catch (e) {
      return '—';
    }
  }

  function loadClockStatus() {
    if (!clockStatusEl) return;
    clockStatusEl.textContent = 'Loading…';
    api('/work-hours/status')
      .then(function (r) {
        if (!r.data.success) {
          clockStatusEl.textContent = '—';
          return;
        }
        var d = r.data;
        if (d.clockedIn && d.current) {
          clockStatusEl.textContent = 'Clocked in at ' + formatTime(d.current.clock_in);
          if (btnClockIn) btnClockIn.classList.add('d-none');
          if (btnClockOut) btnClockOut.classList.remove('d-none');
        } else {
          clockStatusEl.textContent = 'Not clocked in';
          if (btnClockIn) btnClockIn.classList.remove('d-none');
          if (btnClockOut) btnClockOut.classList.add('d-none');
        }
        if (hoursTodayEl) {
          var h = typeof d.hoursToday === 'number' ? d.hoursToday : 0;
          hoursTodayEl.textContent = h.toFixed(1) + ' h today';
        }
      })
      .catch(function () {
        clockStatusEl.textContent = '—';
      });
  }

  function loadWeekly() {
    if (!weeklyTotalEl || !weeklyBarsEl) return;
    api('/work-hours/weekly')
      .then(function (r) {
        if (!r.data.success) {
          weeklyTotalEl.textContent = '0 h this week';
          weeklyBarsEl.innerHTML = '';
          return;
        }
        var total = r.data.totalHours || 0;
        var byDay = r.data.byDay || [];
        weeklyTotalEl.textContent = total.toFixed(1) + ' h this week';
        var maxH = Math.max(1, byDay.reduce(function (m, x) { return Math.max(m, x.hours); }, 0));
        weeklyBarsEl.innerHTML = byDay.length === 0
          ? '<p class="op-text-muted" style="margin:0;font-size:0.9rem">No hours recorded yet.</p>'
          : byDay.map(function (row) {
              var pct = maxH > 0 ? (row.hours / maxH) * 100 : 0;
              return (
                '<div class="op-week-bar">' +
                '<label>' + formatDate(row.day) + '</label>' +
                '<div class="bar-wrap"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
                '<span class="hours">' + row.hours.toFixed(1) + 'h</span>' +
                '</div>'
              );
            }).join('');
      })
      .catch(function () {
        weeklyTotalEl.textContent = '0 h this week';
        weeklyBarsEl.innerHTML = '';
      });
  }

  function loadProject() {
    if (!projectContentEl) return;
    projectContentEl.textContent = 'Loading…';
    api('/project/current')
      .then(function (r) {
        if (!r.data.success || !r.data.project) {
          projectContentEl.innerHTML = '<p class="op-text-muted" style="margin:0">No project assigned.</p>';
          return;
        }
        var p = r.data.project;
        var pName = p.name || p.project_name || '—';
        projectContentEl.innerHTML =
          '<div class="op-project-name">' + escapeHtml(pName) + '</div>' +
          (p.address ? '<div>' + escapeHtml(p.address) + '</div>' : '') +
          (p.start_date ? '<div class="op-project-meta">Start: ' + escapeHtml(p.start_date) + '</div>' : '') +
          (p.description ? '<div class="op-project-meta">' + escapeHtml(p.description) + '</div>' : '');
      })
      .catch(function () {
        projectContentEl.textContent = '—';
      });
  }

  function loadTasks() {
    if (!tasksListEl) return;
    tasksListEl.textContent = 'Loading…';
    api('/tasks')
      .then(function (r) {
        if (!r.data.success || !r.data.tasks || r.data.tasks.length === 0) {
          tasksListEl.innerHTML = '<p class="op-text-muted" style="margin:0">No tasks assigned.</p>';
          return;
        }
        tasksListEl.innerHTML = r.data.tasks.map(function (t) {
          var status = (t.status || 'pending').toLowerCase().replace(/\s/g, '-');
          return (
            '<div class="op-task-item">' +
            '<div><div class="op-task-name">' + escapeHtml(t.name || '—') + '</div>' +
            '<div class="op-task-meta">Due: ' + (t.deadline ? escapeHtml(t.deadline) : '—') + '</div></div>' +
            '<span class="op-task-status ' + status + '">' + escapeHtml(t.status || 'pending') + '</span>' +
            '</div>'
          );
        }).join('');
      })
      .catch(function () {
        tasksListEl.textContent = '—';
      });
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function clockIn() {
    if (!btnClockIn) return;
    btnClockIn.disabled = true;
    hideFeedback(clockFeedbackEl);
    api('/work-hours/clock-in', { method: 'POST', body: JSON.stringify({}) })
      .then(function (r) {
        btnClockIn.disabled = false;
        if (r.data.success) {
          showFeedback(clockFeedbackEl, 'Clocked in.', false);
          loadClockStatus();
          loadWeekly();
        } else {
          showFeedback(clockFeedbackEl, r.data.message || 'Failed.', true);
        }
      })
      .catch(function (err) {
        btnClockIn.disabled = false;
        showFeedback(clockFeedbackEl, err.message || 'Failed.', true);
      });
  }

  function clockOut() {
    if (!btnClockOut) return;
    btnClockOut.disabled = true;
    hideFeedback(clockFeedbackEl);
    api('/work-hours/clock-out', { method: 'POST', body: JSON.stringify({}) })
      .then(function (r) {
        btnClockOut.disabled = false;
        if (r.data.success) {
          showFeedback(clockFeedbackEl, 'Clocked out.', false);
          loadClockStatus();
          loadWeekly();
        } else {
          showFeedback(clockFeedbackEl, r.data.message || 'Failed.', true);
        }
      })
      .catch(function (err) {
        btnClockOut.disabled = false;
        showFeedback(clockFeedbackEl, err.message || 'Failed.', true);
      });
  }

  // Modals
  var modalIssue = document.getElementById('op-modal-issue');
  var modalUpload = document.getElementById('op-modal-upload');
  var formIssue = document.getElementById('op-form-issue');
  var formUpload = document.getElementById('op-form-upload');

  function openModal(modal) {
    if (modal) {
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeModal(modal) {
    if (modal) {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  document.querySelectorAll('.op-modal-backdrop, .op-modal-close').forEach(function (el) {
    el.addEventListener('click', function () {
      var modal = this.closest('.op-modal');
      if (modal) closeModal(modal);
    });
  });

  if (formIssue) {
    formIssue.addEventListener('submit', function (e) {
      e.preventDefault();
      var title = document.getElementById('op-issue-title');
      var desc = document.getElementById('op-issue-desc');
      var fileInput = document.getElementById('op-issue-file');
      var feedback = document.getElementById('op-issue-feedback');
      if (!title || !title.value.trim()) {
        showFeedback(feedback, 'Title is required.', true);
        return;
      }
      var formData = new FormData();
      formData.append('title', title.value.trim());
      formData.append('description', (desc && desc.value.trim()) || '');
      if (fileInput && fileInput.files && fileInput.files[0]) {
        formData.append('file', fileInput.files[0]);
      }
      showFeedback(feedback, 'Submitting…', false);
      api('/issues', { method: 'POST', body: formData })
        .then(function (r) {
          if (r.data.success) {
            showFeedback(feedback, 'Issue reported.', false);
            formIssue.reset();
            setTimeout(function () {
              closeModal(modalIssue);
              hideFeedback(feedback);
            }, 1500);
          } else {
            showFeedback(feedback, r.data.message || 'Failed.', true);
          }
        })
        .catch(function (err) {
          showFeedback(feedback, err.message || 'Failed.', true);
        });
    });
  }

  if (formUpload) {
    formUpload.addEventListener('submit', function (e) {
      e.preventDefault();
      var fileInput = document.getElementById('op-upload-file');
      var desc = document.getElementById('op-upload-desc');
      var feedback = document.getElementById('op-upload-feedback');
      if (!fileInput || !fileInput.files || !fileInput.files[0]) {
        showFeedback(feedback, 'Please select a file.', true);
        return;
      }
      var formData = new FormData();
      formData.append('file', fileInput.files[0]);
      formData.append('description', (desc && desc.value.trim()) || '');
      showFeedback(feedback, 'Uploading…', false);
      api('/uploads', { method: 'POST', body: formData })
        .then(function (r) {
          if (r.data.success) {
            showFeedback(feedback, 'Upload saved.', false);
            formUpload.reset();
            setTimeout(function () {
              closeModal(modalUpload);
              hideFeedback(feedback);
            }, 1500);
          } else {
            showFeedback(feedback, r.data.message || 'Failed.', true);
          }
        })
        .catch(function (err) {
          showFeedback(feedback, err.message || 'Failed.', true);
        });
    });
  }

  document.getElementById('op-btn-report-issue').addEventListener('click', function () {
    openModal(modalIssue);
    if (formIssue) formIssue.reset();
    hideFeedback(document.getElementById('op-issue-feedback'));
  });

  document.getElementById('op-btn-upload').addEventListener('click', function () {
    openModal(modalUpload);
    if (formUpload) formUpload.reset();
    hideFeedback(document.getElementById('op-upload-feedback'));
  });

  // ----- Log Work (list from API GET /work-log) -----
  var modalWorklog = document.getElementById('op-modal-worklog');
  var formWorklog = document.getElementById('op-form-worklog');
  var worklogListEl = document.getElementById('op-worklog-list');
  var photoListEl = document.getElementById('op-wl-photo-list');
  var photosInputEl = document.getElementById('op-wl-photos');
  var documentInputEl = document.getElementById('op-wl-document');
  var documentNameEl = document.getElementById('op-wl-document-name');
  var MAX_PHOTOS = 5;

  function loadWorklogList() {
    if (!worklogListEl) return;
    worklogListEl.innerHTML = '<p class="op-worklog-empty">Loading…</p>';
    api('/work-log')
      .then(function (r) {
        var entries = (r.data && r.data.success && r.data.entries) ? r.data.entries : [];
        renderWorklogList(entries);
      })
      .catch(function () {
        renderWorklogList([]);
      });
  }

  function getOperativeName() {
    var nameEl = document.getElementById('op-user-name');
    if (nameEl && nameEl.textContent) {
      var t = nameEl.textContent.replace(/^Logged in as\s+/i, '').trim();
      if (t) return t;
    }
    try {
      var raw = localStorage.getItem(USER_KEY);
      if (raw) {
        var u = JSON.parse(raw);
        return (u && (u.name || u.email)) || 'Operative';
      }
    } catch (e) {}
    return 'Operative';
  }

  function renderWorklogList(entries) {
    if (!worklogListEl) return;
    entries = Array.isArray(entries) ? entries : [];
    if (entries.length === 0) {
      worklogListEl.innerHTML = '<p class="op-worklog-empty">No entries yet. Add one to send to your manager.</p>';
      return;
    }
    worklogListEl.innerHTML = entries.slice(0, 20).map(function (e) {
      var loc = [e.project, e.block, e.floor, e.apartment, e.zone].filter(Boolean).join(' / ') || '—';
      var submitted = e.submittedAt ? formatDate(e.submittedAt) : '—';
      return (
        '<div class="op-worklog-item">' +
        '<div class="op-worklog-item-head">' +
        '<span class="op-worklog-item-id">' + escapeHtml(e.workType || 'Work') + ' – ' + escapeHtml(loc) + '</span>' +
        '<span class="op-worklog-item-status">' + escapeHtml(e.status || 'Pending') + '</span>' +
        '</div>' +
        '<div class="op-worklog-item-meta">' + (e.jobId ? escapeHtml(e.jobId) + ' · ' : '') + escapeHtml(submitted) + ' · £' + (e.total != null ? Number(e.total).toFixed(2) : '0') + '</div>' +
        '</div>'
      );
    }).join('');
  }

  function renderPhotoList() {
    if (!photoListEl || !photosInputEl) return;
    var files = photosInputEl.files;
    photoListEl.innerHTML = '';
    for (var i = 0; i < Math.min(files.length, MAX_PHOTOS); i++) {
      var name = files[i].name;
      var div = document.createElement('div');
      div.className = 'op-wl-file-item';
      div.innerHTML = '<span>' + escapeHtml(name) + '</span><button type="button" data-index="' + i + '">Remove</button>';
      photoListEl.appendChild(div);
      div.querySelector('button').addEventListener('click', function () {
        var idx = parseInt(this.getAttribute('data-index'), 10);
        removeFileFromInput(photosInputEl, idx);
        renderPhotoList();
      });
    }
    if (files.length > MAX_PHOTOS && photoListEl) {
      var warn = document.createElement('div');
      warn.className = 'op-wl-file-item';
      warn.style.color = 'var(--op-danger)';
      warn.textContent = 'Only first ' + MAX_PHOTOS + ' photos will be used.';
      photoListEl.appendChild(warn);
    }
  }

  function removeFileFromInput(input, index) {
    if (!input || !input.files) return;
    var dt = new DataTransfer();
    for (var i = 0; i < input.files.length; i++) {
      if (i !== index) dt.items.add(input.files[i]);
    }
    input.files = dt.files;
  }

  function renderDocumentName() {
    if (!documentNameEl || !documentInputEl) return;
    if (documentInputEl.files && documentInputEl.files[0]) {
      documentNameEl.textContent = documentInputEl.files[0].name;
      documentNameEl.classList.remove('d-none');
    } else {
      documentNameEl.textContent = '';
      documentNameEl.classList.add('d-none');
    }
  }

  if (photosInputEl) {
    photosInputEl.addEventListener('change', function () {
      if (this.files && this.files.length > MAX_PHOTOS) {
        var dt = new DataTransfer();
        for (var i = 0; i < MAX_PHOTOS; i++) dt.items.add(this.files[i]);
        this.files = dt.files;
      }
      renderPhotoList();
    });
  }
  if (documentInputEl) {
    documentInputEl.addEventListener('change', renderDocumentName);
  }

  var currentWorklogProject = null;

  function openWorklogModal() {
    document.getElementById('op-wl-worker').value = getOperativeName();
    var projectInput = document.getElementById('op-wl-project');
    if (projectInput) {
      projectInput.value = 'Loading…';
      currentWorklogProject = null;
    }
    ['op-wl-block', 'op-wl-floor', 'op-wl-apartment', 'op-wl-zone', 'op-wl-quantity', 'op-wl-unit-price', 'op-wl-total', 'op-wl-description'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    var wt = document.getElementById('op-wl-work-type');
    if (wt) wt.value = '';
    if (photosInputEl) photosInputEl.value = '';
    if (documentInputEl) documentInputEl.value = '';
    renderPhotoList();
    renderDocumentName();
    if (documentNameEl) documentNameEl.classList.add('d-none');
    hideFeedback(document.getElementById('op-worklog-feedback'));
    openModal(modalWorklog);

    api('/project/current')
      .then(function (r) {
        if (!projectInput) return;
        if (!r.data || !r.data.success) {
          projectInput.value = 'No project assigned';
          currentWorklogProject = null;
          return;
        }
        var proj = r.data.project;
        var name = proj && (proj.name || proj.project_name || '');
        if (proj && (name || proj.id)) {
          projectInput.value = name || 'Project #' + proj.id;
          currentWorklogProject = proj;
        } else {
          projectInput.value = 'No project assigned';
          currentWorklogProject = null;
        }
      })
      .catch(function (err) {
        if (projectInput) {
          projectInput.value = 'No project assigned';
          currentWorklogProject = null;
        }
        console.error('project/current:', err && err.message ? err.message : err);
      });
  }

  var qtyEl = document.getElementById('op-wl-quantity');
  var unitEl = document.getElementById('op-wl-unit-price');
  var totalEl = document.getElementById('op-wl-total');
  if (qtyEl && unitEl && totalEl) {
    function calcTotal() {
      var q = parseFloat(qtyEl.value);
      var u = parseFloat(unitEl.value);
      if (!isNaN(q) && !isNaN(u)) totalEl.value = (q * u).toFixed(2);
    }
    qtyEl.addEventListener('blur', calcTotal);
    unitEl.addEventListener('blur', calcTotal);
  }

  if (formWorklog) {
    formWorklog.addEventListener('submit', function (e) {
      e.preventDefault();
      var feedback = document.getElementById('op-worklog-feedback');
      var projectVal = (document.getElementById('op-wl-project').value || '').trim();
      if (!currentWorklogProject || projectVal === 'No project assigned' || !projectVal) {
        showFeedback(feedback, 'You are not assigned to a project. Contact your manager.', true);
        return;
      }
      var workType = (document.getElementById('op-wl-work-type').value || '').trim();
      if (!workType) {
        showFeedback(feedback, 'Please select work type.', true);
        return;
      }
      var quantity = parseFloat(document.getElementById('op-wl-quantity').value);
      var unitPrice = parseFloat(document.getElementById('op-wl-unit-price').value);
      var total = parseFloat(document.getElementById('op-wl-total').value);
      if (isNaN(quantity)) quantity = null;
      if (isNaN(unitPrice)) unitPrice = null;
      if (isNaN(total) && quantity != null && unitPrice != null) total = quantity * unitPrice;
      else if (isNaN(total)) total = null;

      var submitBtn = formWorklog.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      showFeedback(feedback, 'Uploading and submitting…', false);

      function uploadFile(file) {
        var fd = new FormData();
        fd.append('file', file);
        return api('/work-log/upload', { method: 'POST', body: fd }).then(function (r) {
          if (r.data.success && r.data.path) return r.data.path;
          throw new Error(r.data.message || 'Upload failed');
        });
      }

      var photoPaths = [];
      var docPath = null;
      var photos = photosInputEl && photosInputEl.files ? Array.from(photosInputEl.files).slice(0, MAX_PHOTOS) : [];
      var docFile = documentInputEl && documentInputEl.files && documentInputEl.files[0] ? documentInputEl.files[0] : null;

      Promise.all(photos.map(uploadFile))
        .then(function (paths) {
          photoPaths = paths;
          if (docFile) return uploadFile(docFile);
          return null;
        })
        .then(function (path) {
          if (path) docPath = path;
          return api('/work-log', {
            method: 'POST',
            body: JSON.stringify({
              block: (document.getElementById('op-wl-block').value || '').trim() || null,
              floor: (document.getElementById('op-wl-floor').value || '').trim() || null,
              apartment: (document.getElementById('op-wl-apartment').value || '').trim() || null,
              zone: (document.getElementById('op-wl-zone').value || '').trim() || null,
              workType: workType,
              quantity: quantity,
              unitPrice: unitPrice,
              total: total,
              description: (document.getElementById('op-wl-description').value || '').trim() || null,
              photoUrls: photoPaths,
              invoiceFilePath: docPath,
            }),
          });
        })
        .then(function (r) {
          if (r.data.success) {
            showFeedback(feedback, r.data.message || 'Submitted. Manager will see this in Work Logs.', false);
            loadWorklogList();
            setTimeout(function () {
              closeModal(modalWorklog);
              hideFeedback(feedback);
              if (submitBtn) submitBtn.disabled = false;
            }, 1800);
          } else {
            showFeedback(feedback, r.data.message || 'Submit failed.', true);
            if (submitBtn) submitBtn.disabled = false;
          }
        })
        .catch(function (err) {
          showFeedback(feedback, err.message || 'Submit failed.', true);
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  }

  document.getElementById('op-btn-worklog-new').addEventListener('click', openWorklogModal);
  loadWorklogList();

  if (btnClockIn) btnClockIn.addEventListener('click', clockIn);
  if (btnClockOut) btnClockOut.addEventListener('click', clockOut);

  document.getElementById('op-logout').addEventListener('click', clearSession);

  var deactivatedLogoutBtn = document.getElementById('op-deactivated-logout');
  if (deactivatedLogoutBtn) deactivatedLogoutBtn.addEventListener('click', clearSession);

  // Show logged-in user in header
  function setLoggedInUser(name) {
    var el = document.getElementById('op-user-name');
    if (el) el.textContent = name ? 'Logged in as ' + name : '';
  }

  function loadMe() {
    api('/me')
      .then(function (r) {
        if (r.data.success && r.data.user) {
          var name = r.data.user.name || r.data.user.email || 'Operative';
          setLoggedInUser(name);
          try {
            localStorage.setItem(USER_KEY, JSON.stringify(r.data.user));
          } catch (e) {}
        }
      })
      .catch(function () {
        var stored = null;
        try {
          var raw = localStorage.getItem(USER_KEY);
          if (raw) stored = JSON.parse(raw);
        } catch (e) {}
        if (stored && (stored.name || stored.email)) {
          setLoggedInUser(stored.name || stored.email);
        }
      });
  }

  // Init: redirect if no token, then load all
  if (!getToken()) {
    clearSession();
    return;
  }

  loadMe();
  loadClockStatus();
  loadWeekly();
  loadProject();
  loadTasks();
})();
