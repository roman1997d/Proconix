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
          chatInitProjectContext(null);
          return;
        }
        var p = r.data.project;
        var pName = p.name || p.project_name || '—';
        projectContentEl.innerHTML =
          '<div class="op-project-name">' + escapeHtml(pName) + '</div>' +
          (p.address ? '<div>' + escapeHtml(p.address) + '</div>' : '') +
          (p.start_date ? '<div class="op-project-meta">Start: ' + escapeHtml(p.start_date) + '</div>' : '') +
          (p.description ? '<div class="op-project-meta">' + escapeHtml(p.description) + '</div>' : '');
        chatInitProjectContext(p);
      })
      .catch(function () {
        projectContentEl.textContent = '—';
        chatInitProjectContext(null);
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

  // ----- Site Chat (frontend realtime with API + fallback store) -----
  var chatOpenBtn = document.getElementById('op-chat-open');
  var chatBackBtn = document.getElementById('op-chat-back');
  var chatNotifOpenBtn = document.getElementById('op-chat-notif-open');
  var chatHeaderNotifBtn = document.getElementById('op-chat-header-notif');
  var chatFilterRequestBtn = document.getElementById('op-chat-filter-request');
  var chatUnreadBadge = document.getElementById('op-chat-unread-badge');
  var chatHeaderUnread = document.getElementById('op-chat-header-unread');
  var chatProjectNameEl = document.getElementById('op-chat-project-name');
  var chatFeedEl = document.getElementById('op-chat-feed');
  var chatForm = document.getElementById('op-chat-form');
  var chatInput = document.getElementById('op-chat-input');
  var chatFileInput = document.getElementById('op-chat-file');
  var chatRequestBtn = document.getElementById('op-chat-new-request');
  var chatToastEl = document.getElementById('op-chat-toast');
  var chatNotifListEl = document.getElementById('op-chat-notif-list');
  var modalSiteChat = document.getElementById('op-modal-site-chat');
  var modalChatRequest = document.getElementById('op-modal-chat-request');
  var modalChatNotifications = document.getElementById('op-modal-chat-notifications');
  var chatRequestForm = document.getElementById('op-chat-request-form');
  var chatRequestSummary = document.getElementById('op-chat-request-summary');
  var chatRequestDetails = document.getElementById('op-chat-request-details');
  var chatRequestUrgency = document.getElementById('op-chat-request-urgency');
  var chatRequestLocation = document.getElementById('op-chat-request-location');

  var chatState = {
    projectId: null,
    projectName: 'Project room',
    messages: [],
    notifications: [],
    unreadCount: 0,
    pollTimer: null,
    lastSeenAt: 0,
    requestOnly: false,
  };

  function chatKeyMessages() {
    return 'op_site_chat_messages_' + String(chatState.projectId || 'none');
  }

  function chatKeyNotifications() {
    return 'op_site_chat_notifications_' + String(chatState.projectId || 'none');
  }

  function chatApi(path, options) {
    var token = getToken();
    if (!token) return Promise.reject(new Error('No session'));
    var opts = options || {};
    var headers = opts.headers || {};
    headers['X-Operative-Token'] = token;
    if (opts.body && !(opts.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    opts.headers = headers;
    opts.credentials = 'same-origin';
    return fetch('/api/site-chat' + path, opts).then(function (res) {
      var ct = res.headers.get('Content-Type') || '';
      if (ct.indexOf('application/json') !== -1) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      }
      return res.text().then(function (t) {
        return { ok: res.ok, status: res.status, data: { message: t } };
      });
    });
  }

  function chatToast(msg) {
    if (!chatToastEl) return;
    chatToastEl.textContent = msg || '';
    chatToastEl.classList.add('is-visible');
    setTimeout(function () {
      if (chatToastEl) chatToastEl.classList.remove('is-visible');
    }, 2500);
  }

  function chatFormatTime(iso) {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '—';
    }
  }

  function chatEsc(s) {
    return escapeHtml(s == null ? '' : String(s));
  }

  function chatRenderUnread() {
    var c = chatState.unreadCount || 0;
    if (chatUnreadBadge) {
      chatUnreadBadge.textContent = c > 99 ? '99+' : String(c);
      chatUnreadBadge.classList.toggle('d-none', c <= 0);
    }
    if (chatHeaderUnread) {
      chatHeaderUnread.textContent = c > 99 ? '99+' : String(c);
      chatHeaderUnread.classList.toggle('d-none', c <= 0);
    }
  }

  function chatRenderMessages() {
    if (!chatFeedEl) return;
    var visible = chatState.requestOnly
      ? chatState.messages.filter(function (m) { return m.type === 'material_request'; })
      : chatState.messages;
    if (!visible.length) {
      chatFeedEl.innerHTML = '<p class="op-text-muted" style="margin:0">No messages yet. Start the conversation.</p>';
      return;
    }
    chatFeedEl.innerHTML = visible
      .map(function (m) {
        var mine = !!m.is_mine;
        var baseCls = 'op-chat-msg' + (mine ? ' op-chat-msg--mine' : '') + (m.type === 'material_request' ? ' op-chat-msg--request' : '');
        var body = '';
        if (m.type === 'material_request') {
          body =
            '<div class="op-chat-msg-text"><strong>Material Request</strong><br>' +
            chatEsc(m.summary || '') +
            '</div>' +
            '<span class="op-chat-request-status">' +
            chatEsc(m.status || 'Pending') +
            '</span>' +
            '<div style="margin-top:8px;"><button type="button" class="op-btn op-btn-secondary op-btn-sm" data-chat-request-id="' +
            chatEsc(String(m.id || '')) +
            '">View Request Details</button></div>';
        } else if (m.type === 'file') {
          body = '<div class="op-chat-msg-text"><i class="bi bi-paperclip"></i> ' + chatEsc(m.file_name || 'Attachment') + '</div>';
        } else {
          body = '<div class="op-chat-msg-text">' + chatEsc(m.text || '') + '</div>';
        }
        return (
          '<div class="' +
          baseCls +
          '">' +
          '<div class="op-chat-msg-user">' +
          chatEsc(m.user_name || 'User') +
          '</div>' +
          body +
          '<div class="op-chat-msg-time">' +
          chatFormatTime(m.created_at) +
          '</div>' +
          '</div>'
        );
      })
      .join('');
    chatFeedEl.scrollTop = chatFeedEl.scrollHeight;
    chatFeedEl.querySelectorAll('[data-chat-request-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-chat-request-id');
        var msg = chatState.messages.find(function (x) { return String(x.id) === String(id); });
        if (!msg) return;
        openModal(modalChatRequest);
        if (chatRequestSummary) chatRequestSummary.value = msg.summary || '';
        if (chatRequestDetails) chatRequestDetails.value = msg.details || '';
        if (chatRequestUrgency) chatRequestUrgency.value = msg.urgency || 'Normal';
        if (chatRequestLocation) chatRequestLocation.value = msg.location || '';
      });
    });
  }

  function chatRenderNotifications() {
    if (!chatNotifListEl) return;
    var unreadOnly = (chatState.notifications || []).filter(function (n) { return !n.read; });
    if (!unreadOnly.length) {
      chatNotifListEl.innerHTML = '<p class="op-text-muted" style="margin:0">No notifications.</p>';
      return;
    }
    chatNotifListEl.innerHTML = unreadOnly
      .map(function (n) {
        return (
          '<button type="button" class="op-dg-series-card" data-chat-jump-id="' +
          chatEsc(String(n.message_id || '')) +
          '" style="width:100%;text-align:left;">' +
          '<div class="op-dg-series-title">' +
          chatEsc(n.title || 'Notification') +
          '</div>' +
          '<div class="op-dg-series-meta">' +
          chatEsc(n.body || '') +
          ' · ' +
          chatFormatTime(n.created_at) +
          (n.read ? ' · Read' : ' · Unread') +
          '</div></button>'
        );
      })
      .join('');
    chatNotifListEl.querySelectorAll('[data-chat-jump-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        closeModal(modalChatNotifications);
        openModal(modalSiteChat);
      });
    });
  }

  function chatSaveFallback() {
    try {
      localStorage.setItem(chatKeyMessages(), JSON.stringify(chatState.messages || []));
      localStorage.setItem(chatKeyNotifications(), JSON.stringify(chatState.notifications || []));
    } catch (_) {}
  }

  function chatLoadFallback() {
    try {
      var m = JSON.parse(localStorage.getItem(chatKeyMessages()) || '[]');
      var n = JSON.parse(localStorage.getItem(chatKeyNotifications()) || '[]');
      chatState.messages = Array.isArray(m) ? m : [];
      chatState.notifications = Array.isArray(n) ? n : [];
    } catch (_) {
      chatState.messages = [];
      chatState.notifications = [];
    }
    chatState.unreadCount = chatState.notifications.filter(function (x) { return !x.read; }).length;
  }

  function chatCreateNotification(kind, title, body, messageId) {
    var notif = {
      id: Date.now() + '_' + Math.random().toString(16).slice(2),
      kind: kind || 'system',
      title: title || 'Notification',
      body: body || '',
      message_id: messageId || null,
      read: false,
      created_at: new Date().toISOString(),
    };
    chatState.notifications.unshift(notif);
    chatState.unreadCount += 1;
    chatRenderUnread();
    chatRenderNotifications();
    chatSaveFallback();
    chatToast(notif.title);
  }

  function chatMarkAllRead() {
    chatApi('/notifications/read-all', {
      method: 'PATCH',
      body: JSON.stringify({ project_id: chatState.projectId }),
    })
      .then(function () {
        chatState.notifications = [];
        chatState.unreadCount = 0;
        chatRenderUnread();
        chatRenderNotifications();
        chatSaveFallback();
      })
      .catch(function () {
        chatState.notifications.forEach(function (n) { n.read = true; });
        chatState.notifications = chatState.notifications.filter(function (n) { return !n.read; });
        chatState.unreadCount = 0;
        chatRenderUnread();
        chatRenderNotifications();
        chatSaveFallback();
      });
  }

  function chatAddLocalMessage(msg) {
    chatState.messages.push(msg);
    chatSaveFallback();
    chatRenderMessages();
  }

  function chatSendText(text) {
    var body = String(text || '').trim();
    if (!body) return;
    chatApi('/messages', {
      method: 'POST',
      body: JSON.stringify({
        project_id: chatState.projectId,
        type: 'text',
        text: body,
      }),
    })
      .then(function (out) {
        if (!out.ok || !out.data.success) throw new Error('send');
        chatReloadMessages();
      })
      .catch(function () {
        var msg = {
          id: Date.now(),
          type: 'text',
          text: body,
          user_name: 'You',
          is_mine: true,
          created_at: new Date().toISOString(),
        };
        chatAddLocalMessage(msg);
      });
  }

  function chatSendFile(file) {
    if (!file) return;
    var fd = new FormData();
    fd.append('file', file);
    fd.append('project_id', String(chatState.projectId || ''));
    fd.append('type', 'file');
    fd.append('file_name', file.name || 'Attachment');
    chatApi('/messages', { method: 'POST', body: fd })
      .then(function (out) {
        if (!out.ok || !out.data.success) throw new Error('send');
        chatReloadMessages();
      })
      .catch(function () {
        var msg = {
          id: Date.now(),
          type: 'file',
          file_name: file.name || 'Attachment',
          user_name: 'You',
          is_mine: true,
          created_at: new Date().toISOString(),
        };
        chatAddLocalMessage(msg);
      });
  }

  function chatSendMaterialRequest(payload) {
    chatApi('/messages', {
      method: 'POST',
      body: JSON.stringify({
        project_id: chatState.projectId,
        type: 'material_request',
        request_summary: payload.summary || '',
        request_details: payload.details || '',
        request_urgency: payload.urgency || 'Normal',
        request_location: payload.location || '',
        request_status: 'Pending',
      }),
    })
      .then(function (out) {
        if (!out.ok || !out.data.success) throw new Error('send');
        chatReloadMessages();
      })
      .catch(function () {
        var msg = {
          id: Date.now(),
          type: 'material_request',
          summary: payload.summary || '',
          details: payload.details || '',
          urgency: payload.urgency || 'Normal',
          location: payload.location || '',
          status: 'Pending',
          user_name: 'You',
          is_mine: true,
          created_at: new Date().toISOString(),
        };
        chatAddLocalMessage(msg);
      });
  }

  function chatReloadMessages() {
    if (!chatState.projectId) return Promise.resolve();
    return chatApi('/messages?project_id=' + encodeURIComponent(chatState.projectId) + '&limit=120')
      .then(function (out) {
        if (!out.ok || !out.data.success) throw new Error('messages');
        var prevLen = chatState.messages.length;
        chatState.messages = out.data.messages || [];
        chatSaveFallback();
        if (modalSiteChat && modalSiteChat.classList.contains('is-open')) {
          chatRenderMessages();
        }
        if (chatState.messages.length > prevLen && modalSiteChat && !modalSiteChat.classList.contains('is-open')) {
          chatToast('New message');
        }
      })
      .catch(function () {
        chatLoadFallback();
        if (modalSiteChat && modalSiteChat.classList.contains('is-open')) {
          chatRenderMessages();
        }
      });
  }

  function chatReloadNotifications() {
    if (!chatState.projectId) return Promise.resolve();
    return chatApi('/notifications?project_id=' + encodeURIComponent(chatState.projectId) + '&limit=80')
      .then(function (out) {
        if (!out.ok || !out.data.success) throw new Error('notifications');
        chatState.notifications = (out.data.notifications || []).filter(function (n) { return !n.read; });
        chatState.unreadCount = chatState.notifications.length;
        chatRenderUnread();
        chatRenderNotifications();
        chatSaveFallback();
      })
      .catch(function () {
        chatLoadFallback();
        chatRenderUnread();
        chatRenderNotifications();
      });
  }

  function chatStartRealtime() {
    if (chatState.pollTimer) clearInterval(chatState.pollTimer);
    chatReloadMessages();
    chatReloadNotifications();
    chatState.pollTimer = setInterval(function () {
      chatReloadMessages();
      chatReloadNotifications();
    }, 5000);
  }

  function chatStopRealtime() {
    if (chatState.pollTimer) {
      clearInterval(chatState.pollTimer);
      chatState.pollTimer = null;
    }
  }

  function chatInitProjectContext(project) {
    var localProjectId = project && project.id != null ? project.id : null;
    var localProjectName = project && (project.name || project.project_name) ? (project.name || project.project_name) : 'Project room';
    chatApi('/room' + (localProjectId ? '?project_id=' + encodeURIComponent(localProjectId) : ''))
      .then(function (out) {
        if (!out.ok || !out.data.success || !out.data.room) throw new Error('room');
        chatState.projectId = out.data.room.project_id;
        chatState.projectName = out.data.room.project_name || localProjectName;
        if (chatProjectNameEl) chatProjectNameEl.textContent = chatState.projectName;
        chatReloadMessages();
        chatReloadNotifications();
      })
      .catch(function () {
        chatState.projectId = localProjectId;
        chatState.projectName = localProjectName;
        if (chatProjectNameEl) chatProjectNameEl.textContent = chatState.projectName;
        chatLoadFallback();
        chatRenderUnread();
        chatRenderNotifications();
      });
  }

  if (chatOpenBtn) {
    chatOpenBtn.addEventListener('click', function () {
      openModal(modalSiteChat);
      document.body.classList.add('op-chat-open');
      chatRenderMessages();
      chatMarkAllRead();
    });
  }

  if (chatBackBtn) {
    chatBackBtn.addEventListener('click', function () {
      closeModal(modalSiteChat);
      document.body.classList.remove('op-chat-open');
    });
  }

  if (chatNotifOpenBtn) {
    chatNotifOpenBtn.addEventListener('click', function () {
      openModal(modalChatNotifications);
      chatRenderNotifications();
    });
  }

  if (chatHeaderNotifBtn) {
    chatHeaderNotifBtn.addEventListener('click', function () {
      openModal(modalChatNotifications);
      chatRenderNotifications();
    });
  }

  if (chatFilterRequestBtn) {
    chatFilterRequestBtn.addEventListener('click', function () {
      chatState.requestOnly = !chatState.requestOnly;
      chatFilterRequestBtn.classList.toggle('is-active', chatState.requestOnly);
      chatRenderMessages();
    });
  }

  if (chatForm) {
    chatForm.addEventListener('submit', function (e) {
      e.preventDefault();
      chatSendText(chatInput && chatInput.value);
      if (chatInput) chatInput.value = '';
    });
  }

  if (chatFileInput) {
    chatFileInput.addEventListener('change', function () {
      var file = chatFileInput.files && chatFileInput.files[0];
      if (file) chatSendFile(file);
      chatFileInput.value = '';
    });
  }

  if (chatRequestBtn) {
    chatRequestBtn.addEventListener('click', function () {
      if (chatRequestForm) chatRequestForm.reset();
      openModal(modalChatRequest);
    });
  }

  if (chatRequestForm) {
    chatRequestForm.addEventListener('submit', function (e) {
      e.preventDefault();
      chatSendMaterialRequest({
        summary: chatRequestSummary && chatRequestSummary.value,
        details: chatRequestDetails && chatRequestDetails.value,
        urgency: (chatRequestUrgency && chatRequestUrgency.value) || 'Normal',
        location: chatRequestLocation && chatRequestLocation.value,
      });
      closeModal(modalChatRequest);
    });
  }

  if (modalSiteChat) {
    modalSiteChat.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.classList && (t.classList.contains('op-modal-backdrop') || t.classList.contains('op-modal-close'))) {
        document.body.classList.remove('op-chat-open');
      }
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
  var modalDrawing = document.getElementById('op-modal-dg');
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

  // ----- Drawing View Module (operatives, read-only) -----
  var dgSummaryEl = document.getElementById('op-dg-summary');
  var dgOpenBtn = document.getElementById('op-dg-open');
  var dgListEl = document.getElementById('op-dg-list');
  var dgBackBtn = document.getElementById('op-dg-back');
  var dgPathEl = document.getElementById('op-dg-path');
  var modalDrawingViewer = document.getElementById('op-modal-dg-viewer');
  var dgViewerWrap = document.getElementById('op-dg-viewer-wrap');
  var dgIframe = document.getElementById('op-dg-iframe');
  var dgImg = document.getElementById('op-dg-img');
  var dgDwg = document.getElementById('op-dg-dwg');
  var dgToolCalibrate = document.getElementById('op-dg-tool-calibrate');
  var dgToolShare = document.getElementById('op-dg-tool-share');
  var dgToolDownload = document.getElementById('op-dg-tool-download');
  var dgToolBack = document.getElementById('op-dg-tool-back');
  var dgPrevBtn = document.getElementById('op-dg-prev');
  var dgNextBtn = document.getElementById('op-dg-next');
  var dgCalibrateOverlay = document.getElementById('op-dg-calibrate-overlay');
  var dgCalibrateLine = document.getElementById('op-dg-calibrate-line');
  var dgCurrentProjectId = null;
  var dgCurrentVersionId = null;
  var dgDrawings = [];
  var dgCurrentDrawingIndex = -1;
  var dgCurrentVersionBlobUrl = null;
  var dgThumbBlobUrls = [];
  var dgViewerState = { scale: 1, translateX: 0, translateY: 0 };
  var dgCalibrateState = {
    active: false,
    firstPoint: null,
    secondPoint: null,
  };
  var dgNav = {
    level: 'disciplines',
    discipline: null,
    category: null,
  };

  function dgApi(path) {
    var token = getToken();
    if (!token) return Promise.reject(new Error('No token'));
    return fetch('/api/drawing-gallery' + path, {
      headers: { 'X-Operative-Token': token },
      credentials: 'same-origin',
    }).then(function (res) {
      var ct = res.headers.get('Content-Type') || '';
      if (ct.indexOf('application/json') !== -1) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      }
      return res.text().then(function (t) {
        return { ok: res.ok, data: { message: t } };
      });
    });
  }

  function dgSetPath() {
    if (!dgPathEl) return;
    if (dgNav.level === 'disciplines') {
      dgPathEl.textContent = 'Disciplines';
      if (dgBackBtn) dgBackBtn.classList.add('d-none');
      return;
    }
    if (dgNav.level === 'categories') {
      dgPathEl.textContent = 'Disciplines / ' + (dgNav.discipline || '');
      if (dgBackBtn) dgBackBtn.classList.remove('d-none');
      return;
    }
    dgPathEl.textContent = 'Disciplines / ' + (dgNav.discipline || '') + ' / ' + (dgNav.category || '');
    if (dgBackBtn) dgBackBtn.classList.remove('d-none');
  }

  function dgEsc(s) {
    return escapeHtml(s == null ? '' : String(s));
  }

  function dgCard(title, meta, attrs) {
    return (
      '<button type="button" class="op-dg-series-card" ' +
      (attrs || '') +
      '>' +
      '<div class="op-dg-series-title">' +
      dgEsc(title) +
      '</div>' +
      '<div class="op-dg-series-meta">' +
      dgEsc(meta) +
      '</div>' +
      '</button>'
    );
  }

  function dgLoadDisciplines() {
    dgNav.level = 'disciplines';
    dgSetPath();
    if (dgListEl) dgListEl.innerHTML = '<p class="op-text-muted" style="margin:0">Loading disciplines…</p>';
    dgApi('/projects/' + encodeURIComponent(dgCurrentProjectId) + '/disciplines')
      .then(function (out) {
        if (!out.ok || !out.data.success) throw new Error(out.data.message || 'Failed');
        var rows = out.data.disciplines || [];
        if (!rows.length) {
          dgListEl.innerHTML = '<p class="op-text-muted" style="margin:0">No drawings in this project yet.</p>';
          return;
        }
        dgListEl.innerHTML = rows
          .map(function (r) {
            return dgCard(r.discipline || 'General', (r.total_drawings || 0) + ' drawings', 'data-dg-discipline="' + dgEsc(r.discipline || 'General') + '"');
          })
          .join('');
        dgListEl.querySelectorAll('[data-dg-discipline]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            dgNav.discipline = btn.getAttribute('data-dg-discipline');
            dgLoadCategories();
          });
        });
      })
      .catch(function () {
        dgListEl.innerHTML = '<p class="op-text-muted" style="margin:0">Could not load disciplines.</p>';
      });
  }

  function dgLoadCategories() {
    dgNav.level = 'categories';
    dgNav.category = null;
    dgSetPath();
    if (dgListEl) dgListEl.innerHTML = '<p class="op-text-muted" style="margin:0">Loading categories…</p>';
    dgApi(
      '/projects/' +
        encodeURIComponent(dgCurrentProjectId) +
        '/disciplines/' +
        encodeURIComponent(dgNav.discipline || '') +
        '/categories'
    )
      .then(function (out) {
        if (!out.ok || !out.data.success) throw new Error(out.data.message || 'Failed');
        var rows = out.data.categories || [];
        if (!rows.length) {
          dgListEl.innerHTML = '<p class="op-text-muted" style="margin:0">No categories found.</p>';
          return;
        }
        dgListEl.innerHTML = rows
          .map(function (r) {
            return dgCard(r.category || 'General', (r.total_drawings || 0) + ' drawings', 'data-dg-category="' + dgEsc(r.category || 'General') + '"');
          })
          .join('');
        dgListEl.querySelectorAll('[data-dg-category]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            dgNav.category = btn.getAttribute('data-dg-category');
            dgLoadDrawings();
          });
        });
      })
      .catch(function () {
        dgListEl.innerHTML = '<p class="op-text-muted" style="margin:0">Could not load categories.</p>';
      });
  }

  function dgThumbFor(d) {
    if ((d.mime_type || '').indexOf('image/') === 0) {
      return '<img data-dg-thumb-version="' + dgEsc(String(d.id)) + '" alt="" style="width:52px;height:52px;object-fit:cover;border-radius:8px;border:1px solid rgba(15,101,88,0.16);margin-right:10px;background:#e7f7f2;">';
    }
    return '<span style="display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:8px;background:#ecfbf7;border:1px solid rgba(15,101,88,0.16);margin-right:10px;"><i class="bi bi-file-earmark-text" style="font-size:20px;color:#1d7b6a;"></i></span>';
  }

  function dgClearThumbBlobUrls() {
    if (!Array.isArray(dgThumbBlobUrls)) return;
    dgThumbBlobUrls.forEach(function (u) {
      try {
        URL.revokeObjectURL(u);
      } catch (_) {}
    });
    dgThumbBlobUrls = [];
  }

  function dgHydrateImageThumbnails(drawings) {
    if (!Array.isArray(drawings) || !drawings.length || !dgListEl) return;
    drawings.forEach(function (d) {
      if (!d || (d.mime_type || '').indexOf('image/') !== 0) return;
      var imgEl = dgListEl.querySelector('img[data-dg-thumb-version="' + String(d.id) + '"]');
      if (!imgEl) return;
      fetch('/api/drawing-gallery/versions/' + d.id + '/file', {
        headers: { 'X-Operative-Token': getToken() || '' },
        credentials: 'same-origin',
      })
        .then(function (res) {
          if (!res.ok) throw new Error('thumb');
          return res.blob();
        })
        .then(function (blob) {
          var u = URL.createObjectURL(blob);
          dgThumbBlobUrls.push(u);
          imgEl.src = u;
        })
        .catch(function () {});
    });
  }

  function dgLoadDrawings() {
    dgNav.level = 'drawings';
    dgSetPath();
    if (dgListEl) dgListEl.innerHTML = '<p class="op-text-muted" style="margin:0">Loading drawings…</p>';
    dgApi(
      '/projects/' +
        encodeURIComponent(dgCurrentProjectId) +
        '/disciplines/' +
        encodeURIComponent(dgNav.discipline || '') +
        '/categories/' +
        encodeURIComponent(dgNav.category || '') +
        '/drawings'
    )
      .then(function (out) {
        dgClearThumbBlobUrls();
        if (!out.ok || !out.data.success) throw new Error(out.data.message || 'Failed');
        var rows = out.data.drawings || [];
        dgDrawings = rows.slice();
        dgCurrentDrawingIndex = -1;
        dgUpdateNavButtons();
        if (!rows.length) {
          dgListEl.innerHTML = '<p class="op-text-muted" style="margin:0">No drawings in this category.</p>';
          return;
        }
        dgListEl.innerHTML = rows
          .map(function (d) {
            var updated = d.updated_at ? new Date(d.updated_at).toLocaleDateString() : '—';
            return (
              '<button type="button" class="op-dg-series-card" data-dg-version="' +
              dgEsc(String(d.id)) +
              '" data-dg-mime="' +
              dgEsc(d.mime_type || '') +
              '">' +
              '<div style="display:flex;align-items:center;">' +
              dgThumbFor(d) +
              '<div style="min-width:0;">' +
              '<div class="op-dg-series-title" style="margin-bottom:4px;">' +
              dgEsc(d.name || 'Drawing') +
              '</div>' +
              '<div class="op-dg-series-meta">' +
              dgEsc(d.revision || 'v1') +
              ' · Updated ' +
              dgEsc(updated) +
              '</div>' +
              '</div></div></button>'
            );
          })
          .join('');
        dgListEl.querySelectorAll('[data-dg-version]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var vid = parseInt(btn.getAttribute('data-dg-version') || '0', 10);
            if (!vid) return;
            var idx = -1;
            for (var i = 0; i < dgDrawings.length; i += 1) {
              if (Number(dgDrawings[i].id) === Number(vid)) {
                idx = i;
                break;
              }
            }
            if (idx >= 0) dgOpenViewerAtIndex(idx);
          });
        });
        dgHydrateImageThumbnails(rows);
      })
      .catch(function () {
        dgClearThumbBlobUrls();
        dgListEl.innerHTML = '<p class="op-text-muted" style="margin:0">Could not load drawings.</p>';
      });
  }

  function dgResetViewerFinal() {
    dgCurrentVersionId = null;
    dgCurrentDrawingIndex = -1;
    dgViewerState.scale = 1;
    dgViewerState.translateX = 0;
    dgViewerState.translateY = 0;
    if (dgIframe) {
      dgIframe.style.display = 'none';
      dgIframe.src = 'about:blank';
    }
    if (dgImg) {
      dgImg.style.display = 'none';
      dgImg.removeAttribute('src');
      dgImg.style.transform = '';
    }
    if (dgDwg) dgDwg.style.display = 'none';
    dgCalibrateState.active = false;
    dgCalibrateState.firstPoint = null;
    dgCalibrateState.secondPoint = null;
    if (dgCalibrateOverlay) dgCalibrateOverlay.style.display = 'none';
    if (dgCalibrateLine) {
      dgCalibrateLine.setAttribute('x1', '0');
      dgCalibrateLine.setAttribute('y1', '0');
      dgCalibrateLine.setAttribute('x2', '0');
      dgCalibrateLine.setAttribute('y2', '0');
    }
    if (dgCurrentVersionBlobUrl) {
      try {
        URL.revokeObjectURL(dgCurrentVersionBlobUrl);
      } catch (_) {}
      dgCurrentVersionBlobUrl = null;
    }
    dgUpdateNavButtons();
  }

  function dgResetToBasePosition() {
    dgViewerState.scale = 1;
    dgViewerState.translateX = 0;
    dgViewerState.translateY = 0;
    dgApplyViewerTransform();
  }

  function dgUpdateNavButtons() {
    if (dgPrevBtn) dgPrevBtn.disabled = !(dgCurrentDrawingIndex > 0);
    if (dgNextBtn) dgNextBtn.disabled = !(dgCurrentDrawingIndex >= 0 && dgCurrentDrawingIndex < dgDrawings.length - 1);
  }

  function dgOpenViewerAtIndex(index) {
    if (!Array.isArray(dgDrawings) || index < 0 || index >= dgDrawings.length) return;
    dgCurrentDrawingIndex = index;
    dgUpdateNavButtons();
    var d = dgDrawings[index];
    dgOpenViewerFinal(d.id, d.mime_type || '');
    dgCurrentDrawingIndex = index;
    dgUpdateNavButtons();
  }

  function dgApplyViewerTransform() {
    if (!dgImg || dgImg.style.display === 'none') return;
    dgImg.style.transform =
      'translate(' +
      dgViewerState.translateX +
      'px,' +
      dgViewerState.translateY +
      'px) scale(' +
      dgViewerState.scale +
      ')';
  }

  function dgOpenViewerFinal(versionId, mimeHint) {
    dgResetViewerFinal();
    dgCurrentVersionId = versionId;
    openModal(modalDrawingViewer);
    var mime = String(mimeHint || '').toLowerCase();
    var isPdf = mime.indexOf('pdf') >= 0;
    var isImage = mime.indexOf('image/') === 0;
    fetch('/api/drawing-gallery/versions/' + versionId + '/file', {
      headers: { 'X-Operative-Token': getToken() || '' },
      credentials: 'same-origin',
    })
      .then(function (res) {
        if (!res.ok) throw new Error('File load failed');
        return res.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        dgCurrentVersionBlobUrl = url;
        if (isPdf || blob.type.indexOf('pdf') >= 0) {
          if (dgIframe) {
            dgIframe.style.display = 'block';
            dgIframe.src = url;
          }
          return;
        }
        if (isImage || blob.type.indexOf('image/') === 0) {
          if (dgImg) {
            dgImg.style.display = 'block';
            dgImg.src = url;
            dgApplyViewerTransform();
          }
          return;
        }
        if (dgDwg) dgDwg.style.display = 'block';
      })
      .catch(function () {
        closeModal(modalDrawingViewer);
        dgResetViewerFinal();
      });
  }

  function dgSetupViewerGestures() {
    if (!dgViewerWrap || !dgImg) return;
    var drag = null;
    var pinchStartDist = 0;
    var pinchStartScale = 1;
    var panTouch = null;
    function touchDist(a, b) {
      var dx = a.clientX - b.clientX;
      var dy = a.clientY - b.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    dgViewerWrap.addEventListener(
      'wheel',
      function (e) {
        if (dgImg.style.display === 'none') return;
        e.preventDefault();
        var z = e.deltaY < 0 ? 1.08 : 0.92;
        dgViewerState.scale = Math.max(0.25, Math.min(5, dgViewerState.scale * z));
        dgApplyViewerTransform();
      },
      { passive: false }
    );
    dgViewerWrap.addEventListener('mousedown', function (e) {
      if (dgImg.style.display === 'none' || e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, tx: dgViewerState.translateX, ty: dgViewerState.translateY };
    });
    document.addEventListener('mousemove', function (e) {
      if (!drag) return;
      dgViewerState.translateX = drag.tx + (e.clientX - drag.x);
      dgViewerState.translateY = drag.ty + (e.clientY - drag.y);
      dgApplyViewerTransform();
    });
    document.addEventListener('mouseup', function () {
      drag = null;
    });
    dgViewerWrap.addEventListener(
      'touchstart',
      function (e) {
        if (dgImg.style.display === 'none') return;
        if (e.touches.length === 2) {
          pinchStartDist = touchDist(e.touches[0], e.touches[1]);
          pinchStartScale = dgViewerState.scale;
          panTouch = null;
        } else if (e.touches.length === 1) {
          panTouch = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
            tx: dgViewerState.translateX,
            ty: dgViewerState.translateY,
          };
        }
      },
      { passive: false }
    );
    dgViewerWrap.addEventListener(
      'touchmove',
      function (e) {
        if (dgImg.style.display === 'none') return;
        e.preventDefault();
        if (e.touches.length === 2 && pinchStartDist > 0) {
          var d = touchDist(e.touches[0], e.touches[1]);
          dgViewerState.scale = Math.max(0.25, Math.min(5, pinchStartScale * (d / pinchStartDist)));
          dgApplyViewerTransform();
        } else if (e.touches.length === 1 && panTouch) {
          dgViewerState.translateX = panTouch.tx + (e.touches[0].clientX - panTouch.x);
          dgViewerState.translateY = panTouch.ty + (e.touches[0].clientY - panTouch.y);
          dgApplyViewerTransform();
        }
      },
      { passive: false }
    );
  }

  function dgNormalizeViewerPoint(evt) {
    if (!dgViewerWrap) return null;
    var rect = dgViewerWrap.getBoundingClientRect();
    var x = evt.clientX - rect.left;
    var y = evt.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    return {
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
    };
  }

  function dgFinishCalibration() {
    if (!dgCalibrateState.firstPoint || !dgCalibrateState.secondPoint) return;
    var dx = dgCalibrateState.secondPoint.x - dgCalibrateState.firstPoint.x;
    var dy = dgCalibrateState.secondPoint.y - dgCalibrateState.firstPoint.y;
    var pixelDistance = Math.sqrt(dx * dx + dy * dy);
    var realDistance = window.prompt('Distance between selected points (number only):', '1');
    if (!realDistance) return;
    var unit = window.prompt('Unit (e.g. m, mm, ft):', 'm') || 'unit';
    var dist = parseFloat(realDistance);
    if (!Number.isFinite(dist) || dist <= 0 || pixelDistance <= 0) return;
    var ratio = dist / pixelDistance;
    showFeedback(
      document.getElementById('op-clock-feedback'),
      'Calibrated: 1 screen unit = ' + ratio.toFixed(4) + ' ' + unit,
      false
    );
  }

  function loadDrawingProjectSummary() {
    if (!dgSummaryEl) return;
    dgSummaryEl.textContent = 'Loading…';
    api('/project/current')
      .then(function (r) {
        if (!r.data.success || !r.data.project) {
          dgSummaryEl.textContent = 'No project assigned yet.';
          return;
        }
        var p = r.data.project;
        dgCurrentProjectId = p.id;
        dgSummaryEl.textContent = 'Project #' + p.id + ' – ' + (p.name || p.project_name || '—');
      })
      .catch(function () {
        dgSummaryEl.textContent = 'Could not load project.';
      });
  }

  if (dgBackBtn) {
    dgBackBtn.addEventListener('click', function () {
      if (dgNav.level === 'drawings') {
        dgLoadCategories();
      } else if (dgNav.level === 'categories') {
        dgLoadDisciplines();
      }
    });
  }

  function dgCloseViewerToDrawings() {
    closeModal(modalDrawingViewer);
    dgResetViewerFinal();
    dgNav.level = 'drawings';
    dgSetPath();
  }

  if (dgViewerWrap) {
    dgViewerWrap.addEventListener('click', function (e) {
      if (!dgCalibrateState.active || !dgImg || dgImg.style.display === 'none') return;
      var p = dgNormalizeViewerPoint(e);
      if (!p) return;
      if (!dgCalibrateState.firstPoint) {
        dgCalibrateState.firstPoint = p;
        if (dgCalibrateOverlay) dgCalibrateOverlay.style.display = 'block';
        if (dgCalibrateLine) {
          dgCalibrateLine.setAttribute('x1', String(p.x));
          dgCalibrateLine.setAttribute('y1', String(p.y));
          dgCalibrateLine.setAttribute('x2', String(p.x));
          dgCalibrateLine.setAttribute('y2', String(p.y));
        }
        return;
      }
      dgCalibrateState.secondPoint = p;
      if (dgCalibrateLine) {
        dgCalibrateLine.setAttribute('x2', String(p.x));
        dgCalibrateLine.setAttribute('y2', String(p.y));
      }
      dgFinishCalibration();
      dgCalibrateState.active = false;
    });
  }

  if (dgToolCalibrate) {
    dgToolCalibrate.addEventListener('click', function (e) {
      e.stopPropagation();
      dgResetToBasePosition();
      dgCalibrateState.active = false;
      dgCalibrateState.firstPoint = null;
      dgCalibrateState.secondPoint = null;
      if (dgCalibrateOverlay) dgCalibrateOverlay.style.display = 'none';
    });
  }

  if (dgToolDownload) {
    dgToolDownload.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!dgCurrentVersionId) return;
      fetch('/api/drawing-gallery/versions/' + dgCurrentVersionId + '/file?download=1', {
        headers: { 'X-Operative-Token': getToken() || '' },
        credentials: 'same-origin',
      })
        .then(function (res) {
          if (!res.ok) throw new Error('Download failed');
          return res.blob();
        })
        .then(function (blob) {
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'drawing';
          a.click();
          URL.revokeObjectURL(a.href);
        })
        .catch(function () {});
    });
  }

  if (dgToolShare) {
    dgToolShare.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!dgCurrentVersionId) return;
      fetch('/api/drawing-gallery/versions/' + dgCurrentVersionId + '/public-share', {
        method: 'POST',
        headers: { 'X-Operative-Token': getToken() || '' },
        credentials: 'same-origin',
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (out) {
          if (!out.ok || !out.data || !out.data.success || !out.data.url) throw new Error('share');
          var shareUrl = out.data.url;
          if (navigator.share) {
            navigator
              .share({
                title: 'Drawing',
                text: 'Public drawing link',
                url: shareUrl,
              })
              .catch(function () {});
          } else if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(shareUrl).catch(function () {});
          }
        })
        .catch(function () {});
    });
  }

  if (dgToolBack) {
    dgToolBack.addEventListener('click', function (e) {
      e.stopPropagation();
      dgCloseViewerToDrawings();
    });
  }

  if (dgPrevBtn) {
    dgPrevBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (dgCurrentDrawingIndex > 0) {
        dgOpenViewerAtIndex(dgCurrentDrawingIndex - 1);
      }
    });
  }

  if (dgNextBtn) {
    dgNextBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (dgCurrentDrawingIndex >= 0 && dgCurrentDrawingIndex < dgDrawings.length - 1) {
        dgOpenViewerAtIndex(dgCurrentDrawingIndex + 1);
      }
    });
  }

  if (dgOpenBtn && dgSummaryEl && modalDrawing) {
    loadDrawingProjectSummary();
    dgSetupViewerGestures();
    dgOpenBtn.addEventListener('click', function () {
      if (!dgCurrentProjectId) {
        loadDrawingProjectSummary();
      }
      openModal(modalDrawing);
      if (!dgCurrentProjectId) {
        dgListEl.innerHTML = '<p class="op-text-muted" style="margin:0">No project assigned yet.</p>';
        return;
      }
      dgLoadDisciplines();
    });
  }

  // ----- Log Work (list from API GET /work-log) -----
  var modalWorklog = document.getElementById('op-modal-worklog');
  var modalPriceWorkBuilder = document.getElementById('op-modal-price-work-builder');
  var pwbStepsContainer = document.getElementById('op-pwb-steps');
  var formPwbJob = document.getElementById('op-form-pwb-job');
  var formWorklog = document.getElementById('op-form-worklog');
  var worklogListEl = document.getElementById('op-worklog-list');
  var documentInputEl = document.getElementById('op-wl-document');
  var documentNameEl = document.getElementById('op-wl-document-name');
  var generatedPdfLinkEl = document.getElementById('op-wl-generated-pdf-link');
  var invoicePathEl = document.getElementById('op-wl-invoice-path');
  var modalWorkReport = document.getElementById('op-modal-work-report');
  var formWorkReport = document.getElementById('op-form-work-report');
  var modalWorklogOverview = document.getElementById('op-modal-worklog-overview');
  var worklogOverviewBodyEl = document.getElementById('op-worklog-overview-body');
  /** @type {Array<object>} last loaded entries for overview modal */
  var opWorklogEntriesCache = [];

  function formatWorklogOverviewWhen(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) {
      return '—';
    }
  }

  function formatOpWorklogMoneyDisplay(e) {
    if (!e) return '—';
    if (e.total != null && !isNaN(Number(e.total))) return Number(e.total).toFixed(2);
    if (e.qaPriceWorkTotal != null && !isNaN(Number(e.qaPriceWorkTotal))) return Number(e.qaPriceWorkTotal).toFixed(2);
    if (e.quantity != null && e.unitPrice != null && !isNaN(Number(e.quantity)) && !isNaN(Number(e.unitPrice))) {
      return (Number(e.quantity) * Number(e.unitPrice)).toFixed(2);
    }
    return '—';
  }

  function buildWorklogOverviewHtml(entry) {
    if (!entry) return '<p class="op-text-muted">No data.</p>';
    var loc = [entry.project, entry.block, entry.floor, entry.apartment, entry.zone].filter(Boolean).join(' / ') || '—';
    var totalShown = formatOpWorklogMoneyDisplay(entry);
    var qaExtra =
      entry.qaPriceWorkTotal != null &&
      !isNaN(Number(entry.qaPriceWorkTotal)) &&
      (entry.total == null || isNaN(Number(entry.total)) || Number(entry.qaPriceWorkTotal) !== Number(entry.total))
        ? '<div class="op-worklog-overview-section"><p class="op-text-muted" style="margin:0;font-size:0.85rem;">QA price work (estimated): <strong>£' +
          Number(entry.qaPriceWorkTotal).toFixed(2) +
          '</strong></p></div>'
        : '';
    var desc = (entry.description && String(entry.description).trim()) || '';
    var parts = [];
    parts.push('<dl class="op-worklog-overview-dl">');
    parts.push('<dt>Reference</dt><dd>' + escapeHtml(entry.jobId || '—') + '</dd>');
    parts.push('<dt>Status</dt><dd>' + escapeHtml(String(entry.status || 'pending').replace(/_/g, ' ')) + '</dd>');
    parts.push('<dt>Submitted</dt><dd>' + escapeHtml(formatWorklogOverviewWhen(entry.submittedAt)) + '</dd>');
    parts.push('<dt>Location</dt><dd>' + escapeHtml(loc) + '</dd>');
    parts.push('<dt>Work type</dt><dd>' + escapeHtml(entry.workType || '—') + '</dd>');
    parts.push(
      '<dt>Quantity</dt><dd>' + (entry.quantity != null ? escapeHtml(String(entry.quantity)) : '—') + '</dd>'
    );
    parts.push(
      '<dt>Unit price</dt><dd>' +
        (entry.unitPrice != null ? '£' + Number(entry.unitPrice).toFixed(2) : '—') +
        '</dd>'
    );
    parts.push('<dt>Total</dt><dd><strong>£' + escapeHtml(totalShown) + '</strong></dd>');
    parts.push('</dl>');
    if (desc) {
      parts.push(
        '<div class="op-worklog-overview-section"><h4>Description</h4><p style="margin:0;white-space:pre-wrap;word-break:break-word;">' +
          escapeHtml(desc) +
          '</p></div>'
      );
    }
    parts.push(qaExtra);

    var ts = entry.timesheetJobs;
    if (Array.isArray(ts)) {
      ts.forEach(function (block) {
        if (!block || block.type !== 'qa_price_work' || !Array.isArray(block.entries)) return;
        var qaHtml =
          '<div class="op-worklog-overview-section"><h4>QA price work</h4><div class="op-worklog-overview-qa">';
        block.entries.forEach(function (ent) {
          qaHtml += '<div class="op-worklog-overview-qa-entry">';
          var jn = ent.jobNumber != null && String(ent.jobNumber).trim() !== '' ? String(ent.jobNumber) : ent.qaJobId || '—';
          var jt = (ent.jobTitle && String(ent.jobTitle).trim()) || '';
          qaHtml +=
            '<div style="margin-bottom:10px;"><strong>' +
            escapeHtml('Job ' + jn) +
            '</strong>' +
            (jt ? ' — ' + escapeHtml(jt) : '') +
            '</div>';
          var sq = ent.stepQuantities && typeof ent.stepQuantities === 'object' ? ent.stepQuantities : {};
          var labels = ent.stepLabels && typeof ent.stepLabels === 'object' ? ent.stepLabels : {};
          var spu =
            ent.stepPhotoUrls && typeof ent.stepPhotoUrls === 'object'
              ? ent.stepPhotoUrls
              : ent.step_photo_urls && typeof ent.step_photo_urls === 'object'
                ? ent.step_photo_urls
                : {};
          var stepKeys = {};
          Object.keys(sq).forEach(function (k) {
            stepKeys[k] = true;
          });
          Object.keys(spu).forEach(function (k) {
            stepKeys[k] = true;
          });
          var keys = Object.keys(stepKeys);
          if (!keys.length) {
            qaHtml += '<p class="op-text-muted" style="margin:0;">No step quantities.</p>';
          } else {
            qaHtml += '<ul>';
            keys.forEach(function (k) {
              var q = sq[k] || {};
              var bits = [];
              if (q.m2 != null && String(q.m2).trim() !== '') bits.push('m²: ' + escapeHtml(String(q.m2)));
              if (q.linear != null && String(q.linear).trim() !== '') bits.push('linear m: ' + escapeHtml(String(q.linear)));
              if (q.units != null && String(q.units).trim() !== '') bits.push('units: ' + escapeHtml(String(q.units)));
              var urls = Array.isArray(spu[k]) ? spu[k] : [];
              if (!bits.length && !urls.length) return;
              var disp = labels[k] || k;
              qaHtml += '<li><span style="color:var(--op-text-muted);font-size:0.8rem;">' + escapeHtml(disp) + '</span>';
              if (bits.length) qaHtml += ' — ' + bits.join(', ');
              if (urls.length) {
                qaHtml += '<div class="op-worklog-overview-photos" style="margin-top:6px;">';
                urls.forEach(function (url) {
                  qaHtml +=
                    '<img src="' +
                    escapeHtml(url) +
                    '" alt="" data-op-overview-photo="' +
                    escapeHtml(url) +
                    '">';
                });
                qaHtml += '</div>';
              }
              qaHtml += '</li>';
            });
            qaHtml += '</ul>';
          }
          qaHtml += '</div>';
        });
        qaHtml += '</div></div>';
        parts.push(qaHtml);
      });
      var tsIdx = 0;
      ts.forEach(function (tj) {
        if (!tj || tj.type === 'qa_price_work') return;
        var photos = tj && Array.isArray(tj.photos) ? tj.photos : [];
        if (!photos.length) return;
        tsIdx += 1;
        parts.push(
          '<div class="op-worklog-overview-section"><h4>Timesheet job ' +
            tsIdx +
            ' — photos</h4><div class="op-worklog-overview-photos">'
        );
        photos.forEach(function (url) {
          parts.push(
            '<img src="' +
              escapeHtml(url) +
              '" alt="" data-op-overview-photo="' +
              escapeHtml(url) +
              '">'
          );
        });
        parts.push('</div></div>');
      });
    }

    var purls = entry.photoUrls && Array.isArray(entry.photoUrls) ? entry.photoUrls : [];
    if (purls.length) {
      parts.push('<div class="op-worklog-overview-section"><h4>Photos</h4><div class="op-worklog-overview-photos">');
      purls.forEach(function (url) {
        parts.push(
          '<img src="' + escapeHtml(url) + '" alt="" data-op-overview-photo="' + escapeHtml(url) + '">'
        );
      });
      parts.push('</div></div>');
    }

    var inv = entry.invoiceFilePath || entry.invoice_file_path || '';
    if (inv) {
      parts.push(
        '<div class="op-worklog-overview-section"><a href="' +
          escapeHtml(inv) +
          '" target="_blank" rel="noopener" class="op-btn op-btn-secondary op-btn-sm">Open uploaded file / invoice</a></div>'
      );
    }

    return parts.join('');
  }

  function openWorklogOverviewModal(entry) {
    if (!modalWorklogOverview || !worklogOverviewBodyEl) return;
    document.getElementById('op-wlo-title').textContent = entry && entry.jobId ? 'Work entry ' + entry.jobId : 'Work entry';
    worklogOverviewBodyEl.innerHTML = buildWorklogOverviewHtml(entry);
    worklogOverviewBodyEl.querySelectorAll('img[data-op-overview-photo]').forEach(function (img) {
      img.addEventListener('click', function () {
        var u = img.getAttribute('data-op-overview-photo');
        if (u) window.open(u, '_blank', 'noopener');
      });
    });
    openModal(modalWorklogOverview);
  }

  var modalWlInvoiceEmail = document.getElementById('op-modal-wl-invoice-email');

  function openWorkLogInvoiceEmailModal(workLogId) {
    pendingInvoiceWorkLogId = workLogId;
    var fb = document.getElementById('op-wl-inv-feedback');
    if (fb) hideFeedback(fb);
    if (modalWlInvoiceEmail) openModal(modalWlInvoiceEmail);
  }

  function closeWorkLogInvoiceEmailModal() {
    if (modalWlInvoiceEmail) closeModal(modalWlInvoiceEmail);
    pendingInvoiceWorkLogId = null;
    var fb = document.getElementById('op-wl-inv-feedback');
    if (fb) hideFeedback(fb);
  }

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
    opWorklogEntriesCache = entries.slice(0, 20);
    if (entries.length === 0) {
      worklogListEl.innerHTML = '<p class="op-worklog-empty">No entries yet. Add one to send to your manager.</p>';
      return;
    }
    worklogListEl.innerHTML = entries.slice(0, 20).map(function (e) {
      var loc = [e.project, e.block, e.floor, e.apartment, e.zone].filter(Boolean).join(' / ') || '—';
      var submitted = e.submittedAt ? formatDate(e.submittedAt) : '—';
      var invoicePath = e.invoiceFilePath || e.invoice_file_path || '';
      var invAttr = invoicePath ? ' data-op-invoice-path="' + escapeHtml(invoicePath) + '"' : '';
      var money =
        e.total != null && !isNaN(Number(e.total))
          ? Number(e.total).toFixed(2)
          : e.qaPriceWorkTotal != null && !isNaN(Number(e.qaPriceWorkTotal))
            ? Number(e.qaPriceWorkTotal).toFixed(2)
            : '—';
      return (
        '<div class="op-worklog-item op-worklog-item--openable"' +
        invAttr +
        ' data-op-entry-id="' +
        escapeHtml(String(e.id != null ? e.id : '')) +
        '">' +
        '<div class="op-worklog-item-head">' +
        '<span class="op-worklog-item-id">' +
        escapeHtml(e.workType || 'Work') +
        ' – ' +
        escapeHtml(loc) +
        '</span>' +
        '<span class="op-worklog-item-status">' +
        escapeHtml(e.status || 'Pending') +
        '</span>' +
        '</div>' +
        '<div class="op-worklog-item-meta">' +
        (e.jobId ? escapeHtml(e.jobId) + ' · ' : '') +
        escapeHtml(submitted) +
        ' · £' +
        money +
        '</div>' +
        '<p class="op-worklog-item-hint">Tap for details, prices &amp; photos</p>' +
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
      var item = e.target.closest('.op-worklog-item--openable');
      if (!item) return;
      var id = item.getAttribute('data-op-entry-id');
      if (!id) return;
      var entry = opWorklogEntriesCache.find(function (x) {
        return String(x.id) === String(id);
      });
      if (entry) openWorklogOverviewModal(entry);
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
  /** @type {Array<{ qaJobId: string, jobNumber: string, jobTitle: string, stepQuantities: object, stepLabels?: object, stepPhotoUrls?: Record<string, string[]> }>} */
  var pendingPriceWorkEntries = [];
  /** Full list from GET /qa/assigned-jobs (reused when adding more jobs without refetch). */
  var pwbAllJobs = [];
  /** @type {object|null} */
  var pwbSelectedJob = null;
  var pwbLastSavedJobLabel = '';
  /** @type {object|null} */
  var pwbCurrentJob = null;
  /** @type {number|null} */
  var pendingInvoiceWorkLogId = null;

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

  /** Remaining caps for this job: API remaining minus other pending entries for same QA job in this work log. */
  function getEffectiveRemainingForPwbJob(job) {
    var base = (job && job.remainingStepQuantities) || {};
    var out = {};
    Object.keys(base).forEach(function (k) {
      var b = base[k] || {};
      out[k] = {
        m2: b.m2 != null && !isNaN(Number(b.m2)) ? Number(b.m2) : null,
        linear: b.linear != null && !isNaN(Number(b.linear)) ? Number(b.linear) : null,
        units: b.units != null && !isNaN(Number(b.units)) ? Number(b.units) : null,
      };
    });
    pendingPriceWorkEntries.forEach(function (ent) {
      if (!job || String(ent.qaJobId) !== String(job.id)) return;
      var sq = ent.stepQuantities || {};
      Object.keys(sq).forEach(function (k) {
        if (!out[k]) out[k] = { m2: null, linear: null, units: null };
        var q = sq[k] || {};
        ['m2', 'linear', 'units'].forEach(function (dim) {
          if (out[k][dim] == null) return;
          var raw = q[dim];
          if (raw == null || String(raw).trim() === '') return;
          var sub = parseFloat(raw);
          if (isNaN(sub)) return;
          out[k][dim] = Math.max(0, Math.round((out[k][dim] - sub) * 100) / 100);
        });
      });
    });
    return out;
  }

  function validatePwbStepQuantities(job, sq, feedbackEl) {
    var remMap = getEffectiveRemainingForPwbJob(job);
    var dimLabels = { m2: 'm²', linear: 'linear m', units: 'units' };
    var dims = ['m2', 'linear', 'units'];
    for (var k in sq) {
      if (!Object.prototype.hasOwnProperty.call(sq, k)) continue;
      var q = sq[k] || {};
      var r = remMap[k] || { m2: null, linear: null, units: null };
      for (var di = 0; di < dims.length; di++) {
        var dim = dims[di];
        if (!Object.prototype.hasOwnProperty.call(q, dim)) continue;
        var raw = q[dim];
        if (raw == null || String(raw).trim() === '') continue;
        var val = parseFloat(raw);
        if (isNaN(val)) continue;
        if (r[dim] != null && val > r[dim] + 1e-6) {
          if (feedbackEl) {
            showFeedback(
              feedbackEl,
              'Quantity exceeds remaining for ' + dimLabels[dim] + ' on this job (maximum ' + r[dim] + ').',
              true
            );
          }
          return false;
        }
      }
    }
    return true;
  }

  function getAvailablePwbJobs() {
    return pwbAllJobs.filter(function (j) {
      return !pendingPriceWorkEntries.some(function (e) {
        return String(e.qaJobId) === String(j.id);
      });
    });
  }

  function showPwbPhase(phase) {
    var loadingEl = document.getElementById('op-pwb-loading');
    var emptyEl = document.getElementById('op-pwb-empty');
    var pickEl = document.getElementById('op-pwb-pick');
    var afterEl = document.getElementById('op-pwb-after-job');
    var overviewEl = document.getElementById('op-pwb-overview');
    var formEl = document.getElementById('op-form-pwb-job');
    var introEl = document.getElementById('op-pwb-intro');
    [loadingEl, emptyEl, pickEl, afterEl, overviewEl, formEl].forEach(function (el) {
      if (el) el.classList.add('d-none');
    });
    if (introEl) {
      if (phase === 'pick') introEl.classList.remove('d-none');
      else introEl.classList.add('d-none');
    }
    switch (phase) {
      case 'loading':
        if (loadingEl) loadingEl.classList.remove('d-none');
        break;
      case 'empty':
        if (emptyEl) emptyEl.classList.remove('d-none');
        break;
      case 'pick':
        if (introEl) introEl.classList.remove('d-none');
        if (pickEl) pickEl.classList.remove('d-none');
        break;
      case 'form':
        if (formEl) formEl.classList.remove('d-none');
        break;
      case 'afterJob':
        if (afterEl) afterEl.classList.remove('d-none');
        break;
      case 'overview':
        if (overviewEl) overviewEl.classList.remove('d-none');
        break;
      default:
        break;
    }
  }

  function renderPwbPick() {
    var pickEl = document.getElementById('op-pwb-pick');
    var emptyEl = document.getElementById('op-pwb-empty');
    if (!pickEl) return;
    var avail = getAvailablePwbJobs();
    if (!avail.length) {
      if (emptyEl) {
        emptyEl.innerHTML =
          pwbAllJobs.length === 0
            ? '<p class="op-text-muted">No QA jobs are assigned to you on this project.</p>'
            : '<p class="op-text-muted">You have already added booking quantities for every assigned QA job in this work log. Open <strong>Review booking overview</strong> from the previous step, or submit your work log when ready.</p>';
      }
      showPwbPhase('empty');
      return;
    }
    if (emptyEl) {
      emptyEl.classList.add('d-none');
      emptyEl.innerHTML = '';
    }
    var parts = ['<div class="op-pwb-pick-list">'];
    avail.forEach(function (j) {
      var jn = j.jobNumber != null && String(j.jobNumber).trim() !== '' ? String(j.jobNumber) : j.id;
      var jt = (j.jobTitle && String(j.jobTitle).trim()) || 'QA job';
      parts.push(
        '<button type="button" class="op-pwb-pick-card" data-pwb-job-id="' +
          escapeHtml(String(j.id)) +
          '">' +
          '<div class="op-pwb-pick-card-title">' +
          escapeHtml('Job ' + jn + ' — ' + jt) +
          '</div>' +
          '<p class="op-pwb-pick-card-meta">Tap to enter quantities for your booking</p>' +
          '</button>'
      );
    });
    parts.push('</div>');
    pickEl.innerHTML = parts.join('');
    pickEl.classList.remove('d-none');
  }

  function renderPwbAfterJob() {
    var afterEl = document.getElementById('op-pwb-after-job');
    if (!afterEl) return;
    afterEl.innerHTML =
      '<p class="op-pwb-after-msg">Saved for this work entry: <strong>' +
      escapeHtml(pwbLastSavedJobLabel) +
      '</strong>.</p>' +
      '<p class="op-text-muted" style="margin:0 0 16px;font-size:0.9rem;line-height:1.45;">Would you like to <strong>add another QA job</strong> from the list, or <strong>review an overview</strong> of everything you intend to book before returning to the work log?</p>' +
      '<div class="op-pwb-after-actions">' +
      '<button type="button" class="op-btn op-btn-primary" id="op-pwb-btn-add-another">Add another job</button>' +
      '<button type="button" class="op-btn op-btn-secondary" id="op-pwb-btn-to-overview">Review booking overview</button>' +
      '</div>';
  }

  function renderPwbOverview() {
    var overviewEl = document.getElementById('op-pwb-overview');
    if (!overviewEl) return;
    var entries = pendingPriceWorkEntries || [];
    var parts = [];
    parts.push('<h4 style="margin:0 0 12px;font-size:1rem;">Booking overview</h4>');
    if (!entries.length) {
      parts.push('<p class="op-text-muted">No QA price work lines yet. Use Add another job to choose a job.</p>');
    } else {
      entries.forEach(function (ent) {
        var jn = ent.jobNumber != null && String(ent.jobNumber).trim() !== '' ? String(ent.jobNumber) : ent.qaJobId || '—';
        var jt = (ent.jobTitle && String(ent.jobTitle).trim()) || '';
        parts.push('<div class="op-pwb-overview-block">');
        parts.push('<h4>' + escapeHtml('Job ' + jn + (jt ? ' — ' + jt : '')) + '</h4>');
        var sq = ent.stepQuantities || {};
        var labels = ent.stepLabels || {};
        var spu =
          ent.stepPhotoUrls && typeof ent.stepPhotoUrls === 'object'
            ? ent.stepPhotoUrls
            : ent.step_photo_urls && typeof ent.step_photo_urls === 'object'
              ? ent.step_photo_urls
              : {};
        var stepKeys = {};
        Object.keys(sq).forEach(function (k) {
          stepKeys[k] = true;
        });
        Object.keys(spu).forEach(function (k) {
          stepKeys[k] = true;
        });
        var sk = Object.keys(stepKeys);
        if (!sk.length) {
          parts.push('<p class="op-text-muted" style="margin:0;">No quantities entered.</p>');
        } else {
          parts.push('<ul style="margin:0;padding-left:18px;">');
          sk.forEach(function (k) {
            var q = sq[k] || {};
            var bits = [];
            if (q.m2 != null && String(q.m2).trim() !== '') bits.push('m² ' + escapeHtml(String(q.m2)));
            if (q.linear != null && String(q.linear).trim() !== '') bits.push('linear m ' + escapeHtml(String(q.linear)));
            if (q.units != null && String(q.units).trim() !== '') bits.push('units ' + escapeHtml(String(q.units)));
            var urls = Array.isArray(spu[k]) ? spu[k] : [];
            if (!bits.length && !urls.length) return;
            parts.push('<li>');
            parts.push(
              '<span style="color:var(--op-text-muted);font-size:0.85rem;">' +
                escapeHtml(labels[k] || k) +
                '</span>'
            );
            if (bits.length) parts.push(' — ' + bits.join(', '));
            if (urls.length) {
              parts.push('<div class="op-pwb-overview-step-photos">');
              urls.forEach(function (url) {
                parts.push(
                  '<img src="' +
                    escapeHtml(url) +
                    '" alt="" class="op-pwb-overview-step-photo-thumb">'
                );
              });
              parts.push('</div>');
            }
            parts.push('</li>');
          });
          parts.push('</ul>');
        }
        parts.push('</div>');
      });
    }
    parts.push(
      '<div class="op-pwb-overview-actions">' +
      '<button type="button" class="op-btn op-btn-secondary" id="op-pwb-btn-overview-add">Add another job</button>' +
      '<button type="button" class="op-btn op-btn-primary" id="op-pwb-btn-done">Done — back to work log</button>' +
      '</div>'
    );
    overviewEl.innerHTML = parts.join('');
  }

  function closePwbDone() {
    closeModal(modalPriceWorkBuilder);
    var wf = document.getElementById('op-worklog-feedback');
    if (wf && modalWorklog && modalWorklog.classList.contains('is-open')) {
      showFeedback(wf, 'QA price work saved for this entry. Complete totals and submit the work log.', false);
    }
  }

  function openPriceWorkBuilderModal() {
    setWorklogFlow('price');
    var emptyEl = document.getElementById('op-pwb-empty');
    var stepsEl = document.getElementById('op-pwb-steps');
    var feedback = document.getElementById('op-pwb-feedback');
    var formEl = document.getElementById('op-form-pwb-job');
    if (!modalPriceWorkBuilder) return;
    hideFeedback(feedback);
    pwbCurrentJob = null;
    pwbSelectedJob = null;
    pwbAllJobs = [];
    if (stepsEl) stepsEl.innerHTML = '';
    if (emptyEl) {
      emptyEl.classList.add('d-none');
      emptyEl.innerHTML = '';
    }
    if (formEl) formEl.classList.add('d-none');
    showPwbPhase('loading');
    openModal(modalPriceWorkBuilder);

    api('/qa/assigned-jobs')
      .then(function (r) {
        var all = r.data && r.data.success && Array.isArray(r.data.jobs) ? r.data.jobs : [];
        pwbAllJobs = all;
        if (!getAvailablePwbJobs().length) {
          if (emptyEl) {
            emptyEl.classList.remove('d-none');
            emptyEl.innerHTML =
              all.length === 0
                ? '<p class="op-text-muted">No QA jobs are assigned to you on this project.</p>'
                : '<p class="op-text-muted">You have already entered quantities for all assigned QA jobs in this work log. Submit when ready, or start a new work log to enter again.</p>';
          }
          showPwbPhase('empty');
          return;
        }
        renderPwbPick();
        showPwbPhase('pick');
      })
      .catch(function () {
        if (emptyEl) {
          emptyEl.classList.remove('d-none');
          emptyEl.innerHTML = '<p class="op-text-muted">Could not load QA jobs. Try again.</p>';
        }
        showPwbPhase('empty');
      });
  }

  function pwbSafeInputId(key, dim) {
    return 'op-pwb-inp-' + String(key).replace(/[^a-zA-Z0-9_-]/g, '_') + '-' + dim;
  }

  function renderPwbCurrentJob() {
    var job = pwbSelectedJob;
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
      labelEl.innerHTML =
        '<span class="op-pwb-job-label-kicker">Booking</span>' +
        '<span class="op-pwb-job-label-text">' +
        escapeHtml('Job ' + jn + ' — ' + jt) +
        '</span>';
    }
    var remMap = getEffectiveRemainingForPwbJob(job);
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
        var rem = remMap[key] || { m2: null, linear: null, units: null };
        parts.push('<section class="op-pwb-step" data-pwb-step-key="' + escapeHtml(key) + '" aria-label="' + escapeHtml(title) + '">');
        parts.push(
          '<div class="op-pwb-step-head">' +
            '<span class="op-pwb-step-badge" aria-hidden="true">' +
            String(idx + 1) +
            '</span>' +
            '<div class="op-pwb-step-title">' +
            escapeHtml(title) +
            '</div></div>'
        );
        parts.push('<div class="op-pwb-step-fields">');
        if (hasM2) {
          var idM2 = pwbSafeInputId(key, 'm2');
          var maxM2 = rem.m2 != null ? ' max="' + String(rem.m2) + '"' : '';
          var hintM2 =
            rem.m2 != null
              ? '<span class="op-pwb-rem-hint">Remaining: ' + escapeHtml(String(rem.m2)) + ' m²</span>'
              : '';
          parts.push(
            '<div class="op-field">' +
              '<label for="' +
              idM2 +
              '">m²</label>' +
              '<input id="' +
              idM2 +
              '" type="number" inputmode="decimal" min="0" step="0.01" class="op-pwb-inp" data-pwb-key="' +
              escapeHtml(key) +
              '" data-pwb-dim="m2" placeholder="0"' +
              maxM2 +
              '>' +
              hintM2 +
              '</div>'
          );
        }
        if (hasLin) {
          var idLin = pwbSafeInputId(key, 'lin');
          var maxL = rem.linear != null ? ' max="' + String(rem.linear) + '"' : '';
          var hintL =
            rem.linear != null
              ? '<span class="op-pwb-rem-hint">Remaining: ' + escapeHtml(String(rem.linear)) + ' m</span>'
              : '';
          parts.push(
            '<div class="op-field">' +
              '<label for="' +
              idLin +
              '">Linear (m)</label>' +
              '<input id="' +
              idLin +
              '" type="number" inputmode="decimal" min="0" step="0.01" class="op-pwb-inp" data-pwb-key="' +
              escapeHtml(key) +
              '" data-pwb-dim="linear" placeholder="0"' +
              maxL +
              '>' +
              hintL +
              '</div>'
          );
        }
        if (hasUn) {
          var idUn = pwbSafeInputId(key, 'units');
          var maxU = rem.units != null ? ' max="' + String(rem.units) + '"' : '';
          var hintU =
            rem.units != null
              ? '<span class="op-pwb-rem-hint">Remaining: ' + escapeHtml(String(rem.units)) + ' units</span>'
              : '';
          parts.push(
            '<div class="op-field">' +
              '<label for="' +
              idUn +
              '">Units</label>' +
              '<input id="' +
              idUn +
              '" type="number" inputmode="numeric" min="0" step="1" class="op-pwb-inp" data-pwb-key="' +
              escapeHtml(key) +
              '" data-pwb-dim="units" placeholder="0"' +
              maxU +
              '>' +
              hintU +
              '</div>'
          );
        }
        parts.push('</div>');
        var idPhoto = pwbSafeInputId(key, 'photo');
        parts.push(
          '<div class="op-pwb-step-photo-block">' +
            '<span class="op-pwb-step-photo-label"><i class="bi bi-camera" aria-hidden="true"></i> Photo evidence <span class="op-pwb-optional">(optional)</span></span>' +
            '<p class="op-pwb-photo-hint">Add one or more images for this step. After you add photos, use <strong>Remove</strong> on a thumbnail if the wrong file was chosen.</p>' +
            '<input type="file" id="' +
            idPhoto +
            '" class="op-pwb-photo-input op-pwb-photo-input-native" accept="image/*" multiple>' +
            '<label for="' +
            idPhoto +
            '" class="op-btn op-btn-secondary op-btn-sm op-pwb-add-photo">' +
            '<i class="bi bi-plus-lg" aria-hidden="true"></i> Add photos</label>' +
            '<div class="op-pwb-photo-chips" aria-live="polite"></div>' +
            '</div>'
        );
        parts.push('</section>');
      });
    });
    stepsEl.innerHTML = parts.length ? parts.join('') : '<p class="op-text-muted">No billable steps on this job’s templates.</p>';
    if (submitBtn) {
      submitBtn.textContent = 'Save booking for this job';
    }
    showPwbPhase('form');
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

  /** Ensure public URL for <img src> (API may omit leading slash). */
  function normalizeWorklogUploadPath(p) {
    if (p == null || typeof p !== 'string') return '';
    var s = p.trim();
    if (s.indexOf('/uploads/') === 0) return s;
    if (s.indexOf('uploads/') === 0) return '/' + s;
    return s;
  }

  function uploadPwbWorklogPhoto(file) {
    var fd = new FormData();
    fd.append('file', file);
    return api('/work-log/upload', { method: 'POST', body: fd }).then(function (r) {
      if (r.status >= 400) {
        throw new Error((r.data && r.data.message) || 'Upload failed (' + r.status + ').');
      }
      if (r.data && r.data.success && r.data.path) {
        var path = normalizeWorklogUploadPath(r.data.path);
        if (path.indexOf('/uploads/') === 0) return path;
        throw new Error('Invalid file path from server.');
      }
      throw new Error((r.data && r.data.message) || 'Upload failed');
    });
  }

  function collectPwbStepPhotoUrls() {
    var out = {};
    document.querySelectorAll('#op-pwb-steps .op-pwb-step').forEach(function (stepEl) {
      var key = stepEl.getAttribute('data-pwb-step-key');
      if (!key) return;
      var urls = [];
      stepEl.querySelectorAll('.op-pwb-photo-chip').forEach(function (chip) {
        if (chip.classList.contains('op-pwb-photo-chip--pending')) return;
        var u = chip.getAttribute('data-url');
        if (!u && chip.querySelector) {
          var img = chip.querySelector('img');
          if (img) u = img.getAttribute('src');
        }
        u = normalizeWorklogUploadPath(u && String(u).trim());
        if (!u || u.indexOf('blob:') === 0) return;
        if (u.indexOf('/uploads/') === 0) urls.push(u);
      });
      if (urls.length) out[key] = urls;
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
      if (!validatePwbStepQuantities(pwbCurrentJob, stepQuantities, feedback)) return;
      var jn =
        pwbCurrentJob.jobNumber != null && String(pwbCurrentJob.jobNumber).trim() !== ''
          ? String(pwbCurrentJob.jobNumber)
          : pwbCurrentJob.id;
      var jt = (pwbCurrentJob.jobTitle && String(pwbCurrentJob.jobTitle).trim()) || 'QA job';
      pwbLastSavedJobLabel = 'Job ' + jn + ' — ' + jt;
      pendingPriceWorkEntries.push({
        qaJobId: String(pwbCurrentJob.id),
        jobNumber: pwbCurrentJob.jobNumber != null ? String(pwbCurrentJob.jobNumber) : '',
        jobTitle: (pwbCurrentJob.jobTitle && String(pwbCurrentJob.jobTitle).trim()) || '',
        stepQuantities: stepQuantities,
        stepLabels: buildStepLabelsForPwbJob(pwbCurrentJob),
        stepPhotoUrls: collectPwbStepPhotoUrls(),
      });
      pwbSelectedJob = null;
      pwbCurrentJob = null;
      renderPwbAfterJob();
      showPwbPhase('afterJob');
    });
  }

  function revokeBlobWhenImgSettles(img, blobUrl) {
    if (!img || !blobUrl) return;
    var done = false;
    function revoke() {
      if (done) return;
      done = true;
      try {
        URL.revokeObjectURL(blobUrl);
      } catch (revErr) {}
    }
    function onLoad() {
      img.removeEventListener('load', onLoad);
      img.removeEventListener('error', onErr);
      revoke();
    }
    function onErr() {
      img.removeEventListener('load', onLoad);
      img.removeEventListener('error', onErr);
      revoke();
    }
    img.addEventListener('load', onLoad);
    img.addEventListener('error', onErr);
    window.setTimeout(revoke, 12000);
  }

  var pwbPhotoChangeRoot = pwbStepsContainer || modalPriceWorkBuilder;
  if (pwbPhotoChangeRoot) {
    pwbPhotoChangeRoot.addEventListener('change', function (e) {
      var inp = e.target;
      if (!inp || inp.type !== 'file') return;
      if (!inp.classList || !inp.classList.contains('op-pwb-photo-input')) return;
      var stepEl = inp.closest('.op-pwb-step');
      var chipsEl = stepEl && stepEl.querySelector('.op-pwb-photo-chips');
      if (!stepEl || !chipsEl) return;
      var files = inp.files;
      var feedback = document.getElementById('op-pwb-feedback');
      var arr = files && files.length ? Array.prototype.slice.call(files) : [];
      /* Defer clearing so iOS Safari finishes handing off File objects reliably */
      setTimeout(function () {
        try {
          inp.value = '';
        } catch (clearErr) {}
      }, 0);
      if (!arr.length) {
        if (feedback) {
          showFeedback(
            feedback,
            'No photo was received after you picked images. Try Add photos again, or use a smaller image. If this keeps happening, try Safari (not in-app browser).',
            true
          );
        }
        return;
      }
      showFeedback(feedback, 'Uploading photos…', false);

      function appendPhotoChip(previewSrc, isPending) {
        var chip = document.createElement('span');
        chip.className = 'op-pwb-photo-chip' + (isPending ? ' op-pwb-photo-chip--pending' : '');
        if (!isPending) chip.setAttribute('data-url', previewSrc);
        var img = document.createElement('img');
        img.setAttribute('src', previewSrc);
        img.setAttribute('alt', '');
        img.setAttribute('draggable', 'false');
        img.setAttribute('loading', 'eager');
        var rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'op-pwb-photo-remove';
        rm.setAttribute('aria-label', 'Remove photo');
        rm.setAttribute('title', 'Remove photo');
        rm.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
        chip.appendChild(img);
        chip.appendChild(rm);
        chipsEl.appendChild(chip);
        return chip;
      }

      var seq = Promise.resolve();
      arr.forEach(function (file) {
        seq = seq.then(function () {
          var localUrl = URL.createObjectURL(file);
          var chip = appendPhotoChip(localUrl, true);
          var img = chip.querySelector('img');
          return uploadPwbWorklogPhoto(file)
            .then(function (path) {
              if (!chip.parentNode) return;
              chip.classList.remove('op-pwb-photo-chip--pending');
              chip.setAttribute('data-url', path);
              if (img) {
                revokeBlobWhenImgSettles(img, localUrl);
                img.setAttribute('src', path);
              } else {
                try {
                  URL.revokeObjectURL(localUrl);
                } catch (revErr) {}
              }
            })
            .catch(function (err) {
              try {
                URL.revokeObjectURL(localUrl);
              } catch (revErr) {}
              if (chip.parentNode) chip.parentNode.removeChild(chip);
              return Promise.reject(err);
            });
        });
      });
      seq
        .then(function () {
          hideFeedback(feedback);
        })
        .catch(function (err) {
          showFeedback(feedback, err.message || 'Upload failed', true);
        });
    });
  }
  if (modalPriceWorkBuilder) {
    modalPriceWorkBuilder.addEventListener('click', function (e) {
      if (e.target.closest('.op-pwb-photo-remove')) {
        e.preventDefault();
        var chip = e.target.closest('.op-pwb-photo-chip');
        if (chip && chip.parentNode) chip.parentNode.removeChild(chip);
        return;
      }
      /* Add photos: native <label for="file-id"> opens picker (required for iOS; do not preventDefault / finp.click) */
      var card = e.target.closest('.op-pwb-pick-card');
      if (card) {
        e.preventDefault();
        var jid = card.getAttribute('data-pwb-job-id');
        var job = pwbAllJobs.find(function (j) {
          return String(j.id) === String(jid);
        });
        if (job) {
          pwbSelectedJob = job;
          renderPwbCurrentJob();
        }
        return;
      }
      if (e.target.id === 'op-pwb-btn-add-another' || e.target.closest('#op-pwb-btn-add-another')) {
        e.preventDefault();
        renderPwbPick();
        if (getAvailablePwbJobs().length) showPwbPhase('pick');
        return;
      }
      if (e.target.id === 'op-pwb-btn-to-overview' || e.target.closest('#op-pwb-btn-to-overview')) {
        e.preventDefault();
        renderPwbOverview();
        showPwbPhase('overview');
        return;
      }
      if (e.target.id === 'op-pwb-btn-overview-add' || e.target.closest('#op-pwb-btn-overview-add')) {
        e.preventDefault();
        renderPwbPick();
        if (getAvailablePwbJobs().length) showPwbPhase('pick');
        return;
      }
      if (e.target.id === 'op-pwb-btn-done' || e.target.closest('#op-pwb-btn-done')) {
        e.preventDefault();
        closePwbDone();
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
    pwbAllJobs = [];
    pwbSelectedJob = null;
    pwbCurrentJob = null;
    if (generatedPdfLinkEl) {
      generatedPdfLinkEl.classList.add('d-none');
      generatedPdfLinkEl.removeAttribute('href');
    }
    setWorklogFlow('price');
    if (wt) {
      wt.innerHTML = '';
      var lo = document.createElement('option');
      lo.value = '';
      lo.textContent = 'Loading work types…';
      wt.appendChild(lo);
    }
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
          loadWorkTypes();
          return;
        }
        var proj = r.data.project;
        var name = proj && (proj.name || proj.project_name || '');
        if (proj && (name || proj.id)) {
          projectInput.value = name || 'Project #' + proj.id;
          currentWorklogProject = proj;
          var labels = [];
          if (Array.isArray(proj.trades) && proj.trades.length) {
            proj.trades.forEach(function (t) {
              var L = typeof t === 'string' ? t : t && t.label;
              if (L && String(L).trim()) labels.push(String(L).trim());
            });
          }
          if (labels.length) renderWorkTypes(labels);
          else loadWorkTypes();
        } else {
          projectInput.value = 'No project assigned';
          currentWorklogProject = null;
          loadWorkTypes();
        }
      })
      .catch(function (err) {
        if (projectInput) {
          projectInput.value = 'No project assigned';
          currentWorklogProject = null;
        }
        loadWorkTypes();
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
            var wlId = r.data.workLogId != null ? r.data.workLogId : null;
            loadWorklogList();
            pendingWorklogPhotoUrls = [];
            pendingWorklogTimesheetJobs = [];
            pendingPriceWorkEntries = [];
            if (wlId != null) {
              setTimeout(function () {
                closeModal(modalWorklog);
                hideFeedback(feedback);
                if (submitBtn) submitBtn.disabled = false;
                openWorkLogInvoiceEmailModal(wlId);
              }, 500);
            } else {
              showFeedback(feedback, r.data.message || 'Submitted. Manager will see this in Work Logs.', false);
              setTimeout(function () {
                closeModal(modalWorklog);
                hideFeedback(feedback);
                if (submitBtn) submitBtn.disabled = false;
              }, 1800);
            }
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

  var btnWlInvYes = document.getElementById('op-wl-inv-yes');
  var btnWlInvNo = document.getElementById('op-wl-inv-no');
  if (btnWlInvYes) {
    btnWlInvYes.addEventListener('click', function () {
      if (pendingInvoiceWorkLogId == null) {
        closeWorkLogInvoiceEmailModal();
        return;
      }
      var fb = document.getElementById('op-wl-inv-feedback');
      if (fb) showFeedback(fb, 'Sending…', false);
      api('/work-log/' + encodeURIComponent(String(pendingInvoiceWorkLogId)) + '/send-invoice-copy', { method: 'POST' })
        .then(function (r) {
          if (r.data.success) {
            if (fb) showFeedback(fb, r.data.message || 'Sent.', false);
            setTimeout(function () {
              closeWorkLogInvoiceEmailModal();
            }, 1200);
          } else {
            if (fb) showFeedback(fb, r.data.message || 'Could not send.', true);
          }
        })
        .catch(function (err) {
          if (fb) showFeedback(fb, err.message || 'Could not send.', true);
        });
    });
  }
  if (btnWlInvNo) {
    btnWlInvNo.addEventListener('click', function () {
      closeWorkLogInvoiceEmailModal();
    });
  }

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
      chatStartRealtime();
    })
    .catch(function (err) {
      if (err && err.message === 'supervisor_redirect') return;
      loadClockStatus();
      loadWeekly();
      loadProject();
      loadTasks();
      loadDocumentsInbox();
      chatStartRealtime();
    });

  window.addEventListener('beforeunload', function () {
    chatStopRealtime();
  });
})();
