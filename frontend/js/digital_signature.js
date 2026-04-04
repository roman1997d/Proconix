/**
 * Documents & Digital Signatures — iframe module (manager dashboard).
 * Placeholder until GET /api/documents/list and related routes exist.
 */
(function () {
  'use strict';

  var SESSION_KEY = 'proconix_manager_session';

  function getSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function init() {
    var session = getSession();
    var btn = document.getElementById('dsBtnNewDoc');
    var search = document.getElementById('dsSearch');
    if (!session || session.manager_id == null) {
      if (btn) btn.setAttribute('title', 'Sign in from the manager dashboard first.');
      return;
    }
    if (btn) {
      btn.removeAttribute('disabled');
      btn.setAttribute('title', 'Document pipeline will open when the backend module is connected.');
    }
    if (search) search.removeAttribute('disabled');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
