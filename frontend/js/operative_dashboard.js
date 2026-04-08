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

  /** Digital documents API (not under /api/operatives). */
  function apiDocuments(path, options) {
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
    return fetch('/api/documents' + path, opts).then(function (res) {
      var contentType = res.headers.get('Content-Type') || '';
      if (contentType.indexOf('application/json') !== -1) {
        return res.json().then(function (data) {
          if (res.status === 401) {
            clearSession();
            return Promise.reject(new Error(data.message || 'Session expired'));
          }
          if (
            res.status === 403 &&
            (data.code === 'account_deactivated' || (data.message && /deactivated|dezactivat/i.test(data.message)))
          ) {
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
          if (res.status === 403 && (data.code === 'account_deactivated' || (data.message && /deactivated|dezactivat/i.test(data.message)))) {
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
  /** @type {{ task: object|null }} */
  var taskModalContext = { task: null };

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

  /** Deadline for task rows (date-only or ISO timestamp). */
  function formatTaskDeadline(val) {
    if (!val) return '—';
    try {
      var d = new Date(val);
      if (isNaN(d.getTime())) return String(val);
      return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
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
          tasksListEl.innerHTML =
            '<p class="op-text-muted" style="margin:0">No tasks assigned yet. When your manager assigns work in Task &amp; Planning (with your name) or legacy tasks, they will appear here.</p>';
          return;
        }
        tasksListEl.innerHTML = r.data.tasks.map(function (t) {
          var title = escapeHtml(t.title || t.name || '—');
          var statusRaw = (t.status || 'pending').toString().replace(/_/g, ' ');
          var statusClass = statusRaw.toLowerCase().replace(/\s/g, '-');
          var src = t.source === 'planning' ? '<span class="op-task-source">Planning</span>' : '';
          var pri =
            t.priority && t.source === 'planning'
              ? '<span class="op-task-priority">' + escapeHtml(t.priority) + '</span>'
              : '';
          var srcVal = escapeHtml(t.source || 'legacy');
          var idVal = escapeHtml(String(t.id != null ? t.id : ''));
          return (
            '<div class="op-task-item op-task-item--clickable" role="button" tabindex="0" data-task-source="' +
            srcVal +
            '" data-task-id="' +
            idVal +
            '">' +
            '<div class="op-task-body">' +
            '<div class="op-task-name">' +
            title +
            ' ' +
            src +
            '</div>' +
            '<div class="op-task-meta">Due: ' +
            escapeHtml(formatTaskDeadline(t.deadline)) +
            (t.pickup_start_date ? ' · Start: ' + escapeHtml(formatDate(t.pickup_start_date)) : '') +
            '</div>' +
            pri +
            '</div>' +
            '<span class="op-task-status ' +
            statusClass +
            '">' +
            escapeHtml(statusRaw) +
            '</span>' +
            '</div>'
          );
        }).join('');
      })
      .catch(function () {
        tasksListEl.innerHTML = '<p class="op-text-muted" style="margin:0">Could not load tasks.</p>';
      });
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  var modalTask = document.getElementById('op-modal-task');
  var opTaskDetailLoading = document.getElementById('op-task-detail-loading');
  var opTaskDetailContent = document.getElementById('op-task-detail-content');
  var opTaskDetailFeedback = document.getElementById('op-task-detail-feedback');

  function showTaskDetailFeedback(message, isError) {
    if (!opTaskDetailFeedback) return;
    opTaskDetailFeedback.textContent = message || '';
    opTaskDetailFeedback.classList.remove('success', 'error', 'd-none');
    opTaskDetailFeedback.classList.add(isError ? 'error' : 'success');
  }

  function hideTaskDetailFeedback() {
    if (opTaskDetailFeedback) opTaskDetailFeedback.classList.add('d-none');
  }

  function renderTaskPhotos(urls) {
    var grid = document.getElementById('op-task-photos-grid');
    var countEl = document.getElementById('op-task-photo-count');
    var wrap = document.getElementById('op-task-photo-upload-wrap');
    var input = document.getElementById('op-task-photo-input');
    var n = urls && urls.length ? urls.length : 0;
    if (countEl) countEl.textContent = '(' + n + ' / 10)';
    if (grid) {
      grid.innerHTML = (urls || []).map(function (url) {
        return (
          '<a href="' +
          escapeHtml(url) +
          '" target="_blank" rel="noopener" class="op-task-photo-thumb"><img src="' +
          escapeHtml(url) +
          '" alt="Confirmation photo"></a>'
        );
      }).join('');
    }
    var t = taskModalContext.task;
    var st = t ? String(t.status || '').toLowerCase() : '';
    var closed = st === 'declined' || st === 'completed';
    if (wrap) {
      if (closed || n >= 10) wrap.classList.add('d-none');
      else wrap.classList.remove('d-none');
    }
    if (input) input.value = '';
  }

  function updateTaskActionButtons(t) {
    var st = String(t.status || '').toLowerCase();
    var closed = st === 'completed' || st === 'declined';
    var actions = document.getElementById('op-task-modal-actions');
    var btnD = document.getElementById('op-task-btn-decline');
    var btnP = document.getElementById('op-task-btn-progress');
    var btnC = document.getElementById('op-task-btn-complete');
    if (!actions) return;
    if (closed) {
      actions.classList.add('d-none');
    } else {
      actions.classList.remove('d-none');
      if (btnD) btnD.disabled = false;
      if (btnP) btnP.disabled = st === 'in_progress';
      if (btnC) btnC.disabled = false;
    }
  }

  function renderTaskDetail(t) {
    taskModalContext.task = t;
    var titleEl = document.getElementById('op-task-modal-title');
    if (titleEl) titleEl.textContent = t.title || 'Task';
    var metaEl = document.getElementById('op-task-detail-meta');
    if (metaEl) {
      var parts = [];
      parts.push(
        'Status: <strong>' +
          escapeHtml(String(t.status || '').replace(/_/g, ' ')) +
          '</strong>'
      );
      parts.push('Due: ' + escapeHtml(formatTaskDeadline(t.deadline)));
      if (t.priority) parts.push('Priority: ' + escapeHtml(String(t.priority)));
      if (t.pickup_start_date) {
        parts.push('Start: ' + escapeHtml(formatDate(t.pickup_start_date)));
      }
      metaEl.innerHTML = parts.join(' · ');
    }
    var descEl = document.getElementById('op-task-detail-desc');
    if (descEl) {
      if (t.description && String(t.description).trim()) {
        descEl.innerHTML =
          '<strong>Description</strong><br>' +
          escapeHtml(String(t.description)).replace(/\n/g, '<br>');
        descEl.classList.remove('d-none');
      } else {
        descEl.innerHTML = '';
        descEl.classList.add('d-none');
      }
    }
    var notesEl = document.getElementById('op-task-detail-notes');
    if (notesEl) {
      if (t.notes && String(t.notes).trim()) {
        notesEl.innerHTML =
          '<strong>Notes</strong><br>' + escapeHtml(String(t.notes)).replace(/\n/g, '<br>');
        notesEl.classList.remove('d-none');
      } else {
        notesEl.innerHTML = '';
        notesEl.classList.add('d-none');
      }
    }
    renderTaskPhotos(t.confirmation_photos || []);
    updateTaskActionButtons(t);
  }

  function reloadTaskDetailInModal() {
    var t = taskModalContext.task;
    if (!t || t.id == null || !t.source) return;
    api('/tasks/' + t.id + '?source=' + encodeURIComponent(t.source))
      .then(function (r) {
        if (r.data.success && r.data.task) {
          renderTaskDetail(r.data.task);
        }
      })
      .catch(function () {});
  }

  function openTaskModal(source, id) {
    if (!modalTask || !opTaskDetailLoading || !opTaskDetailContent) return;
    hideTaskDetailFeedback();
    opTaskDetailLoading.textContent = 'Loading…';
    opTaskDetailLoading.classList.remove('d-none');
    opTaskDetailContent.classList.add('d-none');
    openModal(modalTask);
    api('/tasks/' + id + '?source=' + encodeURIComponent(source))
      .then(function (r) {
        opTaskDetailLoading.classList.add('d-none');
        if (!r.data.success || !r.data.task) {
          opTaskDetailLoading.textContent = (r.data && r.data.message) || 'Could not load task.';
          opTaskDetailLoading.classList.remove('d-none');
          return;
        }
        opTaskDetailContent.classList.remove('d-none');
        renderTaskDetail(r.data.task);
      })
      .catch(function () {
        opTaskDetailLoading.classList.remove('d-none');
        opTaskDetailContent.classList.add('d-none');
        opTaskDetailLoading.textContent = 'Could not load task.';
      });
  }

  function patchTaskAction(action) {
    var t = taskModalContext.task;
    if (!t || t.id == null) return;
    hideTaskDetailFeedback();
    api('/tasks/' + t.id, {
      method: 'PATCH',
      body: JSON.stringify({ source: t.source, action: action }),
    })
      .then(function (r) {
        if (r.data.success) {
          showTaskDetailFeedback('Updated.', false);
          t.status = r.data.status;
          renderTaskDetail(t);
          loadTasks();
        } else {
          showTaskDetailFeedback(r.data.message || 'Update failed.', true);
        }
      })
      .catch(function (err) {
        showTaskDetailFeedback(err.message || 'Update failed.', true);
      });
  }

  function uploadTaskPhotosSequentially(files, index) {
    var t = taskModalContext.task;
    if (!t || index >= files.length) {
      reloadTaskDetailInModal();
      loadTasks();
      return;
    }
    var fd = new FormData();
    fd.append('file', files[index]);
    fd.append('source', t.source);
    var token = getToken();
    if (!token) return;
    fetch('/api/operatives/tasks/' + t.id + '/photos', {
      method: 'POST',
      headers: { 'X-Operative-Token': token },
      body: fd,
      credentials: 'same-origin',
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (out) {
        if (out.ok && out.data.success) {
          taskModalContext.task.confirmation_photos = out.data.confirmation_photos || [];
          renderTaskPhotos(taskModalContext.task.confirmation_photos);
          uploadTaskPhotosSequentially(files, index + 1);
        } else {
          showTaskDetailFeedback((out.data && out.data.message) || 'Upload failed.', true);
          reloadTaskDetailInModal();
        }
      })
      .catch(function () {
        showTaskDetailFeedback('Upload failed.', true);
      });
  }

  if (tasksListEl) {
    tasksListEl.addEventListener('click', function (e) {
      var item = e.target.closest('.op-task-item--clickable');
      if (!item) return;
      var source = item.getAttribute('data-task-source');
      var id = item.getAttribute('data-task-id');
      if (source && id) openTaskModal(source, id);
    });
    tasksListEl.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var item = e.target.closest('.op-task-item--clickable');
      if (!item) return;
      e.preventDefault();
      var source = item.getAttribute('data-task-source');
      var id = item.getAttribute('data-task-id');
      if (source && id) openTaskModal(source, id);
    });
  }

  var opTaskPhotoInput = document.getElementById('op-task-photo-input');
  if (opTaskPhotoInput) {
    opTaskPhotoInput.addEventListener('change', function () {
      var t = taskModalContext.task;
      if (!t || !this.files || !this.files.length) return;
      var existing = (t.confirmation_photos && t.confirmation_photos.length) || 0;
      var remaining = 10 - existing;
      if (remaining <= 0) {
        showTaskDetailFeedback('Maximum 10 photos reached.', true);
        this.value = '';
        return;
      }
      var arr = Array.prototype.slice.call(this.files, 0, remaining);
      hideTaskDetailFeedback();
      uploadTaskPhotosSequentially(arr, 0);
    });
  }

  var btnTaskDecline = document.getElementById('op-task-btn-decline');
  var btnTaskProgress = document.getElementById('op-task-btn-progress');
  var btnTaskComplete = document.getElementById('op-task-btn-complete');
  if (btnTaskDecline) btnTaskDecline.addEventListener('click', function () { patchTaskAction('decline'); });
  if (btnTaskProgress) btnTaskProgress.addEventListener('click', function () { patchTaskAction('in_progress'); });
  if (btnTaskComplete) btnTaskComplete.addEventListener('click', function () { patchTaskAction('complete'); });

  function withGeolocation(callback) {
    if (!navigator.geolocation) {
      callback(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        callback({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      function () {
        // If user denies or it fails, continue without location
        callback(null);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  function clockIn() {
    if (!btnClockIn) return;
    btnClockIn.disabled = true;
    hideFeedback(clockFeedbackEl);
    withGeolocation(function (loc) {
      var body = {};
      if (loc) {
        body.clock_in_latitude = loc.latitude;
        body.clock_in_longitude = loc.longitude;
      }
      api('/work-hours/clock-in', { method: 'POST', body: JSON.stringify(body) })
        .then(function (r) {
          btnClockIn.disabled = false;
          if (r.data.success) {
            var msg = 'Clocked in.';
            if (typeof r.data.on_site === 'boolean') {
              msg = r.data.on_site ? 'You are on site.' : 'You are not on site.';
            }
            if (loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
              msg += ' (Lat: ' + loc.latitude.toFixed(6) + ', Long: ' + loc.longitude.toFixed(6) + ')';
            }
            showFeedback(clockFeedbackEl, msg, !r.data.on_site && typeof r.data.on_site === 'boolean');
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
    });
  }

  function clockOut() {
    if (!btnClockOut) return;
    btnClockOut.disabled = true;
    hideFeedback(clockFeedbackEl);
    withGeolocation(function (loc) {
      var body = {};
      if (loc) {
        body.clock_out_latitude = loc.latitude;
        body.clock_out_longitude = loc.longitude;
      }
      api('/work-hours/clock-out', { method: 'POST', body: JSON.stringify(body) })
        .then(function (r) {
          btnClockOut.disabled = false;
          if (r.data.success) {
            var msg = 'Clocked out.';
            if (typeof r.data.on_site === 'boolean') {
              msg = r.data.on_site
                ? 'Clocked out – you were on site.'
                : 'Clocked out – you were not on site.';
            }
            showFeedback(clockFeedbackEl, msg, false);
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
  var modalPriceWorkBuilder = document.getElementById('op-modal-price-work-builder');
  var formPwbJob = document.getElementById('op-form-pwb-job');
  var formWorklog = document.getElementById('op-form-worklog');
  var worklogListEl = document.getElementById('op-worklog-list');
  var documentInputEl = document.getElementById('op-wl-document');
  var documentNameEl = document.getElementById('op-wl-document-name');
  var generatedPdfLinkEl = document.getElementById('op-wl-generated-pdf-link');
  var invoicePathEl = document.getElementById('op-wl-invoice-path');
  var modalWorkReport = document.getElementById('op-modal-work-report');
  var formWorkReport = document.getElementById('op-form-work-report');

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
      var invoicePath = e.invoiceFilePath || e.invoice_file_path || '';
      var clickableAttr = invoicePath ? ' data-op-invoice-path="' + escapeHtml(invoicePath) + '"' : '';
      return (
        '<div class="op-worklog-item"' + clickableAttr + ' data-op-entry-id="' + escapeHtml(String(e.id != null ? e.id : '')) + '">' +
        '<div class="op-worklog-item-head">' +
        '<span class="op-worklog-item-id">' + escapeHtml(e.workType || 'Work') + ' – ' + escapeHtml(loc) + '</span>' +
        '<span class="op-worklog-item-status">' + escapeHtml(e.status || 'Pending') + '</span>' +
        '</div>' +
        '<div class="op-worklog-item-meta">' +
        (e.jobId ? escapeHtml(e.jobId) + ' · ' : '') +
        escapeHtml(submitted) +
        ' · £' +
        (e.total != null ? Number(e.total).toFixed(2) : '0') +
        '</div>' +
        '<div class="op-worklog-item-actions">' +
        '<button type="button" class="op-btn op-btn-danger-outline op-btn-xs op-worklog-archive" data-entry-id="' +
        escapeHtml(String(e.id != null ? e.id : '')) +
        '">Archive</button>' +
        '</div>' +
        '</div>'
      );
    }).join('');
  }

  if (worklogListEl) {
    worklogListEl.addEventListener('click', function (e) {
      var archiveBtn = e.target.closest('.op-worklog-archive');
      if (archiveBtn) {
        e.preventDefault();
        e.stopPropagation();
        var entryId = archiveBtn.getAttribute('data-entry-id');
        if (!entryId) return;
        archiveBtn.disabled = true;
        api('/work-log/' + encodeURIComponent(entryId) + '/archive', { method: 'POST' })
          .then(function (r) {
            if (r.data && r.data.success) {
              loadWorklogList();
              return;
            }
            archiveBtn.disabled = false;
          })
          .catch(function () {
            archiveBtn.disabled = false;
          });
        return;
      }
      var item = e.target.closest('.op-worklog-item');
      if (!item) return;
      var p = item.getAttribute('data-op-invoice-path');
      if (!p) return;
      window.open(p, '_blank', 'noopener');
    });
  }

  var activeWorklogFlow = 'price';
  var fallbackWorkTypes = ['Plastering', 'Drylining', 'Fixing', 'Painting', 'Electricity', 'Plumbing', 'Carpentry', 'Other'];

  function setWorklogFlow(flow) {
    activeWorklogFlow = flow === 'timesheet' ? 'timesheet' : 'price';
    var priceWrap = document.getElementById('op-wl-price-upload-wrap');
    var tsWrap = document.getElementById('op-wl-timesheet-wrap');
    var btnPrice = document.getElementById('op-btn-flow-price-work');
    var btnTs = document.getElementById('op-btn-flow-time-sheet');
    if (priceWrap) priceWrap.classList.toggle('d-none', activeWorklogFlow !== 'price');
    if (tsWrap) tsWrap.classList.toggle('d-none', activeWorklogFlow !== 'timesheet');
    if (btnPrice) btnPrice.classList.toggle('op-btn-primary', activeWorklogFlow === 'price');
    if (btnTs) btnTs.classList.toggle('op-btn-primary', activeWorklogFlow === 'timesheet');
  }

  function renderWorkTypes(list) {
    var sel = document.getElementById('op-wl-work-type');
    if (!sel) return;
    sel.innerHTML = '<option value="">Select…</option>';
    (list || []).forEach(function (t) {
      var opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      sel.appendChild(opt);
    });
  }

  function loadWorkTypes() {
    return api('/work-types')
      .then(function (r) {
        var arr = (r.data && (r.data.workTypes || r.data.work_types || r.data.items)) || [];
        arr = Array.isArray(arr) ? arr : [];
        var normalized = arr
          .map(function (x) {
            return typeof x === 'string' ? x : x && (x.name || x.label || x.value);
          })
          .filter(Boolean);
        if (!normalized.length) normalized = fallbackWorkTypes;
        renderWorkTypes(normalized);
      })
      .catch(function () {
        renderWorkTypes(fallbackWorkTypes);
      });
  }

  function renderDocumentName() {
    if (!documentNameEl || !documentInputEl) return;
    if (documentInputEl.files && documentInputEl.files[0]) {
      documentNameEl.textContent = documentInputEl.files[0].name;
      documentNameEl.classList.remove('d-none');
      if (generatedPdfLinkEl) {
        generatedPdfLinkEl.classList.add('d-none');
        generatedPdfLinkEl.removeAttribute('href');
      }
    } else {
      documentNameEl.textContent = '';
      documentNameEl.classList.add('d-none');
    }
  }

  if (documentInputEl) {
    documentInputEl.addEventListener('change', function () {
      if (invoicePathEl) invoicePathEl.value = '';
      renderDocumentName();
    });
  }

  function addTimesheetJobItem() {
    var wrap = document.getElementById('op-wr-jobs');
    if (!wrap) return;
    var idx = wrap.querySelectorAll('.op-wr-job-card').length + 1;
    var card = document.createElement('div');
    card.className = 'op-wr-job-card';
    card.__photoFiles = [];
    var MAX_JOB_PHOTOS = 15;
    card.innerHTML =
      '<div class="op-wr-job-title">Job #' + idx + '</div>' +
      '<div class="op-field"><label>Location</label><input type="text" class="op-wr-job-location" placeholder="Block A / Floor 1 / Zone North"></div>' +
      '<div class="op-field"><label>Description</label><textarea rows="2" class="op-wr-job-description" placeholder="Describe this job"></textarea></div>' +
      '<div class="op-field-row">' +
      '<div class="op-field"><label>Duration</label><input type="number" min="0" step="0.25" class="op-wr-job-duration" placeholder="0"></div>' +
      '<div class="op-field"><label>Unit</label><select class="op-wr-job-unit"><option value="hours">Hours</option><option value="days">Days</option></select></div>' +
      '</div>' +
      '<div class="op-field-row">' +
      '<div class="op-field"><label>Job stage</label><select class="op-wr-job-stage"><option value="ongoing">Ongoing</option><option value="complete">Complete</option></select></div>' +
      '<div class="op-field op-wr-progress-wrap"><label>Progress %</label><input type="number" class="op-wr-job-progress" min="0" max="100" step="1" value="0"></div>' +
      '</div>' +
      '<div class="op-field"><label>Photos</label>' +
      '<input type="file" class="op-wr-job-photos-input" accept="image/*" multiple style="display:none">' +
      '<div class="op-wr-job-add-photo-row">' +
      '<button type="button" class="op-btn op-btn-secondary op-btn-sm op-wr-job-add-more">Add more pictures</button>' +
      '<span class="op-wr-job-photo-count">0 / ' +
      String(MAX_JOB_PHOTOS) +
      '</span>' +
      '</div>' +
      '<div class="op-wr-job-photos-preview"></div>' +
      '</div>' +
      '<button type="button" class="op-btn op-btn-secondary op-btn-sm op-wr-remove-job">Remove job</button>';
    wrap.appendChild(card);
    var stageEl = card.querySelector('.op-wr-job-stage');
    var progressWrap = card.querySelector('.op-wr-progress-wrap');
    stageEl.addEventListener('change', function () {
      progressWrap.classList.toggle('d-none', stageEl.value !== 'ongoing');
    });

    var photosInput = card.querySelector('.op-wr-job-photos-input');
    var btnAddMore = card.querySelector('.op-wr-job-add-more');
    var countEl = card.querySelector('.op-wr-job-photo-count');
    var previewEl = card.querySelector('.op-wr-job-photos-preview');

    function renderPhotoPreview() {
      if (!previewEl) return;
      previewEl.innerHTML = '';
      (card.__photoFiles || []).forEach(function (f) {
        var img = document.createElement('img');
        img.src = URL.createObjectURL(f);
        img.alt = f.name;
        previewEl.appendChild(img);
      });
      if (countEl) {
        countEl.textContent = String((card.__photoFiles || []).length) + ' / ' + String(MAX_JOB_PHOTOS);
      }
    }

    if (btnAddMore && photosInput) {
      btnAddMore.addEventListener('click', function () {
        photosInput.click();
      });
      photosInput.addEventListener('change', function () {
        var incoming = Array.from(this.files || []);
        if (incoming.length === 0) return;
        var remaining = MAX_JOB_PHOTOS - (card.__photoFiles || []).length;
        if (remaining <= 0) {
          this.value = '';
          renderPhotoPreview();
          return;
        }
        incoming = incoming.slice(0, remaining);
        card.__photoFiles = (card.__photoFiles || []).concat(incoming);
        this.value = '';
        renderPhotoPreview();
      });
    }

    card.querySelector('.op-wr-remove-job').addEventListener('click', function () {
      card.remove();
    });
    renderPhotoPreview();
  }

  function openWorkReportModal() {
    var jobsWrap = document.getElementById('op-wr-jobs');
    if (jobsWrap) jobsWrap.innerHTML = '';
    addTimesheetJobItem();
    var notesEl = document.getElementById('op-wr-notes');
    if (notesEl) notesEl.value = '';
    var fromEl = document.getElementById('op-wr-period-from');
    var toEl = document.getElementById('op-wr-period-to');
    var today = new Date();
    var d =
      today.getFullYear() +
      '-' +
      String(today.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(today.getDate()).padStart(2, '0');
    if (fromEl) fromEl.value = d;
    if (toEl) toEl.value = d;
    hideFeedback(document.getElementById('op-work-report-feedback'));
    openModal(modalWorkReport);
  }

  function readFileAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = function () {
        reject(new Error('Cannot read image file.'));
      };
      reader.readAsDataURL(file);
    });
  }

  function generateAndUploadWorkReport() {
    var feedback = document.getElementById('op-work-report-feedback');

    var jobCards = Array.from(document.querySelectorAll('#op-wr-jobs .op-wr-job-card'));
    var jobs = jobCards.map(function (card) {
      var durVal = parseFloat(card.querySelector('.op-wr-job-duration').value);
      var durUnit = card.querySelector('.op-wr-job-unit').value || 'hours';
      var totalHours = !isNaN(durVal) ? (durUnit === 'days' ? durVal * 8 : durVal) : 0;
      var photos = card.__photoFiles || [];
      return {
        location: (card.querySelector('.op-wr-job-location').value || '').trim() || null,
        description: (card.querySelector('.op-wr-job-description').value || '').trim() || null,
        duration: !isNaN(durVal) ? durVal : null,
        duration_unit: durUnit,
        totalHours: totalHours,
        stage: card.querySelector('.op-wr-job-stage').value || 'ongoing',
        progress_pct: parseInt(card.querySelector('.op-wr-job-progress').value || '0', 10),
        photoFiles: photos,
        photoPaths: [],
        photoDataUrls: [],
      };
    });

    if (!jobs.length) {
      showFeedback(feedback, 'Add at least one job item.', true);
      return Promise.reject(new Error('No jobs'));
    }

    var beforeTax = parseFloat(document.getElementById('op-wl-total-before-tax').value);
    var afterTax = parseFloat(document.getElementById('op-wl-total-after-tax').value);
    var workType = (document.getElementById('op-wl-work-type').value || '').trim() || null;
    var description = (document.getElementById('op-wl-description').value || '').trim() || null;
    var notes = (document.getElementById('op-wr-notes').value || '').trim() || null;
    var periodFromEl = document.getElementById('op-wr-period-from');
    var periodToEl = document.getElementById('op-wr-period-to');
    var periodFrom = periodFromEl ? (periodFromEl.value || '').trim() : '';
    var periodTo = periodToEl ? (periodToEl.value || '').trim() : '';
    if (!periodFrom || !periodTo) {
      showFeedback(feedback, 'Please select work period dates (from/to).', true);
      return Promise.reject(new Error('Missing period dates'));
    }

    var worker = getOperativeName();
    var projectInput = document.getElementById('op-wl-project');
    var projectName = (currentWorklogProject && (currentWorklogProject.name || currentWorklogProject.project_name)) || (projectInput && projectInput.value) || '—';

    var fileDate = new Date().toISOString().slice(0, 10);
    var pdfFileName = 'work_report_' + fileDate + '.pdf';

    function uploadPdfBlob(blob, filename) {
      var fd = new FormData();
      var file = new File([blob], filename, { type: 'application/pdf' });
      fd.append('file', file);
      return api('/work-log/upload', { method: 'POST', body: fd }).then(function (up) {
        if (!up.data || !up.data.success || !up.data.path) {
          throw new Error((up.data && up.data.message) || 'Report upload failed.');
        }
        if (invoicePathEl) invoicePathEl.value = up.data.path;
        if (documentInputEl) documentInputEl.value = '';
        if (documentNameEl) {
          documentNameEl.textContent = filename + ' (generated)';
          documentNameEl.classList.remove('d-none');
        }
        if (generatedPdfLinkEl) {
          generatedPdfLinkEl.href = up.data.path;
          generatedPdfLinkEl.classList.remove('d-none');
        }
        closeModal(modalWorkReport);
        showFeedback(document.getElementById('op-worklog-feedback'), 'PDF report attached to this entry.', false);
        return up;
      });
    }

    function readAllJobPhotos() {
      return Promise.all(
        jobs.map(function (job) {
          return Promise.all(
            (job.photoFiles || []).map(function (f) {
              return readFileAsDataURL(f);
            })
          ).then(function (dataUrls) {
            job.photoDataUrls = dataUrls || [];
          });
        })
      );
    }

    function uploadWorklogFile(file) {
      var fd = new FormData();
      fd.append('file', file);
      return api('/work-log/upload', { method: 'POST', body: fd }).then(function (r) {
        if (r && r.data && r.data.success && r.data.path) return r.data.path;
        throw new Error((r && r.data && r.data.message) || 'Upload failed');
      });
    }

    function uploadJobPhotosToServer() {
      return Promise.all(
        jobs.map(function (job) {
          var files = job.photoFiles || [];
          return Promise.all(files.map(function (f) { return uploadWorklogFile(f); }))
            .then(function (paths) {
              job.photoPaths = paths || [];
              return job.photoPaths;
            });
        })
      ).then(function () {
        pendingWorklogPhotoUrls = jobs.reduce(function (acc, j) {
          return acc.concat(j.photoPaths || []);
        }, []);
        pendingWorklogTimesheetJobs = jobs.map(function (j) {
          return {
            location: j.location || null,
            description: j.description || null,
            duration: j.duration,
            duration_unit: j.duration_unit,
            stage: j.stage,
            progress_pct: j.progress_pct,
            photos: j.photoPaths || [],
          };
        });
        return pendingWorklogPhotoUrls;
      });
    }

    function imageSizeFit(maxW, maxH, w, h) {
      if (!w || !h) return { w: maxW, h: maxH };
      var ratio = Math.min(maxW / w, maxH / h);
      return { w: w * ratio, h: h * ratio };
    }

    function loadImageDimensions(dataUrl) {
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () {
          resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
        };
        img.onerror = function () {
          reject(new Error('Could not decode image.'));
        };
        img.src = dataUrl;
      });
    }

    function generateTimesheetPdfClientSide() {
      var jsPdfLib = window.jspdf && window.jspdf.jsPDF;
      if (!jsPdfLib) return Promise.reject(new Error('PDF engine is not loaded.'));

      var totalDaysAll = 0;
      var totalHoursAll = 0;
      jobs.forEach(function (j) {
        if (!j) return;
        var d = j.duration;
        var u = (j.duration_unit || 'hours').toLowerCase();
        if (d == null || isNaN(Number(d))) return;
        if (u === 'days') totalDaysAll += Number(d);
        else totalHoursAll += Number(d);
      });

      var fmtNumber = function (n) {
        if (n == null || isNaN(Number(n))) return '0';
        var x = Number(n);
        var isInt = Math.abs(x - Math.round(x)) < 1e-9;
        if (isInt) return String(Math.round(x));
        return (Math.round(x * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
      };
      var pluralize = function (val, unit) {
        var n = Number(val);
        if (isNaN(n)) return unit;
        if (Math.abs(n - 1) < 1e-9) return unit.replace(/s$/i, '');
        return unit;
      };
      var totalTimeText = '—';
      if (totalDaysAll > 0 && totalHoursAll > 0) {
        totalTimeText =
          fmtNumber(totalDaysAll) + ' ' + pluralize(totalDaysAll, 'days') + ' and ' + fmtNumber(totalHoursAll) + ' ' + pluralize(totalHoursAll, 'hours');
      } else if (totalDaysAll > 0) {
        totalTimeText = fmtNumber(totalDaysAll) + ' ' + pluralize(totalDaysAll, 'days');
      } else if (totalHoursAll > 0) {
        totalTimeText = fmtNumber(totalHoursAll) + ' ' + pluralize(totalHoursAll, 'hours');
      }

      var periodFromEl = document.getElementById('op-wr-period-from');
      var periodToEl = document.getElementById('op-wr-period-to');
      var periodFrom = periodFromEl ? (periodFromEl.value || '').trim() : '';
      var periodTo = periodToEl ? (periodToEl.value || '').trim() : '';
      if (!periodTo) periodTo = periodFrom;
      var htmlDateToDMYY = function (d) {
        if (!d) return '';
        var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d).trim());
        if (m) return m[3] + '/' + m[2] + '/' + m[1].slice(-2);
        return String(d);
      };
      var pf = htmlDateToDMYY(periodFrom);
      var pt = htmlDateToDMYY(periodTo);
      var periodRange = pf && pt && pf !== pt ? pf + ' to ' + pt : (pf || pt || '');

      return readAllJobPhotos().then(function () {
        var doc = new jsPdfLib({ orientation: 'p', unit: 'mm', format: 'a4' });
        var pageW = doc.internal.pageSize.getWidth();
        var pageH = doc.internal.pageSize.getHeight();
        var margin = 12;

        var logoDataUrl = '';
        try {
          logoDataUrl = window.PROCONIX_COMPANY_LOGO || localStorage.getItem('proconix_company_logo') || '';
        } catch (e) {}
        if (logoDataUrl && /^data:image\//i.test(logoDataUrl)) {
          try {
            doc.addImage(logoDataUrl, 'PNG', margin, 8, 20, 12);
          } catch (e) {}
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('Proconix Time Sheet Report', margin + 24, 16);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('Generated by Proconix', pageW - margin, 16, { align: 'right' });

        doc.setFontSize(11);
        doc.text('Operative: ' + worker, margin, 26);
        doc.text('Project: ' + projectName, margin, 33);
        doc.text('Work type: ' + (workType || '—'), margin, 40);
        if (periodRange) doc.text('For period of time: ' + periodRange, margin, 47);
        doc.text('Total (before tax): £' + (isNaN(beforeTax) ? '0.00' : beforeTax.toFixed(2)), margin, periodRange ? 54 : 47);
        doc.text('Total time: ' + totalTimeText, margin, periodRange ? 61 : 54);
        return Promise.all(
          jobs.map(function (j) {
            return Promise.all((j.photoDataUrls || []).map(loadImageDimensions))
              .then(function (dims) {
                j.photoDims = dims || [];
              })
              .catch(function () {
                j.photoDims = [];
              });
          })
        ).then(function () {
          // Page 1: summary, Page 2+: jobs + photos grouped per job (no mixing)
          doc.addPage();
          var y = 20;
          doc.setFont('helvetica', 'bold');
          doc.text('Job list', margin, y);
          y += 5;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);

          var slotW = (pageW - margin * 2 - 6) / 2;
          var slotH = (pageH - margin * 2 - 36 - 6) / 2;
          var slotGap = 6;
          var photoGapY = 8;

          var drawJobPhotos = function (job, jobIdx, startY) {
            var photos = job.photoDataUrls || [];
            var dims = job.photoDims || [];
            if (!photos.length) return startY;

            var photoTop = startY + 2;
            if (photoTop + 2 * slotH + slotGap > pageH - 12) {
              doc.addPage();
              photoTop = 20;
            }

            for (var pi = 0; pi < photos.length; pi++) {
              if (pi > 0 && pi % 4 === 0) {
                doc.addPage();
                photoTop = 20;
              }
              var idxInPage = pi % 4; // 0..3
              var col = idxInPage % 2; // 0..1
              var row = Math.floor(idxInPage / 2); // 0..1
              var x = margin + col * (slotW + slotGap);
              var yy = photoTop + row * (slotH + slotGap);
              var d = dims[pi] || null;
              var fit = imageSizeFit(slotW, slotH, d && d.width, d && d.height);
              var dx = x + (slotW - fit.w) / 2;
              var dy = yy + (slotH - fit.h) / 2;
              var fmt = /data:image\/png/i.test(photos[pi]) ? 'PNG' : 'JPEG';
              doc.rect(x, yy, slotW, slotH);
              try {
                doc.addImage(photos[pi], fmt, dx, dy, fit.w, fit.h);
              } catch (e) {}
            }

            // Set y after the last placed photo on the last page
            var lastIdx = (photos.length - 1) % 4;
            var lastRow = Math.floor(lastIdx / 2);
            var endY = photoTop + lastRow * (slotH + slotGap) + slotH + photoGapY;
            return endY;
          };

          jobs.forEach(function (j, idx) {
            if (y > pageH - 40) {
              doc.addPage();
              y = 20;
            }
            var stageText = j.stage === 'ongoing' ? 'Ongoing (' + j.progress_pct + '%)' : 'Complete';
            var line =
              (idx + 1) +
              '. ' +
              (j.location || '—') +
              ' · ' +
              (j.duration != null ? String(j.duration) + ' ' + (j.duration_unit || 'hours') : '—') +
              ' · ' +
              stageText;
            doc.text(line, margin, y);
            y += 6;

            if (j.description) {
              var parts = doc.splitTextToSize(j.description, pageW - margin * 2);
              doc.text(parts, margin, y);
              y += parts.length * 5 + 2;
            }

            y += 2;
            y = drawJobPhotos(j, idx, y);
            y += 2;
          });

          if (notes) {
            // Notes after jobs (separate section)
            if (y > pageH - 40) {
              doc.addPage();
              y = 20;
            }
            doc.setFont('helvetica', 'bold');
            doc.text('Extra notes', margin, y + 2);
            y += 7;
            doc.setFont('helvetica', 'normal');
            var nLines = doc.splitTextToSize(notes, pageW - margin * 2);
            doc.text(nLines, margin, y);
            y += nLines.length * 5 + 2;
          }

          // Footer on all pages
          var pages = doc.getNumberOfPages();
          for (var pn = 1; pn <= pages; pn++) {
            doc.setPage(pn);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.text('Generated by Proconix Work Reports', pageW / 2, pageH - 12, { align: 'center' });
            doc.text('WEB : proconix.uk', pageW / 2, pageH - 6, { align: 'center' });
          }

          return doc.output('blob');
        });
      });
    }

    showFeedback(feedback, 'Preparing Time Sheet report…', false);

    // Upload photos to server first, then pass server paths to backend.
    return uploadJobPhotosToServer().then(function () {
      // Prefer backend endpoint; otherwise fallback to client-side generation.
      var payloadJobsMeta = jobs.map(function (j) {
        return {
          location: j.location,
          description: j.description,
          duration: j.duration,
          duration_unit: j.duration_unit,
          totalHours: j.totalHours,
          stage: j.stage,
          progress_pct: j.progress_pct,
          photos: j.photoPaths || [],
        };
      });

      var payloadMeta = {
        jobs: payloadJobsMeta,
        total_before_tax: isNaN(beforeTax) ? 0 : beforeTax,
        total_after_tax: isNaN(afterTax) ? 0 : afterTax,
        work_type: workType,
        notes: notes,
        description: description,
        period_from: periodFrom,
        period_to: periodTo,
        workerName: worker,
        project: projectName,
        logoDataUrl:
          (typeof window !== 'undefined' &&
            (window.PROCONIX_COMPANY_LOGO || localStorage.getItem('proconix_company_logo'))) ||
          null,
      };

      return api('/timesheet/generate', { method: 'POST', body: JSON.stringify(payloadMeta) })
        .then(function (r) {
          var pdfPath = r && r.data && (r.data.pdfPath || r.data.pdfUrl || r.data.path);
          if (r && r.data && r.data.success && pdfPath) {
            if (invoicePathEl) invoicePathEl.value = pdfPath;
            if (documentInputEl) documentInputEl.value = '';
            if (documentNameEl) {
              documentNameEl.textContent = pdfFileName + ' (generated)';
              documentNameEl.classList.remove('d-none');
            }
            if (generatedPdfLinkEl) {
              generatedPdfLinkEl.href = pdfPath;
              generatedPdfLinkEl.classList.remove('d-none');
            }
            closeModal(modalWorkReport);
            showFeedback(document.getElementById('op-worklog-feedback'), 'Time Sheet report attached to this entry.', false);
            return null;
          }
          // Backend returned an error payload; fallback to frontend generation.
          return generateTimesheetPdfClientSide().then(function (blob) {
            return uploadPdfBlob(blob, pdfFileName);
          });
        })
        .catch(function () {
          // Network/backend error (including "endpoint not found")
          return generateTimesheetPdfClientSide().then(function (blob) {
            return uploadPdfBlob(blob, pdfFileName);
          });
        });
    });
  }

  var currentWorklogProject = null;
  var pendingWorklogPhotoUrls = [];
  var pendingWorklogTimesheetJobs = [];
  /** @type {Array<{ qaJobId: string, jobNumber: string, jobTitle: string, stepQuantities: object }>} */
  var pendingPriceWorkEntries = [];
  /** @type {Array<object>} */
  var pwbQueue = [];
  /** @type {object|null} */
  var pwbCurrentJob = null;

  function hasPositiveStepRate(v) {
    var n = parseFloat(v);
    return v != null && String(v).trim() !== '' && n === n && n > 0;
  }

  /** Human-readable step titles for manager Work Logs (matches op-pwb-step-title; template name only if multiple templates). */
  function buildStepLabelsForPwbJob(job) {
    var labels = {};
    if (!job || !Array.isArray(job.templates)) return labels;
    var multiTpl = job.templates.length > 1;
    job.templates.forEach(function (tpl) {
      var tname = (tpl && tpl.name && String(tpl.name).trim()) || '';
      var steps = tpl && Array.isArray(tpl.steps) ? tpl.steps : [];
      steps.forEach(function (s, idx) {
        var key = s.key || String(tpl.id) + ':' + String(s.stepId != null ? s.stepId : s.dbStepId);
        var desc = (s.description && String(s.description).trim()) || '';
        var stepPart = 'Step ' + (idx + 1) + (desc ? ' — ' + desc : '');
        labels[key] = multiTpl && tname ? tname + ' — ' + stepPart : stepPart;
      });
    });
    return labels;
  }

  function openPriceWorkBuilderModal() {
    setWorklogFlow('price');
    var loadingEl = document.getElementById('op-pwb-loading');
    var emptyEl = document.getElementById('op-pwb-empty');
    var formEl = document.getElementById('op-form-pwb-job');
    var stepsEl = document.getElementById('op-pwb-steps');
    var feedback = document.getElementById('op-pwb-feedback');
    if (!modalPriceWorkBuilder) return;
    hideFeedback(feedback);
    pwbCurrentJob = null;
    if (stepsEl) stepsEl.innerHTML = '';
    if (emptyEl) {
      emptyEl.classList.add('d-none');
      emptyEl.textContent = '';
    }
    if (loadingEl) loadingEl.classList.remove('d-none');
    if (formEl) formEl.classList.add('d-none');
    openModal(modalPriceWorkBuilder);

    api('/qa/assigned-jobs')
      .then(function (r) {
        if (loadingEl) loadingEl.classList.add('d-none');
        var all = r.data && r.data.success && Array.isArray(r.data.jobs) ? r.data.jobs : [];
        pwbQueue = all.filter(function (j) {
          return !pendingPriceWorkEntries.some(function (e) {
            return String(e.qaJobId) === String(j.id);
          });
        });
        if (!pwbQueue.length) {
          if (emptyEl) {
            emptyEl.classList.remove('d-none');
            emptyEl.innerHTML =
              all.length === 0
                ? '<p class="op-text-muted">No QA jobs are assigned to you on this project.</p>'
                : '<p class="op-text-muted">You have already entered quantities for all assigned QA jobs in this work log. Submit when ready, or start a new work log to enter again.</p>';
          }
          return;
        }
        renderPwbCurrentJob();
      })
      .catch(function () {
        if (loadingEl) loadingEl.classList.add('d-none');
        if (emptyEl) {
          emptyEl.classList.remove('d-none');
          emptyEl.innerHTML = '<p class="op-text-muted">Could not load QA jobs. Try again.</p>';
        }
      });
  }

  function renderPwbCurrentJob() {
    var job = pwbQueue[0];
    var labelEl = document.getElementById('op-pwb-job-label');
    var stepsEl = document.getElementById('op-pwb-steps');
    var formEl = document.getElementById('op-form-pwb-job');
    var submitBtn = document.getElementById('op-pwb-submit');
    var emptyEl = document.getElementById('op-pwb-empty');
    if (!job || !stepsEl || !formEl) return;
    if (emptyEl) emptyEl.classList.add('d-none');
    pwbCurrentJob = job;
    if (labelEl) {
      var jn = job.jobNumber != null && String(job.jobNumber).trim() !== '' ? String(job.jobNumber) : job.id;
      var jt = (job.jobTitle && String(job.jobTitle).trim()) || 'QA job';
      labelEl.textContent = 'Job ' + jn + ' — ' + jt;
    }
    var parts = [];
    var templates = Array.isArray(job.templates) ? job.templates : [];
    templates.forEach(function (tpl) {
      var tname = (tpl && tpl.name && String(tpl.name).trim()) || 'Template';
      parts.push('<div class="op-pwb-template-title">' + escapeHtml(tname) + '</div>');
      var steps = tpl && Array.isArray(tpl.steps) ? tpl.steps : [];
      steps.forEach(function (s, idx) {
        var hasM2 = hasPositiveStepRate(s.pricePerM2);
        var hasLin = hasPositiveStepRate(s.pricePerLinear);
        var hasUn = hasPositiveStepRate(s.pricePerUnit);
        if (!hasM2 && !hasLin && !hasUn) return;
        var desc = (s.description && String(s.description).trim()) || '';
        var title = 'Step ' + (idx + 1) + (desc ? ' — ' + desc : '');
        var key = s.key || String(tpl.id) + ':' + String(s.stepId != null ? s.stepId : s.dbStepId);
        parts.push('<div class="op-pwb-step" data-pwb-step-key="' + escapeHtml(key) + '">');
        parts.push('<div class="op-pwb-step-title">' + escapeHtml(title) + '</div>');
        if (hasM2) {
          parts.push(
            '<div class="op-field"><label>m²</label><input type="number" min="0" step="0.01" class="op-pwb-inp" data-pwb-key="' +
              escapeHtml(key) +
              '" data-pwb-dim="m2" placeholder="0"></div>'
          );
        }
        if (hasLin) {
          parts.push(
            '<div class="op-field"><label>Linear (m)</label><input type="number" min="0" step="0.01" class="op-pwb-inp" data-pwb-key="' +
              escapeHtml(key) +
              '" data-pwb-dim="linear" placeholder="0"></div>'
          );
        }
        if (hasUn) {
          parts.push(
            '<div class="op-field"><label>Units</label><input type="number" min="0" step="1" class="op-pwb-inp" data-pwb-key="' +
              escapeHtml(key) +
              '" data-pwb-dim="units" placeholder="0"></div>'
          );
        }
        parts.push('</div>');
      });
    });
    stepsEl.innerHTML = parts.length ? parts.join('') : '<p class="op-text-muted">No billable steps on this job’s templates.</p>';
    if (submitBtn) {
      submitBtn.textContent = pwbQueue.length > 1 ? 'Continue' : 'Done';
    }
    formEl.classList.remove('d-none');
  }

  function collectPwbStepQuantities() {
    var out = {};
    document.querySelectorAll('#op-pwb-steps .op-pwb-inp').forEach(function (el) {
      var key = el.getAttribute('data-pwb-key');
      var dim = el.getAttribute('data-pwb-dim');
      if (!key || !dim) return;
      var v = (el.value || '').trim();
      if (!out[key]) out[key] = { m2: '', linear: '', units: '' };
      out[key][dim] = v;
    });
    return out;
  }

  if (formPwbJob) {
    formPwbJob.addEventListener('submit', function (e) {
      e.preventDefault();
      var feedback = document.getElementById('op-pwb-feedback');
      hideFeedback(feedback);
      if (!pwbCurrentJob) return;
      var stepQuantities = collectPwbStepQuantities();
      pendingPriceWorkEntries.push({
        qaJobId: String(pwbCurrentJob.id),
        jobNumber: pwbCurrentJob.jobNumber != null ? String(pwbCurrentJob.jobNumber) : '',
        jobTitle: (pwbCurrentJob.jobTitle && String(pwbCurrentJob.jobTitle).trim()) || '',
        stepQuantities: stepQuantities,
        stepLabels: buildStepLabelsForPwbJob(pwbCurrentJob),
      });
      pwbQueue.shift();
      pwbCurrentJob = null;
      if (pwbQueue.length) {
        renderPwbCurrentJob();
      } else {
        closeModal(modalPriceWorkBuilder);
        var wf = document.getElementById('op-worklog-feedback');
        if (wf && modalWorklog && modalWorklog.classList.contains('is-open')) {
          showFeedback(wf, 'QA price work saved for this entry. Complete totals and submit the work log.', false);
        }
      }
    });
  }

  function openWorklogModal() {
    document.getElementById('op-wl-worker').value = getOperativeName();
    var projectInput = document.getElementById('op-wl-project');
    if (projectInput) {
      projectInput.value = 'Loading…';
      currentWorklogProject = null;
    }
    ['op-wl-total-before-tax', 'op-wl-total-after-tax', 'op-wl-description'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    var wt = document.getElementById('op-wl-work-type');
    if (wt) wt.value = '';
    if (documentInputEl) documentInputEl.value = '';
    if (invoicePathEl) invoicePathEl.value = '';
    pendingWorklogPhotoUrls = [];
    pendingWorklogTimesheetJobs = [];
    pendingPriceWorkEntries = [];
    pwbQueue = [];
    pwbCurrentJob = null;
    if (generatedPdfLinkEl) {
      generatedPdfLinkEl.classList.add('d-none');
      generatedPdfLinkEl.removeAttribute('href');
    }
    setWorklogFlow('price');
    loadWorkTypes();
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

  var totalBeforeEl = document.getElementById('op-wl-total-before-tax');
  var totalAfterEl = document.getElementById('op-wl-total-after-tax');
  if (totalBeforeEl && totalAfterEl) {
    totalBeforeEl.addEventListener('input', function () {
      var before = parseFloat(totalBeforeEl.value);
      if (isNaN(before)) {
        totalAfterEl.value = '';
        return;
      }
      totalAfterEl.value = (before * 0.8).toFixed(2);
    });
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
      var description = (document.getElementById('op-wl-description').value || '').trim();
      if (!description) {
        showFeedback(feedback, 'Description is required.', true);
        return;
      }
      var totalBeforeTax = parseFloat(document.getElementById('op-wl-total-before-tax').value);
      var totalAfterTax = parseFloat(document.getElementById('op-wl-total-after-tax').value);
      if (isNaN(totalBeforeTax)) totalBeforeTax = null;
      if (isNaN(totalAfterTax)) totalAfterTax = null;

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

      var docPath = null;
      var docFile = documentInputEl && documentInputEl.files && documentInputEl.files[0] ? documentInputEl.files[0] : null;

      Promise.resolve()
        .then(function () {
          if (invoicePathEl && invoicePathEl.value) return invoicePathEl.value;
          if (docFile) return uploadFile(docFile);
          return null;
        })
        .then(function (path) {
          if (path) docPath = path;
          return api('/work-log', {
            method: 'POST',
            body: JSON.stringify({
              block: null,
              floor: null,
              apartment: null,
              zone: null,
              workType: workType,
              quantity: null,
              unitPrice: null,
              total: totalBeforeTax,
              totalBeforeTax: totalBeforeTax,
              totalAfterTax: totalAfterTax,
              description: description,
              photoUrls: pendingWorklogPhotoUrls || [],
              timesheetJobs: pendingWorklogTimesheetJobs || [],
              priceWorkJobs: pendingPriceWorkEntries || [],
              invoiceFilePath: docPath,
            }),
          });
        })
        .then(function (r) {
          if (r.data.success) {
            showFeedback(feedback, r.data.message || 'Submitted. Manager will see this in Work Logs.', false);
            loadWorklogList();
            pendingWorklogPhotoUrls = [];
            pendingWorklogTimesheetJobs = [];
            pendingPriceWorkEntries = [];
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

  var btnCreateWorkReport = document.getElementById('op-btn-create-work-report');
  if (btnCreateWorkReport) {
    btnCreateWorkReport.addEventListener('click', openWorkReportModal);
  }
  var btnAddJob = document.getElementById('op-wr-add-job');
  if (btnAddJob) {
    btnAddJob.addEventListener('click', function () {
      addTimesheetJobItem();
    });
  }
  var btnFlowPrice = document.getElementById('op-btn-flow-price-work');
  var btnFlowTimesheet = document.getElementById('op-btn-flow-time-sheet');
  if (btnFlowPrice) {
    btnFlowPrice.addEventListener('click', function () {
      openPriceWorkBuilderModal();
    });
  }
  if (btnFlowTimesheet) {
    btnFlowTimesheet.addEventListener('click', function () {
      setWorklogFlow('timesheet');
    });
  }
  if (formWorkReport) {
    formWorkReport.addEventListener('submit', function (e) {
      e.preventDefault();
      generateAndUploadWorkReport().catch(function () {});
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
    return api('/me')
      .then(function (r) {
        if (r.data && r.data.success && r.data.user && String(r.data.user.role || '') === 'Supervisor') {
          window.location.replace('/supervisor_dashboard.html');
          return Promise.reject(new Error('supervisor_redirect'));
        }
        if (r.data.success && r.data.user) {
          var name = r.data.user.name || r.data.user.email || 'Operative';
          setLoggedInUser(name);
          try {
            localStorage.setItem(USER_KEY, JSON.stringify(r.data.user));
          } catch (e) {}
        }
      })
      .catch(function (err) {
        if (err && err.message === 'supervisor_redirect') return Promise.reject(err);
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

  function loadDocumentsInbox() {
    var el = document.getElementById('op-docs-list');
    if (!el) return;
    apiDocuments('/operative/inbox', { method: 'GET' })
      .then(function (r) {
        if (r.status === 401) return;
        if (!r.data || !r.data.success) {
          el.textContent = 'Could not load documents.';
          return;
        }
        var docs = r.data.documents || [];
        if (docs.length === 0) {
          el.innerHTML = '<p class="op-tasks-hint">No documents waiting for signature.</p>';
          return;
        }
        el.innerHTML = docs
          .map(function (d) {
            var dl = d.assignment_deadline
              ? formatDate(d.assignment_deadline) + ' · ' + formatTime(d.assignment_deadline)
              : '—';
            var urgent =
              d.assignment_deadline && new Date(d.assignment_deadline).getTime() < Date.now() + 86400000;
            return (
              '<a class="op-doc-row" href="operative_document_sign.html?id=' +
              d.id +
              '">' +
              '<div class="op-doc-title">' +
              escapeHtml(d.title || 'Document') +
              '</div>' +
              '<div class="op-doc-meta">Deadline: ' +
              escapeHtml(dl) +
              (urgent ? ' · <span style="color:#feb2b2">Due soon</span>' : '') +
              '</div></a>'
            );
          })
          .join('');
      })
      .catch(function () {
        if (el) el.textContent = 'Could not load documents.';
      });
  }

  loadMe()
    .then(function () {
      loadClockStatus();
      loadWeekly();
      loadProject();
      loadTasks();
      loadDocumentsInbox();
    })
    .catch(function (err) {
      if (err && err.message === 'supervisor_redirect') return;
      loadClockStatus();
      loadWeekly();
      loadProject();
      loadTasks();
      loadDocumentsInbox();
    });
})();
