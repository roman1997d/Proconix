(function () {
  'use strict';

  var SESSION_KEY = 'proconix_manager_session';
  var stateFiles = [];
  var stateStats = null;
  var stateSharedLinks = [];
  var TENANT_STORAGE_LIMIT_BYTES = 500 * 1024 * 1024;
  var activeFolder = 'files';
  var emailShareTarget = null;
  var activeNavMode = 'cloud';

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

  function showAccessDenied() {
    var denied = document.getElementById('scAccessDenied');
    var app = document.querySelector('.sc-app');
    if (app) app.classList.add('sc-hidden');
    if (denied) denied.classList.remove('sc-hidden');
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

  function isImageFile(file) {
    if (!file) return false;
    var mime = String(file.type || '').toLowerCase();
    if (mime.indexOf('image/') === 0) return true;
    var name = String(file.name || '').toLowerCase();
    return /\.(png|jpe?g|webp|gif|svg|heic)$/.test(name);
  }

  function renderList() {
    var list = document.getElementById('scList');
    var count = document.getElementById('scCount');
    if (!list) return;
    var mainQ = (document.getElementById('scSearch').value || '').trim().toLowerCase();
    var quickQ = (document.getElementById('scQuickSearch').value || '').trim().toLowerCase();
    var q = mainQ || quickQ;
    var rows;
    if (activeNavMode === 'shared') {
      rows = stateSharedLinks.filter(function (s) {
        return !q || String(s.original_name || '').toLowerCase().indexOf(q) !== -1;
      });
    } else {
      rows = stateFiles.filter(function (f) {
        return !q || String(f.original_name || '').toLowerCase().indexOf(q) !== -1;
      });
    }
    if (count) count.textContent = rows.length + ' files';
    if (!rows.length) {
      list.innerHTML = '<div class="sc-empty">' + (activeNavMode === 'shared' ? 'No shared links found.' : 'No files found.') + '</div>';
      return;
    }
    if (activeNavMode === 'shared') {
      list.innerHTML = rows
        .map(function (s) {
          return (
            '<article class="sc-row">' +
            '<div><div class="sc-file-name">' +
            escapeHtml(s.original_name || 'Shared file') +
            '</div><div class="sc-muted">Share token</div></div>' +
            '<div><span class="sc-folder-badge sc-folder-badge--files"><i class="bi bi-link-45deg"></i>Shared</span></div>' +
            '<div class="sc-muted">' +
            escapeHtml(formatDate(s.created_at)) +
            '</div>' +
            '<div class="sc-muted">' +
            escapeHtml(formatDate(s.expires_at)) +
            '</div>' +
            '<div class="sc-actions-row">' +
            '<button type="button" class="sc-btn-chip sc-shared-open" data-view="' +
            escapeHtml(s.view_path || '') +
            '">Open</button>' +
            '<button type="button" class="sc-btn-chip sc-shared-copy" data-view="' +
            escapeHtml(s.view_path || '') +
            '">Copy link</button>' +
            '</div>' +
            '<div class="sc-actions-row">' +
            '<button type="button" class="sc-btn-chip sc-danger sc-shared-revoke" data-token="' +
            escapeHtml(s.token || '') +
            '">Revoke</button>' +
            '</div>' +
            '</article>'
          );
        })
        .join('');
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
          '<div class="sc-actions-row">' +
          '<button type="button" class="sc-btn-chip sc-share-link" data-name="' +
          escapeHtml(f.stored_name) +
          '" data-original="' +
          escapeHtml(f.original_name || f.stored_name) +
          '">Generate link</button>' +
          '<button type="button" class="sc-btn-chip sc-share-email" data-name="' +
          escapeHtml(f.stored_name) +
          '" data-original="' +
          escapeHtml(f.original_name || f.stored_name) +
          '">Send via email</button>' +
          '</div>' +
          '</article>'
        );
      })
      .join('');
  }

  function createShareLink(storedName) {
    var headers = getHeaders();
    if (!headers || !storedName) return Promise.reject(new Error('Manager session required.'));
    return fetch('/api/site-cloud/files/' + encodeURIComponent(storedName) + '/share-link', {
      method: 'POST',
      headers: headers,
      credentials: 'same-origin',
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (out) {
        if (!out.ok || !out.data || !out.data.success || !out.data.share || !out.data.share.token) {
          throw new Error((out.data && out.data.message) || 'Could not generate share link.');
        }
        return window.location.origin + '/site_cloud_share_view.html?token=' + encodeURIComponent(out.data.share.token);
      });
  }

  function generateShareLink(storedName) {
    createShareLink(storedName)
      .then(function (link) {
        var input = document.getElementById('scShareLinkInput');
        var modal = document.getElementById('scShareModal');
        if (input) {
          input.value = link;
          input.focus();
          input.select();
        }
        if (modal) modal.classList.remove('sc-hidden');
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(link).catch(function () {});
        }
      })
      .catch(function (err) {
        showError((err && err.message) || 'Share link failed.');
      });
  }

  function closeShareModal() {
    var modal = document.getElementById('scShareModal');
    if (modal) modal.classList.add('sc-hidden');
  }

  function copyShareInput() {
    var input = document.getElementById('scShareLinkInput');
    if (!input) return;
    input.focus();
    input.select();
    var val = input.value || '';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(val).catch(function () {});
      return;
    }
    document.execCommand('copy');
  }

  function openEmailModal(storedName, originalName) {
    emailShareTarget = { storedName: storedName, originalName: originalName || storedName };
    var modal = document.getElementById('scEmailModal');
    var fileLabel = document.getElementById('scEmailFileLabel');
    var input = document.getElementById('scEmailTo');
    if (fileLabel) fileLabel.textContent = 'File: ' + (originalName || storedName);
    if (input) input.value = '';
    if (modal) modal.classList.remove('sc-hidden');
  }

  function closeEmailModal() {
    var modal = document.getElementById('scEmailModal');
    if (modal) modal.classList.add('sc-hidden');
    emailShareTarget = null;
  }

  function sendShareEmail() {
    var headers = getHeaders();
    var input = document.getElementById('scEmailTo');
    var btn = document.getElementById('scEmailSendBtn');
    if (!headers || !emailShareTarget || !input) return;
    var email = String(input.value || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError('Please enter a valid recipient email.');
      return;
    }
    if (btn) btn.disabled = true;
    fetch('/api/site-cloud/files/' + encodeURIComponent(emailShareTarget.storedName) + '/send-email', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
      credentials: 'same-origin',
      body: JSON.stringify({ email: email }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (out) {
        if (!out.ok || !out.data || !out.data.success) {
          showError((out.data && out.data.message) || 'Sending email failed.');
          return;
        }
        showError('');
        closeEmailModal();
        window.alert('File sent successfully.');
      })
      .catch(function () {
        showError('Network error while sending email.');
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
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
    if (activeNavMode === 'shared') return;
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

  function loadSharedLinks() {
    var headers = getHeaders();
    if (!headers) return;
    showError('');
    setLoading(true, 'Loading shared links...');
    fetch('/api/site-cloud/shared-links', {
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
          showError((out.data && out.data.message) || 'Could not load shared links.');
          return;
        }
        stateSharedLinks = Array.isArray(out.data.links) ? out.data.links : [];
        renderList();
      })
      .catch(function () {
        showError('Network error while loading shared links.');
      })
      .finally(function () {
        setLoading(false);
      });
  }

  function revokeSharedLink(token) {
    var headers = getHeaders();
    if (!headers || !token) return;
    fetch('/api/site-cloud/shared-links/' + encodeURIComponent(token), {
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
          showError((out.data && out.data.message) || 'Could not revoke shared link.');
          return;
        }
        loadSharedLinks();
      })
      .catch(function () {
        showError('Network error while revoking shared link.');
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
    var uploadFolder = isImageFile(file) ? 'images' : activeFolder;
    var fd = new FormData();
    fd.append('file', file);
    fd.append('folder', uploadFolder);
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
    var headers0 = getHeaders();
    if (!headers0) {
      showAccessDenied();
      return;
    }
    var uploadBtn = document.getElementById('scUploadBtn');
    var fileInput = document.getElementById('scFileInput');
    var search = document.getElementById('scSearch');
    var quickSearch = document.getElementById('scQuickSearch');
    var list = document.getElementById('scList');
    var folderCards = document.getElementById('scFolderCards');
    var sideNav = document.querySelector('.sc-nav');
    var viewerClose = document.getElementById('scViewerClose');
    var viewerBackdrop = document.getElementById('scViewerBackdrop');
    var emailClose = document.getElementById('scEmailClose');
    var emailBackdrop = document.getElementById('scEmailBackdrop');
    var emailCancel = document.getElementById('scEmailCancel');
    var emailSendBtn = document.getElementById('scEmailSendBtn');
    var shareClose = document.getElementById('scShareClose');
    var shareBackdrop = document.getElementById('scShareBackdrop');
    var shareDone = document.getElementById('scShareDoneBtn');
    var shareCopy = document.getElementById('scShareCopyBtn');

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
        var s = e.target.closest('.sc-share-link');
        if (s) return generateShareLink(s.getAttribute('data-name'));
        var m = e.target.closest('.sc-share-email');
        if (m) return openEmailModal(m.getAttribute('data-name'), m.getAttribute('data-original'));
        var so = e.target.closest('.sc-shared-open');
        if (so) return window.open(so.getAttribute('data-view'), '_blank');
        var sc = e.target.closest('.sc-shared-copy');
        if (sc) {
          var sharedUrl = window.location.origin + String(sc.getAttribute('data-view') || '');
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(sharedUrl).catch(function () {});
          return;
        }
        var sr = e.target.closest('.sc-shared-revoke');
        if (sr) return revokeSharedLink(sr.getAttribute('data-token'));
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
    if (sideNav) {
      sideNav.addEventListener('click', function (e) {
        var link = e.target.closest('.sc-nav-item[data-nav-mode]');
        if (!link) return;
        e.preventDefault();
        var mode = String(link.getAttribute('data-nav-mode') || 'cloud');
        activeNavMode = mode;
        sideNav.querySelectorAll('.sc-nav-item[data-nav-mode]').forEach(function (el) {
          el.classList.toggle('is-active', el === link);
        });
        if (mode === 'shared') {
          loadSharedLinks();
        } else {
          loadFiles();
        }
      });
    }

    if (viewerClose) viewerClose.addEventListener('click', closeViewer);
    if (viewerBackdrop) viewerBackdrop.addEventListener('click', closeViewer);
    if (emailClose) emailClose.addEventListener('click', closeEmailModal);
    if (emailBackdrop) emailBackdrop.addEventListener('click', closeEmailModal);
    if (emailCancel) emailCancel.addEventListener('click', closeEmailModal);
    if (emailSendBtn) emailSendBtn.addEventListener('click', sendShareEmail);
    if (shareClose) shareClose.addEventListener('click', closeShareModal);
    if (shareBackdrop) shareBackdrop.addEventListener('click', closeShareModal);
    if (shareDone) shareDone.addEventListener('click', closeShareModal);
    if (shareCopy) shareCopy.addEventListener('click', copyShareInput);

    loadStats();
    loadFiles();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

