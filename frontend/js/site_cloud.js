(function () {
  'use strict';

  var SESSION_KEY = 'proconix_manager_session';
  var stateFiles = [];

  function getSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function getHeaders() {
    var s = getSession();
    if (!s || s.manager_id == null || !s.email) return null;
    return {
      'X-Manager-Id': String(s.manager_id),
      'X-Manager-Email': s.email,
    };
  }

  function showError(msg) {
    var el = document.getElementById('scError');
    if (!el) return;
    if (!msg) {
      el.textContent = '';
      el.classList.add('sc-hidden');
      return;
    }
    el.textContent = msg;
    el.classList.remove('sc-hidden');
  }

  function formatSize(bytes) {
    var n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
    return (n / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  function formatDate(value) {
    var d = new Date(value || '');
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  function renderList() {
    var list = document.getElementById('scList');
    var count = document.getElementById('scCount');
    if (!list) return;
    var q = (document.getElementById('scSearch').value || '').trim().toLowerCase();
    var rows = stateFiles.filter(function (f) {
      return !q || String(f.original_name || '').toLowerCase().indexOf(q) !== -1;
    });
    if (count) count.textContent = rows.length + ' files';
    if (!rows.length) {
      list.innerHTML = '<div class="sc-empty">No files found.</div>';
      return;
    }
    list.innerHTML = rows
      .map(function (f) {
        return (
          '<article class="sc-row" data-name="' +
          escapeHtml(f.stored_name) +
          '">' +
          '<div><div class="sc-file-name">' +
          escapeHtml(f.original_name || f.stored_name) +
          '</div><div class="sc-muted">' +
          escapeHtml(f.mime_type || 'file') +
          '</div></div>' +
          '<div class="sc-muted">' +
          escapeHtml(formatDate(f.uploaded_at)) +
          '</div>' +
          '<div class="sc-muted">' +
          escapeHtml(formatSize(f.size_bytes)) +
          '</div>' +
          '<div class="sc-actions-row">' +
          '<button type="button" class="sc-btn-chip sc-download" data-name="' +
          escapeHtml(f.stored_name) +
          '">Download</button>' +
          '<button type="button" class="sc-btn-chip sc-danger sc-delete" data-name="' +
          escapeHtml(f.stored_name) +
          '">Delete</button>' +
          '</div>' +
          '</article>'
        );
      })
      .join('');
  }

  function loadFiles() {
    var headers = getHeaders();
    if (!headers) return showError('Please open this page from Manager Dashboard.');
    showError('');
    fetch('/api/site-cloud/files', { headers: headers, credentials: 'same-origin' })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (out) {
        if (!out.ok || !out.data || !out.data.success) {
          showError((out.data && out.data.message) || 'Could not load files.');
          return;
        }
        stateFiles = Array.isArray(out.data.files) ? out.data.files : [];
        renderList();
      })
      .catch(function () {
        showError('Network error while loading files.');
      });
  }

  function uploadSelected(file) {
    var headers = getHeaders();
    if (!headers) return showError('Please open this page from Manager Dashboard.');
    if (!file) return;
    var fd = new FormData();
    fd.append('file', file);
    showError('');
    fetch('/api/site-cloud/upload', {
      method: 'POST',
      headers: headers,
      body: fd,
      credentials: 'same-origin',
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (out) {
        if (!out.ok || !out.data || !out.data.success) {
          showError((out.data && out.data.message) || 'Upload failed.');
          return;
        }
        loadFiles();
      })
      .catch(function () {
        showError('Network error while uploading.');
      });
  }

  function downloadFile(storedName) {
    var headers = getHeaders();
    if (!headers || !storedName) return;
    fetch('/api/site-cloud/files/' + encodeURIComponent(storedName) + '/download', {
      headers: headers,
      credentials: 'same-origin',
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Download failed.');
        return Promise.all([res.blob(), res.headers.get('Content-Disposition') || '']);
      })
      .then(function (parts) {
        var blob = parts[0];
        var disposition = parts[1];
        var nameMatch = /filename="?([^"]+)"?/i.exec(disposition);
        var outName = nameMatch ? nameMatch[1] : storedName;
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = outName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      })
      .catch(function () {
        showError('Download failed.');
      });
  }

  function deleteFile(storedName) {
    var headers = getHeaders();
    if (!headers || !storedName) return;
    if (!window.confirm('Delete this file from cloud storage?')) return;
    fetch('/api/site-cloud/files/' + encodeURIComponent(storedName), {
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
        if (!out.ok || !out.data || !out.data.success) {
          showError((out.data && out.data.message) || 'Delete failed.');
          return;
        }
        loadFiles();
      })
      .catch(function () {
        showError('Delete failed.');
      });
  }

  function init() {
    var uploadBtn = document.getElementById('scUploadBtn');
    var fileInput = document.getElementById('scFileInput');
    var search = document.getElementById('scSearch');
    var list = document.getElementById('scList');

    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', function () {
        fileInput.click();
      });
      fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        uploadSelected(f);
        fileInput.value = '';
      });
    }

    if (search) {
      search.addEventListener('input', renderList);
    }

    if (list) {
      list.addEventListener('click', function (e) {
        var d = e.target.closest('.sc-download');
        if (d) return downloadFile(d.getAttribute('data-name'));
        var x = e.target.closest('.sc-delete');
        if (x) return deleteFile(x.getAttribute('data-name'));
      });
    }

    loadFiles();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

