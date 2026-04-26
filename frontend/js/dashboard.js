/**
 * Dashboard – access control, sidebar menu, dynamic content loading.
 * Only active managers (session in localStorage + backend validation) can access.
 */

(function () {
  'use strict';

  var SESSION_KEY = 'proconix_manager_session';

  var contentEl = document.getElementById('dashboard-content');
  var sidebarLinks = document.querySelectorAll('.sidebar-nav [data-module]');
  var headerTitle = document.querySelector('.header-title');
  var toggleBtn = document.getElementById('sidebar-toggle');
  var sidebar = document.querySelector('.sidebar');
  var loadingEl = document.getElementById('dashboard-loading');
  var accessDeniedEl = document.getElementById('dashboard-access-denied');
  var dashboardAppEl = document.getElementById('dashboard-app');
  var companyNameEl = document.getElementById('dashboard-company-name');
  var userNameEl = document.getElementById('dashboard-user-name');
  var logoutBtn = document.getElementById('dashboard-logout-btn');
  var myCompanyWrap = document.querySelector('.dashboard-my-company');
  var dashboardFooter = document.querySelector('.dashboard-footer');

  var moduleTitles = {
    'project-overview': 'Dashboard / Project Overview',
    'projects': 'My Projects',
    'manage-material': 'Material Management',
    'operatives': 'Operatives',
    'worklogs': 'Work Logs',
    'quality-assurance': 'Quality Assurance',
    'digital-signature': 'Documents & Signatures',
    'task-planning': 'Task & Planning',
    'drawing-gallery': 'Drawing Gallery',
    'site-snags': 'Site Snags',
    'unit-progress-tracking': 'Unit Progress Tracking',
    'profile-settings': 'Profile Settings',
    'my-company-settings': 'My Company Settings'
  };

  function getSession() {
    try {
      var rawLocal = localStorage.getItem(SESSION_KEY);
      var rawSession = sessionStorage.getItem(SESSION_KEY);
      var raw = rawLocal || rawSession;
      var parsed = raw ? JSON.parse(raw) : null;
      // Backfill localStorage when older sessions exist only in sessionStorage,
      // so access-router pages opened in a new tab can detect manager session.
      if (!rawLocal && rawSession && parsed) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(parsed));
      }
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function getSessionHeaders() {
    var session = getSession();
    if (!session || session.manager_id == null || !session.email) return {};
    return {
      'X-Manager-Id': String(session.manager_id),
      'X-Manager-Email': session.email,
    };
  }

  function showLoading(show) {
    if (loadingEl) loadingEl.classList.toggle('d-none', !show);
  }

  function showAccessDenied(show) {
    if (accessDeniedEl) accessDeniedEl.classList.toggle('d-none', !show);
  }

  function showDashboardApp(show) {
    if (dashboardAppEl) dashboardAppEl.classList.toggle('d-none', !show);
  }

  function updateUserCompanyDisplay(companyName, userFullName) {
    if (companyNameEl) companyNameEl.textContent = companyName || '—';
    if (userNameEl) userNameEl.textContent = userFullName || '—';
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    window.location.href = '/index.html';
  }

  function checkAccess() {
    var session = getSession();
    if (!session || session.manager_id == null || !session.email) {
      showLoading(false);
      showAccessDenied(true);
      showDashboardApp(false);
      return Promise.resolve(false);
    }

    var headers = getSessionHeaders();
    return fetch('/api/auth/validate', { headers: headers })
      .then(function (res) {
        if (res.ok) return res.json();
        return res.json().then(function (data) {
          throw new Error(data.message || 'Access denied');
        });
      })
      .then(function (data) {
        showLoading(false);
        showAccessDenied(false);
        showDashboardApp(true);
        if (data && data.company_name != null && data.manager) {
          var fullName = [data.manager.name, data.manager.surname].filter(Boolean).join(' ') || '—';
          updateUserCompanyDisplay(data.company_name, fullName);
        }
        return true;
      })
      .catch(function () {
        showLoading(false);
        showAccessDenied(true);
        showDashboardApp(false);
        return false;
      });
  }

  function setActiveItem(module) {
    sidebarLinks.forEach(function (link) {
      link.classList.toggle('active', link.getAttribute('data-module') === module);
    });
  }

  function updateHeaderTitle(module) {
    if (headerTitle && moduleTitles[module]) {
      headerTitle.textContent = moduleTitles[module];
    }
  }

  function updateHeaderTopControls(module) {
    var showTopControls = module === 'project-overview';
    if (myCompanyWrap) myCompanyWrap.classList.toggle('d-none', !showTopControls);
    if (logoutBtn) logoutBtn.classList.toggle('d-none', !showTopControls);
    if (dashboardFooter) dashboardFooter.classList.toggle('d-none', !showTopControls);
  }

  /** Resolve iframe module HTML path against current page (works with subpaths; avoids bad relative resolution). */
  function iframeModuleSrc(filename) {
    try {
      return new URL(filename, window.location.href).href;
    } catch (_) {
      return filename;
    }
  }

  function postSiteSnagsSessionToFrame(snIframe) {
    if (!snIframe || !snIframe.contentWindow) return;
    var session = getSession();
    try {
      if (session) {
        snIframe.contentWindow.postMessage(
          { type: 'proconix_site_snags_session', session: session },
          window.location.origin
        );
      }
    } catch (err) {
      /* ignore */
    }
  }

  function loadModule(module, pushState) {
    if (!contentEl) return;
    updateHeaderTopControls(module);

    if (module === 'task-planning') {
      contentEl.classList.add('dashboard-content-fade-out');
      setActiveItem(module);
      updateHeaderTitle(module);
      contentEl.innerHTML =
        '<iframe src="' +
        iframeModuleSrc('Task_Planning.html') +
        '" class="dashboard-qa-iframe" title="Task &amp; Planning"></iframe>';
      contentEl.classList.remove('dashboard-content-fade-out');
      contentEl.classList.add('dashboard-content-fade-in');
      if (pushState !== false) history.pushState({ module: module }, '', '#');
      return;
    }

    if (module === 'drawing-gallery') {
      contentEl.classList.add('dashboard-content-fade-out');
      setActiveItem(module);
      updateHeaderTitle(module);
      contentEl.innerHTML =
        '<iframe src="' +
        iframeModuleSrc('Drawing_Gallery.html') +
        '" class="dashboard-qa-iframe" title="Drawing Gallery"></iframe>';
      contentEl.classList.remove('dashboard-content-fade-out');
      contentEl.classList.add('dashboard-content-fade-in');
      if (pushState !== false) history.pushState({ module: module }, '', '#');
      return;
    }

    if (module === 'quality-assurance') {
      contentEl.classList.add('dashboard-content-fade-out');
      setActiveItem(module);
      updateHeaderTitle(module);
      contentEl.innerHTML =
        '<iframe src="' +
        iframeModuleSrc('Quality_Assurance.html') +
        '" class="dashboard-qa-iframe" title="Quality Assurance Module"></iframe>';
      contentEl.classList.remove('dashboard-content-fade-out');
      contentEl.classList.add('dashboard-content-fade-in');
      if (pushState !== false) history.pushState({ module: module }, '', '#');
      return;
    }

    if (module === 'digital-signature') {
      contentEl.classList.add('dashboard-content-fade-out');
      setActiveItem(module);
      updateHeaderTitle(module);
      contentEl.innerHTML =
        '<iframe src="' +
        iframeModuleSrc('digital_signature.html') +
        '" class="dashboard-qa-iframe" title="Documents &amp; Digital Signatures"></iframe>';
      contentEl.classList.remove('dashboard-content-fade-out');
      contentEl.classList.add('dashboard-content-fade-in');
      if (pushState !== false) history.pushState({ module: module }, '', '#');
      return;
    }
    if (module === 'manage-material') {
      contentEl.classList.add('dashboard-content-fade-out');
      setActiveItem(module);
      updateHeaderTitle(module);
      contentEl.innerHTML =
        '<iframe src="' +
        iframeModuleSrc('manage_material.html') +
        '" class="dashboard-qa-iframe" title="Material Management"></iframe>';
      contentEl.classList.remove('dashboard-content-fade-out');
      contentEl.classList.add('dashboard-content-fade-in');
      if (pushState !== false) history.pushState({ module: module }, '', '#');
      return;
    }

    if (module === 'site-snags') {
      contentEl.classList.add('dashboard-content-fade-out');
      setActiveItem(module);
      updateHeaderTitle(module);
      contentEl.innerHTML =
        '<iframe id="iframe-site-snags" src="' +
        iframeModuleSrc('Site_Snags.html') +
        '" class="dashboard-qa-iframe" title="Site Snags"></iframe>';
      contentEl.classList.remove('dashboard-content-fade-out');
      contentEl.classList.add('dashboard-content-fade-in');
      var snIframe = document.getElementById('iframe-site-snags');
      if (snIframe) {
        snIframe.addEventListener('load', function onSiteSnagsFrameLoad() {
          snIframe.removeEventListener('load', onSiteSnagsFrameLoad);
          postSiteSnagsSessionToFrame(snIframe);
          window.setTimeout(function () {
            postSiteSnagsSessionToFrame(snIframe);
          }, 150);
        });
      }
      if (pushState !== false) history.pushState({ module: module }, '', '#');
      return;
    }

    if (module === 'unit-progress-tracking') {
      contentEl.classList.add('dashboard-content-fade-out');
      setActiveItem(module);
      updateHeaderTitle(module);
      contentEl.innerHTML =
        '<div class="dashboard-iframe-loader-wrap" id="unit-progress-loader-wrap">' +
        '<div class="dashboard-iframe-loader" id="unit-progress-loader">' +
        '<div class="dashboard-loading-spinner" aria-hidden="true"></div>' +
        '<p>Loading data, please wait...</p>' +
        '</div>' +
        '<iframe id="iframe-unit-progress" src="' +
        iframeModuleSrc('Unit_Progress_Tracking.html') +
        '" class="dashboard-qa-iframe d-none" title="Unit Progress Tracking"></iframe>' +
        '</div>';
      var upIframe = document.getElementById('iframe-unit-progress');
      var upLoader = document.getElementById('unit-progress-loader');
      if (upIframe) {
        upIframe.addEventListener('load', function onUnitProgressFrameLoad() {
          upIframe.removeEventListener('load', onUnitProgressFrameLoad);
          if (upLoader) upLoader.classList.add('d-none');
          upIframe.classList.remove('d-none');
        });
      }
      contentEl.classList.remove('dashboard-content-fade-out');
      contentEl.classList.add('dashboard-content-fade-in');
      if (pushState !== false) history.pushState({ module: module }, '', '#');
      return;
    }

    if (module === 'profile-settings') {
      contentEl.classList.add('dashboard-content-fade-out');
      setActiveItem(module);
      updateHeaderTitle(module);
      contentEl.innerHTML =
        '<iframe src="' +
        iframeModuleSrc('Profile_Settings.html') +
        '" class="dashboard-qa-iframe" title="Profile Settings"></iframe>';
      contentEl.classList.remove('dashboard-content-fade-out');
      contentEl.classList.add('dashboard-content-fade-in');
      if (pushState !== false) history.pushState({ module: module }, '', '#');
      return;
    }

    if (module === 'my-company-settings') {
      contentEl.classList.add('dashboard-content-fade-out');
      setActiveItem(module);
      updateHeaderTitle(module);
      contentEl.innerHTML =
        '<iframe src="' +
        iframeModuleSrc('my_company_settings.html') +
        '" class="dashboard-qa-iframe" title="My Company Settings"></iframe>';
      contentEl.classList.remove('dashboard-content-fade-out');
      contentEl.classList.add('dashboard-content-fade-in');
      if (pushState !== false) history.pushState({ module: module }, '', '#');
      return;
    }

    var headers = getSessionHeaders();
    if (!headers['X-Manager-Id']) {
      contentEl.innerHTML = '<p class="text-muted">Session expired. Please sign in again.</p>';
      return;
    }

    contentEl.classList.add('dashboard-content-fade-out');
    setActiveItem(module);
    updateHeaderTitle(module);

    fetch('/api/dashboard/' + module, { headers: headers })
      .then(function (res) {
        if (res.status === 401) {
          showAccessDenied(true);
          showDashboardApp(false);
          return null;
        }
        if (!res.ok) throw new Error('Module not found');
        return res.text();
      })
      .then(function (html) {
        if (html === null) return;
        contentEl.innerHTML = html;
        contentEl.classList.remove('dashboard-content-fade-out');
        contentEl.classList.add('dashboard-content-fade-in');
        if (module === 'operatives') {
          loadOperativesData();
          if (typeof window.initOperativesCrewsModule === 'function') {
            window.initOperativesCrewsModule();
          }
        }
        if (module === 'projects' && typeof window.initProjectsModule === 'function') {
          window.initProjectsModule();
        }
        if (module === 'worklogs' && typeof window.initWorkLogsModule === 'function') {
          window.initWorkLogsModule();
        }
        if (typeof window.initDashboardCharts === 'function') {
          window.initDashboardCharts();
        }
        if (module === 'project-overview') {
          loadProjectOverviewOperativesCount();
          loadProjectOverviewStats();
          loadProjectOverviewLists();
          loadProjectOverviewOperativeActivityToday();
        }
        if (pushState !== false) {
          history.pushState({ module: module }, '', '#');
        }
      })
      .catch(function () {
        contentEl.innerHTML = '<div class="module-placeholder"><p class="text-muted">Failed to load module. Please try again.</p></div>';
        contentEl.classList.remove('dashboard-content-fade-out');
      });
  }

  function setMobileSidebarOpen(open) {
    if (!sidebar) return;
    sidebar.classList.toggle('sidebar-open', open);
    var overlay = document.getElementById('sidebar-overlay');
    if (overlay) {
      overlay.classList.toggle('visible', open);
      overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggleBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }
  }

  function handleSidebarClick(e) {
    var link = e.target.closest('[data-module]');
    if (!link) return;
    e.preventDefault();
    var module = link.getAttribute('data-module');
    if (module) loadModule(module);
    if (sidebar && window.innerWidth < 992) {
      setMobileSidebarOpen(false);
    }
  }

  function handleContentClick(e) {
    var target = e.target;
    if (target.closest('[data-action="add-operative"]')) {
      e.preventDefault();
      requestSeatStatusAndOpenModal('#modal-add-operative');
      return;
    }
    if (target.closest('[data-action="add-supervisor"]')) {
      e.preventDefault();
      requestSeatStatusAndOpenModal('#modal-add-supervisor');
      return;
    }
    if (target.closest('[data-dismiss="modal"]') || target.closest('[data-dismiss="confirm-modal"]')) {
      e.preventDefault();
      var openModal = contentEl && contentEl.querySelector('.operatives-modal.is-open');
      if (openModal) {
        openModal.classList.remove('is-open');
        openModal.setAttribute('aria-hidden', 'true');
      }
      return;
    }
    if (target.closest('[data-dismiss="projects-modal"]')) {
      e.preventDefault();
      var projectModals = contentEl && contentEl.querySelectorAll('.projects-modal.is-open');
      if (projectModals && projectModals.length) {
        projectModals.forEach(function (m) {
          m.classList.remove('is-open');
          m.setAttribute('aria-hidden', 'true');
        });
      }
      return;
    }
    if (target.closest('[data-dismiss="worklogs-modal"]')) {
      e.preventDefault();
      var worklogsModals = contentEl && contentEl.querySelectorAll('.worklogs-modal.is-open');
      if (worklogsModals && worklogsModals.length) {
        worklogsModals.forEach(function (m) {
          m.classList.remove('is-open');
          m.setAttribute('aria-hidden', 'true');
        });
      }
      return;
    }
    var deleteBtn = target.closest('[data-action="operative-delete"]');
    if (deleteBtn && contentEl) {
      e.preventDefault();
      var id = deleteBtn.getAttribute('data-id');
      var name = deleteBtn.getAttribute('data-name') || 'this operative';
      openConfirmModal('Delete operative?', 'Are you sure you want to remove ' + name + '? This cannot be undone.', function () {
        patchOrDeleteOperative('DELETE', id, null, function () {
          showOperativesFeedback('Operative removed.', false);
          loadOperativesData();
        });
      });
      return;
    }
    var actBtn = target.closest('[data-action="operative-activate"]');
    if (actBtn && contentEl) {
      e.preventDefault();
      var id = actBtn.getAttribute('data-id');
      openConfirmModal('Activate operative', 'Set this operative as active?', function () {
        patchOrDeleteOperative('PATCH', id, { active: true }, function () {
          showOperativesFeedback('Operative activated.', false);
          loadOperativesData();
        });
      });
      return;
    }
    var deactBtn = target.closest('[data-action="operative-deactivate"]');
    if (deactBtn && contentEl) {
      e.preventDefault();
      var id = deactBtn.getAttribute('data-id');
      var name = deactBtn.getAttribute('data-name') || 'this operative';
      openConfirmModal('Deactivate operative', 'Deactivate ' + name + '? They will no longer be marked as active.', function () {
        patchOrDeleteOperative('PATCH', id, { active: false }, function () {
          showOperativesFeedback('Operative deactivated.', false);
          loadOperativesData();
        });
      });
      return;
    }
    var confirmBtn = target.closest('#operatives-confirm-btn');
    if (confirmBtn && contentEl) {
      e.preventDefault();
      if (typeof window._operativesConfirmCallback === 'function') {
        window._operativesConfirmCallback();
        window._operativesConfirmCallback = null;
      }
      var cm = contentEl.querySelector('#operatives-confirm-modal');
      if (cm) {
        cm.classList.remove('is-open');
        cm.setAttribute('aria-hidden', 'true');
      }
    }
  }

  function handleContentChange(e) {
    var select = e.target.closest('select[data-action="operative-role"]');
    if (!select || !contentEl) return;
    var id = select.getAttribute('data-id');
    var newRole = select.value;
    var prevRole = select.getAttribute('data-prev');
    if (newRole === prevRole) return;
    patchOrDeleteOperative('PATCH', id, { role: newRole }, function () {
      showOperativesFeedback('Role updated to ' + newRole + '.', false);
      select.setAttribute('data-prev', newRole);
      loadOperativesData();
    });
  }

  function showOperativesFeedback(message, isError) {
    if (!contentEl) return;
    var feedback = contentEl.querySelector('#operatives-feedback');
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.remove('success', 'error', 'd-none');
    feedback.classList.add(isError ? 'error' : 'success');
    feedback.classList.remove('d-none');
  }

  function hideOperativesFeedback() {
    if (!contentEl) return;
    var feedback = contentEl.querySelector('#operatives-feedback');
    if (feedback) feedback.classList.add('d-none');
  }

  var SEAT_LIMIT_MESSAGE =
    'Your company has reached the maximum number of users for your current plan. Please contact support at info@proconix.uk to upgrade.';

  /**
   * Before opening add operative / supervisor modal, check companies.user_limit vs current seats.
   */
  function requestSeatStatusAndOpenModal(modalSelector) {
    if (!contentEl) return;
    var headers = getSessionHeaders();
    if (!headers['X-Manager-Id']) {
      showOperativesFeedback('Session expired. Please sign in again.', true);
      return;
    }
    fetch('/api/operatives/seat-status', { headers: headers, credentials: 'same-origin' })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (out) {
        if (out.status === 401) {
          showOperativesFeedback('Session expired. Please sign in again.', true);
          return;
        }
        if (out.status !== 200 || !out.data || !out.data.success) {
          showOperativesFeedback(
            (out.data && out.data.message) || 'Could not verify seat limit. Please try again.',
            true
          );
          return;
        }
        if (out.data.at_limit) {
          window.alert(SEAT_LIMIT_MESSAGE);
          return;
        }
        hideOperativesFeedback();
        var modal = contentEl.querySelector(modalSelector);
        if (modal) {
          modal.classList.add('is-open');
          modal.setAttribute('aria-hidden', 'false');
        }
      })
      .catch(function () {
        showOperativesFeedback('Could not verify seat limit. Please try again.', true);
      });
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
  }

  var OPERATIVES_ALL_ROLES = ['Supervisor', 'Plaster', 'Dryliner', 'Electrician', 'Plumber', 'Painter', 'Carpenter', 'Other'];

  function openConfirmModal(title, message, onConfirm) {
    window._operativesConfirmCallback = onConfirm;
    var titleEl = contentEl && contentEl.querySelector('#operatives-confirm-title');
    var msgEl = contentEl && contentEl.querySelector('#operatives-confirm-message');
    var modal = contentEl && contentEl.querySelector('#operatives-confirm-modal');
    if (titleEl) titleEl.textContent = title || 'Confirm';
    if (msgEl) msgEl.textContent = message || '';
    if (modal) {
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function patchOrDeleteOperative(method, id, body, onSuccess) {
    var headers = getSessionHeaders();
    if (!headers['X-Manager-Id']) return;
    headers['Content-Type'] = 'application/json';
    var url = '/api/operatives/' + id;
    var opts = { method: method, headers: headers };
    if (body && method === 'PATCH') opts.body = JSON.stringify(body);
    fetch(url, opts)
      .then(function (res) { return res.json().then(function (data) { return { status: res.status, data: data }; }); })
      .then(function (result) {
        if (result.status >= 200 && result.status < 300) {
          if (onSuccess) onSuccess();
        } else {
          showOperativesFeedback(result.data.message || 'Action failed.', true);
        }
      })
      .catch(function () {
        showOperativesFeedback('Request failed. Please try again.', true);
      });
  }

  function formatOperativesDate(createdAt) {
    if (!createdAt) return '—';
    try {
      var d = new Date(createdAt);
      return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (_) {
      return '—';
    }
  }

  function renderOperativesStats(stats) {
    var el = contentEl && contentEl.querySelector('#operatives-stats');
    if (!el) return;
    if (!stats || Object.keys(stats).length === 0) {
      el.innerHTML = '<div class="operatives-stats-empty">No operatives yet.</div>';
      return;
    }
    var parts = [];
    for (var role in stats) {
      if (Object.prototype.hasOwnProperty.call(stats, role)) {
        parts.push('<span class="operatives-stat-pill"><span class="operatives-stat-role">' + escapeHtml(role) + '</span> <span class="operatives-stat-count">' + stats[role] + '</span></span>');
      }
    }
    el.innerHTML = '<div class="operatives-stats-pills">' + parts.join('') + '</div>';
  }

  function renderOperativesTable(operatives) {
    var tbody = contentEl && contentEl.querySelector('#operatives-tbody');
    var table = contentEl && contentEl.querySelector('#operatives-table');
    var loading = contentEl && contentEl.querySelector('#operatives-table-loading');
    var empty = contentEl && contentEl.querySelector('#operatives-empty');
    if (!tbody) return;
    if (loading) loading.classList.add('d-none');
    if (table) table.classList.remove('d-none');
    if (empty) empty.classList.add('d-none');
    if (!operatives || operatives.length === 0) {
      if (table) table.classList.add('d-none');
      if (empty) empty.classList.remove('d-none');
      tbody.innerHTML = '';
      return;
    }
    var html = '';
    for (var i = 0; i < operatives.length; i++) {
      var o = operatives[i];
      var name = escapeHtml(o.name || '—');
      var email = escapeHtml(o.email || '—');
      var role = escapeHtml(o.role || '—');
      var project = (o.project_name && String(o.project_name).trim()) ? escapeHtml(o.project_name) : (o.project_id != null ? 'Project #' + o.project_id : '—');
      var regDate = formatOperativesDate(o.created_at);
      var active = o.active ? 'Active' : 'Inactive';
      var statusClass = o.active ? 'status-green' : 'status-red';
      var roleOptions = OPERATIVES_ALL_ROLES.map(function (r) {
        return '<option value="' + escapeHtml(r) + '"' + (r === (o.role || '') ? ' selected' : '') + '>' + escapeHtml(r) + '</option>';
      }).join('');
      var actions = '<select class="operatives-role-select" data-action="operative-role" data-id="' + escapeHtml(String(o.id)) + '" data-prev="' + escapeHtml(String(o.role || '')) + '" aria-label="Change role">' + roleOptions + '</select>';
      if (o.active) {
        actions += ' <button type="button" class="btn-operatives-icon btn-operatives-deactivate" data-action="operative-deactivate" data-id="' + escapeHtml(String(o.id)) + '" data-name="' + escapeHtml(name) + '" title="Deactivate"><i class="bi bi-pause-circle"></i></button>';
      } else {
        actions += ' <button type="button" class="btn-operatives-icon btn-operatives-activate" data-action="operative-activate" data-id="' + escapeHtml(String(o.id)) + '" title="Activate"><i class="bi bi-play-circle"></i></button>';
      }
      actions +=
        ' <button type="button" class="btn-operatives-icon" data-action="operative-view" data-id="' +
        escapeHtml(String(o.id)) +
        '" title="View details"><i class="bi bi-eye"></i></button>';
      actions += ' <button type="button" class="btn-operatives-icon btn-operatives-delete" data-action="operative-delete" data-id="' + escapeHtml(String(o.id)) + '" data-name="' + escapeHtml(name) + '" title="Delete"><i class="bi bi-trash"></i></button>';
      html += '<tr><td>' + name + '</td><td>' + email + '</td><td>' + role + '</td><td>' + project + '</td><td>' + regDate + '</td><td><span class="status-badge ' + statusClass + '">' + active + '</span></td><td class="operatives-actions-cell">' + actions + '</td></tr>';
    }
    tbody.innerHTML = html;
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function formatWorkLogsTotalCost(amount) {
    var n = typeof amount === 'number' ? amount : parseFloat(amount);
    if (Number.isNaN(n)) n = 0;
    try {
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);
    } catch (_) {
      return '£' + n.toFixed(2);
    }
  }

  function loadProjectOverviewStats() {
    var projEl = contentEl && contentEl.querySelector('#project-overview-projects-count');
    var tasksEl = contentEl && contentEl.querySelector('#project-overview-planning-tasks-count');
    var costEl = contentEl && contentEl.querySelector('#project-overview-worklogs-total');
    if (!projEl || !tasksEl || !costEl) return;
    var headers = getSessionHeaders();
    if (!headers['X-Manager-Id']) {
      projEl.textContent = '—';
      tasksEl.textContent = '—';
      costEl.textContent = '—';
      return;
    }
    fetch('/api/dashboard/overview-stats', { headers: headers })
      .then(function (res) {
        return res.json().catch(function () { return null; });
      })
      .then(function (data) {
        if (data && data.success) {
          projEl.textContent = data.projects_count != null ? String(data.projects_count) : '0';
          tasksEl.textContent = data.planning_tasks_count != null ? String(data.planning_tasks_count) : '0';
          costEl.textContent = formatWorkLogsTotalCost(data.work_logs_total_cost);
          if (typeof window.updateQaWorkTypePieChart === 'function') {
            window.updateQaWorkTypePieChart(data.qa_job_cost_by_type || []);
          }
        } else {
          projEl.textContent = '—';
          tasksEl.textContent = '—';
          costEl.textContent = '—';
          if (typeof window.updateQaWorkTypePieChart === 'function') {
            window.updateQaWorkTypePieChart([]);
          }
        }
      })
      .catch(function () {
        projEl.textContent = '—';
        tasksEl.textContent = '—';
        costEl.textContent = '—';
        if (typeof window.updateQaWorkTypePieChart === 'function') {
          window.updateQaWorkTypePieChart([]);
        }
      });
  }

  function loadProjectOverviewOperativesCount() {
    var countEl = contentEl && contentEl.querySelector('#project-overview-operatives-count');
    if (!countEl) return;
    var headers = getSessionHeaders();
    if (!headers['X-Manager-Id']) {
      countEl.textContent = '—';
      return;
    }
    fetch('/api/operatives', { headers: headers })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.success && data.operatives) {
          countEl.textContent = data.operatives.length;
        } else {
          countEl.textContent = '—';
        }
      })
      .catch(function () {
        countEl.textContent = '—';
      });
  }

  function formatOverviewDateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  }

  function planningOverviewStatusClass(status) {
    if (status === 'in_progress') return 'status-yellow';
    if (status === 'paused') return 'status-red';
    if (status === 'not_started') return 'status-yellow';
    return 'status-yellow';
  }

  function worklogOverviewStatusClass(status) {
    if (status === 'approved') return 'status-green';
    if (status === 'rejected') return 'status-red';
    return 'status-yellow';
  }

  function loadProjectOverviewLists() {
    if (!contentEl) return;
    var tasksLoading = contentEl.querySelector('#po-tasks-loading');
    var tasksEmpty = contentEl.querySelector('#po-tasks-empty');
    var tasksTable = contentEl.querySelector('#po-tasks-table');
    var tasksTbody = contentEl.querySelector('#po-tasks-tbody');
    var logsLoading = contentEl.querySelector('#po-logs-loading');
    var logsEmpty = contentEl.querySelector('#po-logs-empty');
    var logsTable = contentEl.querySelector('#po-logs-table');
    var logsTbody = contentEl.querySelector('#po-logs-tbody');

    function resetPoListsUi() {
      if (tasksLoading) {
        tasksLoading.textContent = 'Loading…';
        tasksLoading.classList.remove('d-none');
      }
      if (tasksEmpty) tasksEmpty.classList.add('d-none');
      if (tasksTable) tasksTable.classList.add('d-none');
      if (tasksTbody) tasksTbody.innerHTML = '';
      if (logsLoading) {
        logsLoading.textContent = 'Loading…';
        logsLoading.classList.remove('d-none');
      }
      if (logsEmpty) logsEmpty.classList.add('d-none');
      if (logsTable) logsTable.classList.add('d-none');
      if (logsTbody) logsTbody.innerHTML = '';
    }

    resetPoListsUi();

    var headers = getSessionHeaders();
    if (!headers['X-Manager-Id']) {
      if (tasksLoading) {
        tasksLoading.textContent = '—';
        tasksLoading.classList.remove('d-none');
      }
      if (logsLoading) {
        logsLoading.textContent = '—';
        logsLoading.classList.remove('d-none');
      }
      return;
    }

    fetch('/api/dashboard/overview-lists', { headers: headers })
      .then(function (res) {
        return res.json().catch(function () { return null; });
      })
      .then(function (data) {
        if (!data || !data.success) {
          if (tasksLoading) tasksLoading.classList.add('d-none');
          if (tasksEmpty) {
            tasksEmpty.textContent = 'Could not load tasks.';
            tasksEmpty.classList.remove('d-none');
          }
          if (logsLoading) logsLoading.classList.add('d-none');
          if (logsEmpty) {
            logsEmpty.textContent = 'Could not load work logs.';
            logsEmpty.classList.remove('d-none');
          }
          return;
        }

        var tlist = Array.isArray(data.tasks_deadline_next_7_days) ? data.tasks_deadline_next_7_days : [];
        if (tasksLoading) tasksLoading.classList.add('d-none');
        if (tlist.length === 0) {
          if (tasksEmpty) {
            tasksEmpty.textContent = 'No tasks with a deadline in the next 7 days.';
            tasksEmpty.classList.remove('d-none');
          }
          if (tasksTable) tasksTable.classList.add('d-none');
        } else {
          if (tasksEmpty) tasksEmpty.classList.add('d-none');
          if (tasksTable) tasksTable.classList.remove('d-none');
          if (tasksTbody) {
            var th = '';
            for (var i = 0; i < tlist.length; i++) {
              var t = tlist[i];
              var title = escapeHtml(t.title || '—');
              var dl = formatOverviewDateTime(t.deadline);
              var stRaw = (t.status || '').replace(/_/g, ' ');
              var st = escapeHtml(stRaw || '—');
              var sc = planningOverviewStatusClass(t.status);
              th += '<tr><td>' + title + '</td><td>' + escapeHtml(dl) + '</td><td><span class="status-badge ' + sc + '">' + st + '</span></td></tr>';
            }
            tasksTbody.innerHTML = th;
          }
        }

        var wlist = Array.isArray(data.worklogs_unapproved_queue)
          ? data.worklogs_unapproved_queue
          : (Array.isArray(data.worklogs_unapproved_over_7_days) ? data.worklogs_unapproved_over_7_days : []);
        if (logsLoading) logsLoading.classList.add('d-none');
        if (wlist.length === 0) {
          if (logsEmpty) {
            logsEmpty.textContent = 'No unapproved work logs. All caught up.';
            logsEmpty.classList.remove('d-none');
          }
          if (logsTable) logsTable.classList.add('d-none');
        } else {
          if (logsEmpty) logsEmpty.classList.add('d-none');
          if (logsTable) logsTable.classList.remove('d-none');
          if (logsTbody) {
            var wh = '';
            for (var j = 0; j < wlist.length; j++) {
              var w = wlist[j];
              var job = escapeHtml(w.job_display_id || '—');
              var stale = w.is_stale === true;
              var staleHtml = stale
                ? ' <span class="status-badge status-red" title="Awaiting approval for over 7 days">Stale</span>'
                : '';
              var worker = escapeHtml(w.worker_name || '—');
              var proj = escapeHtml(w.project || '—');
              var sub = formatOverviewDateTime(w.submitted_at);
              var wst = escapeHtml((w.status || '').replace(/_/g, ' ') || '—');
              var wsc = worklogOverviewStatusClass(w.status);
              var tot = w.total != null && !Number.isNaN(Number(w.total)) ? formatWorkLogsTotalCost(w.total) : '—';
              wh += '<tr' + (stale ? ' class="po-worklog-row-stale"' : '') + '><td>' + job + staleHtml + '</td><td>' + worker + '</td><td>' + proj + '</td><td>' + escapeHtml(sub) + '</td><td><span class="status-badge ' + wsc + '">' + wst + '</span></td><td>' + escapeHtml(tot) + '</td></tr>';
            }
            logsTbody.innerHTML = wh;
          }
        }
      })
      .catch(function () {
        if (tasksLoading) tasksLoading.classList.add('d-none');
        if (tasksEmpty) {
          tasksEmpty.textContent = 'Failed to load tasks.';
          tasksEmpty.classList.remove('d-none');
        }
        if (logsLoading) logsLoading.classList.add('d-none');
        if (logsEmpty) {
          logsEmpty.textContent = 'Failed to load work logs.';
          logsEmpty.classList.remove('d-none');
        }
      });
  }

  /** Operatives who clocked in today (server local day) + latest session project. */
  function loadProjectOverviewOperativeActivityToday() {
    if (!contentEl) return;
    var loading = contentEl.querySelector('#po-act-loading');
    var summary = contentEl.querySelector('#po-act-summary');
    var countEl = contentEl.querySelector('#po-act-count');
    var empty = contentEl.querySelector('#po-act-empty');
    var table = contentEl.querySelector('#po-act-table');
    var tbody = contentEl.querySelector('#po-act-tbody');

    if (loading) {
      loading.textContent = 'Loading…';
      loading.classList.remove('d-none');
    }
    if (summary) summary.classList.add('d-none');
    if (empty) {
      empty.textContent = 'No operatives have clocked in today yet.';
      empty.classList.add('d-none');
    }
    if (table) table.classList.add('d-none');
    if (tbody) tbody.innerHTML = '';

    var headers = getSessionHeaders();
    if (!headers['X-Manager-Id']) {
      if (loading) {
        loading.textContent = '—';
        loading.classList.remove('d-none');
      }
      return;
    }

    fetch('/api/dashboard/operative-activity-today', { headers: headers })
      .then(function (res) {
        return res.json().catch(function () { return null; });
      })
      .then(function (data) {
        if (loading) loading.classList.add('d-none');
        if (!data || !data.success) {
          if (summary) summary.classList.add('d-none');
          if (table) table.classList.add('d-none');
          if (empty) {
            empty.textContent = 'Could not load operative activity.';
            empty.classList.remove('d-none');
          }
          return;
        }

        var list = Array.isArray(data.operatives) ? data.operatives : [];
        var n = data.count != null ? Number(data.count) : list.length;
        if (countEl) countEl.textContent = String(n);

        if (list.length === 0) {
          if (summary) summary.classList.add('d-none');
          if (empty) {
            empty.textContent = 'No operatives have clocked in today yet.';
            empty.classList.remove('d-none');
          }
          if (table) table.classList.add('d-none');
          return;
        }

        if (summary) summary.classList.remove('d-none');
        if (empty) empty.classList.add('d-none');
        if (table) table.classList.remove('d-none');
        if (tbody) {
          var rows = '';
          for (var i = 0; i < list.length; i++) {
            var o = list[i];
            var name = escapeHtml(o.user_name || '—');
            var proj = o.project_name ? escapeHtml(o.project_name) : '—';
            var cin = escapeHtml(formatOverviewDateTime(o.clock_in));
            var onShift = o.is_on_shift === true || (o.clock_out == null && o.is_on_shift !== false);
            var statusLabel = onShift ? 'On shift' : 'Clocked out';
            var statusClass = onShift ? 'status-green' : 'status-yellow';
            rows += '<tr><td>' + name + '</td><td>' + proj + '</td><td>' + cin + '</td><td><span class="status-badge ' + statusClass + '">' + statusLabel + '</span></td></tr>';
          }
          tbody.innerHTML = rows;
        }
      })
      .catch(function () {
        if (loading) loading.classList.add('d-none');
        if (summary) summary.classList.add('d-none');
        if (table) table.classList.add('d-none');
        if (empty) {
          empty.textContent = 'Failed to load operative activity.';
          empty.classList.remove('d-none');
        }
      });
  }

  function loadOperativesData() {
    var headers = getSessionHeaders();
    if (!contentEl || !headers['X-Manager-Id']) return;
    var statsEl = contentEl.querySelector('#operatives-stats');
    var loading = contentEl.querySelector('#operatives-table-loading');
    var table = contentEl.querySelector('#operatives-table');
    var empty = contentEl.querySelector('#operatives-empty');
    if (statsEl) statsEl.innerHTML = '<div class="operatives-stats-loading">Loading statistics…</div>';
    if (loading) loading.classList.remove('d-none');
    if (table) table.classList.add('d-none');
    if (empty) empty.classList.add('d-none');
    fetch('/api/operatives', { headers: headers })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.success) {
          renderOperativesStats(data.stats || {});
          renderOperativesTable(data.operatives || []);
        } else {
          if (statsEl) statsEl.innerHTML = '<div class="operatives-stats-error">Failed to load.</div>';
          if (loading) loading.classList.add('d-none');
        }
      })
      .catch(function () {
        if (statsEl) statsEl.innerHTML = '<div class="operatives-stats-error">Failed to load.</div>';
        if (loading) loading.classList.add('d-none');
      });
  }

  function handleContentSubmit(e) {
    var form = e.target;
    if (form.id !== 'form-add-operative' && form.id !== 'form-add-supervisor') return;
    e.preventDefault();

    var firstName = (form.querySelector('[name="firstName"]') || {}).value;
    var surname = (form.querySelector('[name="surname"]') || {}).value;
    var email = (form.querySelector('[name="email"]') || {}).value.trim();
    var role = form.querySelector('[name="role"]');
    role = role ? role.value : null;
    var activeEl = form.querySelector('[name="active"]');
    var active = activeEl ? activeEl.checked : false;

    var invalidEmailEl = form.querySelector('.operatives-invalid');
    if (invalidEmailEl) invalidEmailEl.previousElementSibling && invalidEmailEl.previousElementSibling.classList.remove('is-invalid');
    if (!firstName || !surname) {
      showOperativesFeedback('Please fill in first name and last name.', true);
      return;
    }
    if (!email) {
      showOperativesFeedback('Email is required.', true);
      return;
    }
    if (!validateEmail(email)) {
      showOperativesFeedback('Please enter a valid email address.', true);
      if (form.querySelector('[name="email"]')) form.querySelector('[name="email"]').classList.add('is-invalid');
      return;
    }

    var isSupervisor = form.id === 'form-add-supervisor';
    var body = {
      firstName: firstName,
      surname: surname,
      email: email,
      active: active,
      isSupervisor: isSupervisor,
    };
    if (!isSupervisor && role) body.role = role;

    var submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    var headers = getSessionHeaders();
    headers['Content-Type'] = 'application/json';

    fetch('/api/operatives/add', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    })
      .then(function (res) { return res.json().then(function (data) { return { status: res.status, data: data }; }); })
      .then(function (result) {
        if (result.status >= 200 && result.status < 300) {
          hideOperativesFeedback();
          showOperativesFeedback(
            result.data.temporaryPassword
              ? result.data.message + ' Temporary password: ' + result.data.temporaryPassword + ' (share securely).'
              : result.data.message,
            false
          );
          var modal = form.closest('.operatives-modal');
          if (modal) {
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
          }
          form.reset();
          loadOperativesData();
        } else {
          var errMsg = result.data.message || 'Something went wrong. Please try again.';
          if (result.status === 403 && result.data && result.data.code === 'USER_LIMIT_REACHED') {
            window.alert(errMsg);
          } else {
            showOperativesFeedback(errMsg, true);
          }
        }
      })
      .catch(function () {
        showOperativesFeedback('Request failed. Please try again.', true);
      })
      .finally(function () {
        if (submitBtn) submitBtn.disabled = false;
      });
  }

  function initDashboard() {
    if (!contentEl) return;

    contentEl.addEventListener('click', handleContentClick);
    contentEl.addEventListener('submit', handleContentSubmit);
    contentEl.addEventListener('change', handleContentChange);

    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        logout();
      });
    }

    document.querySelector('.sidebar-nav').addEventListener('click', handleSidebarClick);

    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', function () {
        setMobileSidebarOpen(!sidebar.classList.contains('sidebar-open'));
      });
    }

    var overlay = document.getElementById('sidebar-overlay');
    if (overlay && sidebar) {
      overlay.addEventListener('click', function () {
        setMobileSidebarOpen(false);
      });
    }

    var mainWrap = document.querySelector('#dashboard-app .main-wrap');
    var touchToggle = document.getElementById('sidebar-touch-toggle');

    function isTouchWideSidebar() {
      try {
        return window.matchMedia('(hover: none) and (min-width: 992px)').matches;
      } catch (_) {
        return false;
      }
    }

    function syncSidebarTouchUi() {
      if (!touchToggle || !sidebar || !mainWrap) return;
      if (isTouchWideSidebar()) {
        touchToggle.removeAttribute('hidden');
      } else {
        touchToggle.setAttribute('hidden', '');
        sidebar.classList.remove('sidebar-expanded-touch');
        mainWrap.classList.remove('main-wrap--sidebar-expanded-touch');
      }
    }

    if (touchToggle && sidebar && mainWrap) {
      touchToggle.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!isTouchWideSidebar()) return;
        var expanded = !sidebar.classList.contains('sidebar-expanded-touch');
        sidebar.classList.toggle('sidebar-expanded-touch', expanded);
        mainWrap.classList.toggle('main-wrap--sidebar-expanded-touch', expanded);
        touchToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        touchToggle.setAttribute('aria-label', expanded ? 'Collapse navigation' : 'Expand navigation');
        var icon = touchToggle.querySelector('i');
        if (icon) {
          icon.className = expanded ? 'bi bi-chevron-double-left' : 'bi bi-chevron-double-right';
        }
      });
      window.addEventListener('resize', syncSidebarTouchUi);
      window.addEventListener('orientationchange', syncSidebarTouchUi);
      syncSidebarTouchUi();
    }

    window.addEventListener('popstate', function (e) {
      if (e.state && e.state.module) {
        loadModule(e.state.module, false);
      }
    });

    loadModule('project-overview', false);
  }

  function init() {
    showLoading(true);
    showAccessDenied(false);
    showDashboardApp(false);

    checkAccess().then(function (allowed) {
      if (allowed) initDashboard();
    });
  }

  window.getManagerSessionHeaders = getSessionHeaders;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
