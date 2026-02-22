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

  var moduleTitles = {
    'project-overview': 'Project Overview',
    'projects': 'My Projects',
    'project-builder': 'Project Builder',
    'task-management': 'Task Management',
    'material-management': 'Material Management',
    'risk-management': 'Risk Management',
    'operatives': 'Operatives',
    'worklogs': 'Work Logs',
    'plants': 'Plants (Equipment)',
    'accounting': 'Accounting',
    'resources-files': 'Resources & Files',
    'reports': 'Reports',
    'complains': 'Complains',
    'issues': 'Issues',
    'quality-assurance': 'Quality Assurance',
  };

  function getSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
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

  function loadModule(module, pushState) {
    if (!contentEl) return;

    if (module === 'quality-assurance') {
      contentEl.classList.add('dashboard-content-fade-out');
      setActiveItem(module);
      updateHeaderTitle(module);
      contentEl.innerHTML = '<iframe src="Quality_Assurance.html" class="dashboard-qa-iframe" title="Quality Assurance Module"></iframe>';
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
        }
        if (module === 'projects' && typeof window.initProjectsModule === 'function') {
          window.initProjectsModule();
        }
        if (module === 'worklogs' && typeof window.initWorkLogsModule === 'function') {
          window.initWorkLogsModule();
        }
        if (module === 'project-overview') {
          loadProjectOverviewOperativesCount();
        }
        if (typeof window.initDashboardCharts === 'function') {
          window.initDashboardCharts();
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

  function handleSidebarClick(e) {
    var link = e.target.closest('[data-module]');
    if (!link) return;
    e.preventDefault();
    var module = link.getAttribute('data-module');
    if (module) loadModule(module);
    if (sidebar && window.innerWidth < 992) {
      sidebar.classList.remove('sidebar-open');
    }
  }

  function handleContentClick(e) {
    var target = e.target;
    if (target.closest('[data-action="add-operative"]')) {
      e.preventDefault();
      var modal = contentEl && contentEl.querySelector('#modal-add-operative');
      if (modal) {
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
      }
      return;
    }
    if (target.closest('[data-action="add-supervisor"]')) {
      e.preventDefault();
      var modal = contentEl && contentEl.querySelector('#modal-add-supervisor');
      if (modal) {
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
      }
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
          showOperativesFeedback(result.data.message || 'Something went wrong. Please try again.', true);
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
        sidebar.classList.toggle('sidebar-open');
        var overlay = document.getElementById('sidebar-overlay');
        if (overlay) overlay.classList.toggle('visible', sidebar.classList.contains('sidebar-open'));
      });
    }

    var overlay = document.getElementById('sidebar-overlay');
    if (overlay && sidebar) {
      overlay.addEventListener('click', function () {
        sidebar.classList.remove('sidebar-open');
        overlay.classList.remove('visible');
      });
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
