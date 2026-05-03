/**
 * Shared “today’s project” chosen on Dashboard / Project Overview.
 * Stored in localStorage so all manager dashboard modules (including iframes, same origin) read the same id.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'proconix_dashboard_today_project_id';

  function getSelectedProjectId() {
    try {
      var v = global.localStorage.getItem(STORAGE_KEY);
      return v ? String(v).trim() : '';
    } catch (e) {
      return '';
    }
  }

  function setSelectedProjectId(id) {
    try {
      if (id != null && String(id).trim() !== '') {
        global.localStorage.setItem(STORAGE_KEY, String(id).trim());
      } else {
        global.localStorage.removeItem(STORAGE_KEY);
      }
      try {
        global.dispatchEvent(
          new CustomEvent('proconix-dashboard-project-changed', {
            detail: { projectId: id != null && String(id).trim() !== '' ? String(id).trim() : '' },
          })
        );
      } catch (e2) {}
    } catch (e) {}
  }

  /**
   * Select an option whose value equals the saved dashboard project id. Returns true if matched.
   */
  function applyToSelect(selectEl) {
    if (!selectEl || selectEl.tagName !== 'SELECT') return false;
    var want = getSelectedProjectId();
    if (!want) return false;
    var i;
    for (i = 0; i < selectEl.options.length; i++) {
      if (String(selectEl.options[i].value) === String(want)) {
        selectEl.selectedIndex = i;
        return true;
      }
    }
    return false;
  }

  global.ProconixDashboardProject = {
    STORAGE_KEY: STORAGE_KEY,
    getSelectedProjectId: getSelectedProjectId,
    setSelectedProjectId: setSelectedProjectId,
    applyToSelect: applyToSelect,
  };
})(typeof window !== 'undefined' ? window : this);
