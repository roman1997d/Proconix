/**
 * Supervisor dashboard – operative token + role Supervisor only.
 * Embeds: Material Management, Task & Planning, Site Snags, QA (project-scoped on server).
 */
(function () {
  'use strict';

  var TOKEN_KEY = 'proconix_operative_token';
  var USER_KEY = 'proconix_operative_user';

  var contentEl = document.getElementById('dashboard-content');
  var tabBar = document.getElementById('sv-tab-bar');
  var moduleTabLinks = function () {
    return document.querySelectorAll('#sv-tab-bar a[data-module]');
  };
  var headerTitle = document.querySelector('.header-title');
  var loadingEl = document.getElementById('dashboard-loading');
  var accessDeniedEl = document.getElementById('dashboard-access-denied');
  var dashboardAppEl = document.getElementById('dashboard-app');
  var companyNameEl = document.getElementById('dashboard-company-name');
  var userNameEl = document.getElementById('dashboard-user-name');
  var logoutBtn = document.getElementById('dashboard-logout-btn');

  var moduleTitles = {
    'manage-material': 'Material Management',
    'task-planning': 'Tasks',
    'site-snags': 'Site Snags',
    'quality-assurance': 'Quality Assurance',
  };

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
    window.location.href = '/index.html';
  }

  function getAuthHeaders() {
    var t = getToken();
    if (!t) return {};
    return { 'X-Operative-Token': t };
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

  function iframeModuleSrc(filename) {
    try {
      return new URL(filename, window.location.href).href;
    } catch (_) {
      return filename;
    }
  }

  function postSiteSnagsSessionToFrame(snIframe) {
    if (!snIframe || !snIframe.contentWindow) return;
    try {
      var raw = localStorage.getItem('proconix_manager_session') || sessionStorage.getItem('proconix_manager_session');
      var session = raw ? JSON.parse(raw) : null;
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

  function checkAccess() {
    var token = getToken();
    if (!token) {
      showLoading(false);
      showAccessDenied(true);
      showDashboardApp(false);
      return Promise.resolve(false);
    }

    return fetch('/api/operatives/me', {
      headers: { 'X-Operative-Token': token },
      credentials: 'same-origin',
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (out) {
        if (out.status !== 200 || !out.data || !out.data.success || !out.data.user) {
          throw new Error('Unauthorized');
        }
        if (String(out.data.user.role || '') !== 'Supervisor') {
          throw new Error('Not supervisor');
        }
        showLoading(false);
        showAccessDenied(false);
        showDashboardApp(true);
        var u = out.data.user;
        var label = u.name || u.email || '—';
        if (companyNameEl) companyNameEl.textContent = 'Supervisor';
        if (userNameEl) userNameEl.textContent = label;
        try {
          localStorage.setItem(USER_KEY, JSON.stringify(u));
        } catch (e) {}
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
    moduleTabLinks().forEach(function (link) {
      var on = link.getAttribute('data-module') === module;
      link.classList.toggle('active', on);
      if (on) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function updateHeaderTitle(module) {
    if (headerTitle && moduleTitles[module]) {
      headerTitle.textContent = moduleTitles[module];
    }
  }

  function loadModule(module, pushState) {
    if (!contentEl) return;

    if (module === 'task-planning') {
      contentEl.classList.add('dashboard-content-fade-out');
      setActiveItem(module);
      updateHeaderTitle(module);
      contentEl.innerHTML =
        '<iframe src="' +
        iframeModuleSrc('tasks_supervizor_view.html') +
        '" class="dashboard-qa-iframe" title="Task &amp; Planning"></iframe>';
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
        iframeModuleSrc('Quality_Assurance.html?supervisor=1') +
        '" class="dashboard-qa-iframe" title="Quality Assurance"></iframe>';
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
        iframeModuleSrc('supervisor_manage_material.html') +
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
        '<iframe id="iframe-site-snags-sv" src="' +
        iframeModuleSrc('Site_Snags.html?supervisor=1') +
        '" class="dashboard-qa-iframe" title="Site Snags"></iframe>';
      contentEl.classList.remove('dashboard-content-fade-out');
      contentEl.classList.add('dashboard-content-fade-in');
      var snIframe = document.getElementById('iframe-site-snags-sv');
      if (snIframe) {
        snIframe.addEventListener('load', function onLoad() {
          snIframe.removeEventListener('load', onLoad);
          postSiteSnagsSessionToFrame(snIframe);
          window.setTimeout(function () {
            postSiteSnagsSessionToFrame(snIframe);
          }, 150);
        });
      }
      if (pushState !== false) history.pushState({ module: module }, '', '#');
      return;
    }
  }

  function handleTabBarClick(e) {
    var link = e.target.closest('a[data-module]');
    if (!link) return;
    e.preventDefault();
    var module = link.getAttribute('data-module');
    if (module) loadModule(module);
  }

  function initDashboard() {
    if (!contentEl) return;

    if (tabBar) {
      tabBar.addEventListener('click', handleTabBarClick);
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', clearSession);
    }

    window.addEventListener('popstate', function (e) {
      if (e.state && e.state.module) {
        loadModule(e.state.module, false);
      }
    });

    loadModule('manage-material', false);
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
