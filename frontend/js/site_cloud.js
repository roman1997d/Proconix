(function () {
  'use strict';

  var SESSION_KEY = 'proconix_manager_session';
  var stateFiles = [];
  var stateStats = null;
  var TENANT_STORAGE_LIMIT_BYTES = 500 * 1024 * 1024;
  var activeFolder = 'files';

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

  function setLoading(on, text) {
    var loader = document.getElementById('scLoader');
    var loaderText = document.getElementById('scLoaderText');
    var uploadBtn = document.getElementById('scUploadBtn');
    if (!loader) return;
    if (!on) {
      loader.classList.add('sc-hidden');
      if (uploadBtn) uploadBtn.disabled = false;
      return;
    }
    if (loaderText && text) loaderText.textContent = text;
    loader.classList.remove('sc-hidden');
    if (uploadBtn) uploadBtn.disabled = true;
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

  function folderMeta(folder) {
    var f = String(folder || 'files').toLowerCase();
    if (f === 'drawing') return { label: 'Drawing', icon: 'bi-vector-pen', cls: 'sc-folder-badge--drawing' };
    if (f === 'images') return { label: 'Images', icon: 'bi-image', cls: 'sc-folder-badge--images' };
    return { label: 'Files', icon: 'bi-folder2-open', cls: 'sc-folder-badge--files' };
  }

  function previewType(fileName) {
    var ext = (String(fileName || '').split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].indexOf(ext) >= 0) return 'image';
    if (['mp4', 'mov'].indexOf(ext) >= 0) return 'video';
    if (['mp3', 'wav'].indexOf(ext) >= 0) return 'audio';
    if (['txt', 'csv', 'json', 'xml', 'html', 'htm'].indexOf(ext) >= 0) return 'text';
    return 'none';
  }

  function renderList() {
    var list = document.getElementById('scList');
    var count = document.getElementById('scCount');
    if (!list) return;
    var mainQ = (document.getElementById('scSearch').value || '').trim().toLowerCase();
    var quickQ = (document.getElementById('scQuickSearch').value || '').trim().toLowerCase();
    var q = mainQ || quickQ;
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
        var fm = folderMeta(f.folder);
        return (
          '<article class="sc-row" data-name="' +
          escapeHtml(f.stored_name) +
          '">' +
          '<div><button type="button" class="sc-file-name sc-file-link sc-preview" data-name="' +
          escapeHtml(f.stored_name) +
          '" data-original="' +
          escapeHtml(f.original_name || f.stored_name) +
          '">' +
          escapeHtml(f.original_name || f.stored_name) +
          '</button><div class="sc-muted">' +
          escapeHtml(f.mime_type || 'file') +
          '</div></div>' +
          '<div><span class="sc-folder-badge ' +
          fm.cls +
          '"><i class="bi ' +
          fm.icon +
          '"></i>' +
          escapeHtml(fm.label) +
          '</span></div>' +
          '<div class="sc-muted">' +
          escapeHtml(formatDate(f.uploaded_at)) +
          '</div>' +
          '<div class="sc-muted">' +
          escapeHtml(formatSize(f.size_bytes)) +
          '</div>' +
          '<div class="sc-actions-row">' +
          '<button type="button" class="sc-btn-chip sc-view sc-preview" data-name="' +
          escapeHtml(f.stored_name) +
          '" data-original="' +
          escapeHtml(f.original_name || f.stored_name) +
          '">View</button>' +
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

  function renderStats() {
    var filesEl = document.getElementById('scStatFiles');
    var storageEl = document.getElementById('scStatStorage');
    var avgEl = document.getElementById('scStatAverage');
    var usageEl = document.getElementById('scStatUsage');
    var progressBar = document.getElementById('scStorageProgressBar');
    var progressText = document.getElementById('scStorageProgressText');
    var total = stateStats ? Number(stateStats.total_files) || 0 : 0;
    var used = stateStats ? Number(stateStats.used_bytes) || 0 : 0;
    var avg = stateStats ? Number(stateStats.average_bytes) || 0 : 0;
    var limit = stateStats ? Number(stateStats.limit_bytes) || TENANT_STORAGE_LIMIT_BYTES : TENANT_STORAGE_LIMIT_BYTES;
    var percent = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
    if (filesEl) filesEl.textContent = String(total);
    if (storageEl) storageEl.textContent = formatSize(used);
    if (avgEl) avgEl.textContent = formatSize(avg);
    if (usageEl) {
      usageEl.textContent =
        'You are using ' +
        formatSize(used) +
        ' of ' +
        formatSize(limit) +
        ' available storage.';
    }
    if (progressBar) progressBar.style.width = percent.toFixed(1) + '%';
    if (progressText) progressText.textContent = percent.toFixed(1) + '%';
  }

  function loadFiles() {
    var headers = getHeaders();
    if (!headers) return showError('Please open this page from Manager Dashboard.');
    showError('');
    setLoading(true, 'Loading files...');
    fetch('/api/site-cloud/files?folder=' + encodeURIComponent(activeFolder), {
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
          showError((out.data && out.data.message) || 'Could not load files.');
          return;
        }
        stateFiles = Array.isArray(out.data.files) ? out.data.files : [];
        renderList();
      })
      .catch(function () {
        showError('Network error while loading files.');
      })
      .finally(function () {
        setLoading(false);
      });
  }

  function loadStats() {
    var headers = getHeaders();
    if (!headers) return;
    function setStatsFromFiles(allFiles) {
      var safe = Array.isArray(allFiles) ? allFiles : [];
      var total = safe.length;
      var used = safe.reduce(function (sum, f) {
        return sum + (Number(f.size_bytes) || 0);
      }, 0);
      var limit = TENANT_STORAGE_LIMIT_BYTES;
      stateStats = {
        total_files: total,
        used_bytes: used,
        average_bytes: total ? Math.round(used / total) : 0,
        limit_bytes: limit,
      };
      renderStats();
    }

    function loadStatsFallback() {
      var folders = ['files', 'drawing', 'images'];
      Promise.all(
        folders.map(function (folder) {
          return fetch('/api/site-cloud/files?folder=' + encodeURIComponent(folder), {
            headers: headers,
            credentials: 'same-origin',
          })
            .then(function (res) {
              return res.json().then(function (data) {
                return { ok: res.ok, data: data };
              });
            })
            .then(function (out) {
              if (!out.ok || !out.data || !out.data.success) return [];
              return Array.isArray(out.data.files) ? out.data.files : [];
            })
            .catch(function () {
              return [];
            });
        })
      ).then(function (grouped) {
        var all = [].concat.apply([], grouped || []);
        setStatsFromFiles(all);
      });
    }

    fetch('/api/site-cloud/stats', {
      headers: headers,
      credentials: 'same-origin',
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (out) {
        if (!out.ok || !out.data || !out.data.success || !out.data.stats) {
          loadStatsFallback();
          return;
        }
        stateStats = out.data.stats;
        renderStats();
      })
      .catch(function () {
        loadStatsFallback();
      });
  }

  function uploadSelected(file) {
    var headers = getHeaders();
    if (!headers) return showError('Please open this page from Manager Dashboard.');
    if (!file) return;
    var fd = new FormData();
    fd.append('file', file);
    fd.append('folder', activeFolder);
    showError('');
    setLoading(true, 'Scanning file and uploading...');
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
        loadStats();
        loadFiles();
      })
      .catch(function () {
        showError('Network error while uploading.');
      })
      .finally(function () {
        setLoading(false);
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
        loadStats();
        loadFiles();
      })
      .catch(function () {
        showError('Delete failed.');
      });
  }

  function openViewer(storedName, originalName) {
    var type = previewType(originalName || storedName);
    if (type === 'none') {
      showError('In-app preview is not available for this file type. Use Download.');
      return;
    }
    var viewer = document.getElementById('scViewer');
    var body = document.getElementById('scViewerBody');
    var title = document.getElementById('scViewerTitle');
    if (!viewer || !body || !title) return;
    var headers = getHeaders();
    if (!headers) {
      showError('Please open this page from Manager Dashboard.');
      return;
    }
    var src = '/api/site-cloud/files/' + encodeURIComponent(storedName) + '/view';
    title.textContent = 'Preview - ' + (originalName || storedName);
    body.innerHTML = '<div class="sc-empty">Loading preview...</div>';
    viewer.classList.remove('sc-hidden');
    fetch(src, {
      headers: headers,
      credentials: 'same-origin',
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (data) {
            throw new Error((data && data.message) || 'Preview failed.');
          });
        }
        return Promise.all([res.blob(), res.headers.get('Content-Type') || 'application/octet-stream']);
      })
      .then(function (parts) {
        var blob = parts[0];
        var contentType = parts[1];
        var objectUrl = URL.createObjectURL(new Blob([blob], { type: contentType }));
        body.setAttribute('data-object-url', objectUrl);
        if (type === 'image') {
          body.innerHTML = '<img alt="Preview image" src="' + objectUrl + '">';
        } else if (type === 'video') {
          body.innerHTML =
            '<video controls preload="metadata"><source src="' + objectUrl + '" type="' + escapeHtml(contentType) + '"></video>';
        } else if (type === 'audio') {
          body.innerHTML =
            '<audio controls preload="metadata"><source src="' + objectUrl + '" type="' + escapeHtml(contentType) + '"></audio>';
        } else {
          body.innerHTML = '<iframe title="Document preview" src="' + objectUrl + '"></iframe>';
        }
      })
      .catch(function (err) {
        closeViewer();
        showError((err && err.message) || 'Preview failed.');
      });
  }

  function closeViewer() {
    var viewer = document.getElementById('scViewer');
    var body = document.getElementById('scViewerBody');
    var objectUrl = body ? body.getAttribute('data-object-url') : '';
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      body.removeAttribute('data-object-url');
    }
    if (viewer) viewer.classList.add('sc-hidden');
    if (body) body.innerHTML = '';
  }

  function init() {
    var uploadBtn = document.getElementById('scUploadBtn');
    var fileInput = document.getElementById('scFileInput');
    var search = document.getElementById('scSearch');
    var quickSearch = document.getElementById('scQuickSearch');
    var list = document.getElementById('scList');
    var folderCards = document.getElementById('scFolderCards');
    var viewerClose = document.getElementById('scViewerClose');
    var viewerBackdrop = document.getElementById('scViewerBackdrop');

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
      search.addEventListener('input', function () {
        if (quickSearch) quickSearch.value = '';
        renderList();
      });
    }
    if (quickSearch) {
      quickSearch.addEventListener('input', function () {
        if (search) search.value = '';
        renderList();
      });
    }

    if (list) {
      list.addEventListener('click', function (e) {
        var p = e.target.closest('.sc-preview');
        if (p) return openViewer(p.getAttribute('data-name'), p.getAttribute('data-original'));
        var d = e.target.closest('.sc-download');
        if (d) return downloadFile(d.getAttribute('data-name'));
        var x = e.target.closest('.sc-delete');
        if (x) return deleteFile(x.getAttribute('data-name'));
      });
    }

    if (folderCards) {
      folderCards.addEventListener('click', function (e) {
        var card = e.target.closest('.sc-folder-card');
        if (!card) return;
        var folder = (card.getAttribute('data-folder') || 'files').toLowerCase();
        activeFolder = folder;
        folderCards.querySelectorAll('.sc-folder-card').forEach(function (el) {
          el.classList.toggle('is-highlight', el === card);
        });
        loadFiles();
      });
    }

    if (viewerClose) viewerClose.addEventListener('click', closeViewer);
    if (viewerBackdrop) viewerBackdrop.addEventListener('click', closeViewer);

    loadStats();
    loadFiles();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

