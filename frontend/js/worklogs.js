/**
 * Work Logs module – uses backend API when available.
 * Manager: list, view, edit, approve, reject, archive (session via manager headers).
 */

(function () {
  'use strict';

  var SESSION_KEY = 'proconix_manager_session';

  function getSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function getHeaders() {
    var session = getSession();
    if (!session || session.manager_id == null || !session.email) return null;
    return {
      'Content-Type': 'application/json',
      'X-Manager-Id': String(session.manager_id),
      'X-Manager-Email': session.email,
    };
  }

  /** For multipart / Site Cloud (do not set Content-Type). */
  function getManagerCloudHeaders() {
    var session = getSession();
    if (!session || session.manager_id == null || !session.email) return null;
    return {
      'X-Manager-Id': String(session.manager_id),
      'X-Manager-Email': session.email,
    };
  }

  function absoluteUrlForUploadPath(p) {
    var s = String(p || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (s.indexOf('/') !== 0) s = '/' + s;
    return window.location.origin + s;
  }

  function loadWorklogCloudFolderOptions(selectEl, onDone) {
    if (!selectEl) return;
    var h = getManagerCloudHeaders();
    selectEl.innerHTML = '<option value="">Loading folders…</option>';
    selectEl.disabled = true;
    if (!h) {
      selectEl.innerHTML = '<option value="">Manager session required</option>';
      if (onDone) onDone(false);
      return;
    }
    fetch('/api/site-cloud/folders', { headers: h, credentials: 'same-origin' })
      .then(function (res) {
        return res.json().then(function (data) {
          return { res: res, data: data };
        });
      })
      .then(function (out) {
        if (!out.res.ok || !out.data || !out.data.success) {
          selectEl.innerHTML = '<option value="">Could not load folders</option>';
          if (onDone) onDone(false);
          return;
        }
        var defaults = ['files', 'drawing', 'images'];
        var extras = Array.isArray(out.data.folders) ? out.data.folders : [];
        var seen = {};
        selectEl.innerHTML = '<option value="">Select folder</option>';
        defaults.concat(extras).forEach(function (name) {
          var v = String(name || '').trim();
          if (!v || seen[v]) return;
          seen[v] = true;
          var opt = document.createElement('option');
          opt.value = v;
          opt.textContent = v;
          selectEl.appendChild(opt);
        });
        selectEl.disabled = selectEl.options.length <= 1;
        if (onDone) onDone(true);
      })
      .catch(function () {
        selectEl.innerHTML = '<option value="">Network error</option>';
        if (onDone) onDone(false);
      });
  }

  function wireInvoiceSaveToCloud(content) {
    var wrap = content.querySelector('.worklogs-details-invoice-save-cloud');
    if (!wrap) return;
    var selectEl = wrap.querySelector('.worklogs-cloud-folder-select');
    var saveBtn = wrap.querySelector('.worklogs-btn-save-invoice-cloud');
    var fb = wrap.querySelector('.worklogs-cloud-save-feedback');
    var encoded = wrap.getAttribute('data-invoice-encoded');
    var invoicePath = '';
    try {
      invoicePath = encoded ? decodeURIComponent(encoded) : '';
    } catch (_) {
      invoicePath = '';
    }
    if (!invoicePath || !selectEl || !saveBtn) return;

    function setFeedback(msg, isError) {
      if (!fb) return;
      fb.textContent = msg || '';
      fb.className = 'worklogs-cloud-save-feedback' + (msg ? (isError ? ' is-error' : ' is-success') : '');
      fb.style.display = msg ? 'block' : 'none';
    }

    function updateSaveDisabled() {
      saveBtn.disabled = !selectEl.value || !invoicePath;
    }

    loadWorklogCloudFolderOptions(selectEl, function () {
      updateSaveDisabled();
    });

    selectEl.addEventListener('change', updateSaveDisabled);

    saveBtn.addEventListener('click', function () {
      var folder = selectEl.value;
      if (!folder || !invoicePath) return;
      var hdr = getManagerCloudHeaders();
      if (!hdr) {
        setFeedback('Manager session required.', true);
        return;
      }
      setFeedback('');
      saveBtn.disabled = true;
      var url = absoluteUrlForUploadPath(invoicePath);
      fetch(url, { credentials: 'same-origin' })
        .then(function (res) {
          if (!res.ok) throw new Error('load');
          return res.blob();
        })
        .then(function (blob) {
          var baseName = String(invoicePath).split(/[/\\]/).pop() || 'work-log-invoice.bin';
          var mime = blob.type || 'application/octet-stream';
          var file = new File([blob], baseName, { type: mime });
          var fd = new FormData();
          fd.append('file', file, baseName);
          fd.append('folder', folder);
          return fetch('/api/site-cloud/upload', {
            method: 'POST',
            headers: hdr,
            body: fd,
            credentials: 'same-origin',
          }).then(function (r) {
            return r.json().then(function (data) {
              return { ok: r.ok, data: data };
            });
          });
        })
        .then(function (out) {
          if (!out || !out.ok || !out.data || !out.data.success) {
            setFeedback((out && out.data && out.data.message) || 'Could not save to cloud.', true);
            return;
          }
          setFeedback('Saved to cloud folder "' + folder + '".', false);
        })
        .catch(function () {
          setFeedback('Could not load invoice file or upload failed.', true);
        })
        .finally(function () {
          saveBtn.disabled = !selectEl.value;
        });
    });
  }

  function loadJobsFromApi(filters) {
    var headers = getHeaders();
    if (!headers) return Promise.resolve([]);
    var q = [];
    if (filters.worker) q.push('worker=' + encodeURIComponent(filters.worker));
    if (filters.dateFrom) q.push('dateFrom=' + encodeURIComponent(filters.dateFrom));
    if (filters.dateTo) q.push('dateTo=' + encodeURIComponent(filters.dateTo));
    if (filters.location) q.push('location=' + encodeURIComponent(filters.location));
    if (filters.status) q.push('status=' + encodeURIComponent(filters.status));
    if (filters.search) q.push('search=' + encodeURIComponent(filters.search));
    var url = '/api/worklogs' + (q.length ? '?' + q.join('&') : '');
    return fetch(url, { headers: headers })
      .then(function (res) {
        if (res.status === 401) return [];
        if (!res.ok) return [];
        return res.json();
      })
      .then(function (data) {
        return (data && data.jobs && Array.isArray(data.jobs)) ? data.jobs : [];
      })
      .catch(function () { return []; });
  }

  function loadWorkersFromApi() {
    var headers = getHeaders();
    if (!headers) return Promise.resolve([]);
    return fetch('/api/worklogs/workers', { headers: headers })
      .then(function (res) {
        if (!res.ok) return [];
        return res.json();
      })
      .then(function (data) {
        return (data && data.workers && Array.isArray(data.workers)) ? data.workers : [];
      })
      .catch(function () { return []; });
  }

  function getLocation(job) {
    var parts = [job.project, job.block, job.floor, job.apartment, job.zone].filter(Boolean);
    return parts.join(' / ') || '—';
  }

  /** Stored total, else QA-computed total, else qty×unit. */
  function getWorkLogAmountNumeric(job) {
    if (!job) return 0;
    if (job.total != null && job.total !== '' && !isNaN(Number(job.total))) return Number(job.total);
    if (job.qaPriceWorkTotal != null && !isNaN(Number(job.qaPriceWorkTotal))) return Number(job.qaPriceWorkTotal);
    if (job.quantity != null && job.unitPrice != null && !isNaN(Number(job.quantity)) && !isNaN(Number(job.unitPrice))) {
      return Number(job.quantity) * Number(job.unitPrice);
    }
    return 0;
  }

  /** For table and Job details: prefer DB total, else QA sum from API. */
  function formatWorkLogTotalDisplay(job) {
    if (!job) return '—';
    if (job.total != null && job.total !== '' && !isNaN(Number(job.total))) return Number(job.total).toFixed(2);
    if (job.qaPriceWorkTotal != null && !isNaN(Number(job.qaPriceWorkTotal))) return Number(job.qaPriceWorkTotal).toFixed(2);
    if (job.quantity != null && job.unitPrice != null && !isNaN(Number(job.quantity)) && !isNaN(Number(job.unitPrice))) {
      return (Number(job.quantity) * Number(job.unitPrice)).toFixed(2);
    }
    return '—';
  }

  /**
   * Pre-fills the location / project text filter from Dashboard “today’s project” (by project name).
   */
  function applyDashboardProjectToWorklogsFilter(onDone) {
    var locEl = document.getElementById('worklogs-filter-project');
    var headers = getHeaders();
    var pid =
      typeof window.ProconixDashboardProject !== 'undefined'
        ? window.ProconixDashboardProject.getSelectedProjectId()
        : '';
    if (!locEl || !pid || !headers) {
      if (onDone) onDone();
      return;
    }
    fetch('/api/projects/' + encodeURIComponent(pid), { headers: headers, credentials: 'same-origin' })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        var proj = data && data.success && data.project;
        var name = proj && (proj.project_name || proj.name);
        if (name) locEl.value = String(name).trim();
      })
      .catch(function () {})
      .finally(function () {
        if (onDone) onDone();
      });
  }

  function getFilters() {
    var workerEl = document.getElementById('worklogs-filter-worker');
    var dateFromEl = document.getElementById('worklogs-filter-date-from');
    var dateToEl = document.getElementById('worklogs-filter-date-to');
    var projectEl = document.getElementById('worklogs-filter-project');
    var statusEl = document.getElementById('worklogs-filter-status');
    var searchEl = document.getElementById('worklogs-search');
    return {
      worker: workerEl ? workerEl.value.trim() : '',
      dateFrom: dateFromEl ? dateFromEl.value.trim() : '',
      dateTo: dateToEl ? dateToEl.value.trim() : '',
      location: projectEl ? projectEl.value.trim() : '',
      status: statusEl ? statusEl.value : '',
      search: searchEl ? searchEl.value.trim() : '',
    };
  }

  function statusClass(s) {
    if (!s) return '';
    return 'worklogs-status-badge status-' + s;
  }

  function statusLabel(s) {
    var labels = { pending: 'Pending', edited: 'Edited', waiting_worker: 'Waiting Worker', approved: 'Approved', rejected: 'Rejected', completed: 'Completed' };
    return labels[s] || s;
  }

  function renderTable(jobs, filtered, container) {
    if (!container) return;
    container.innerHTML = '';
    var emptyEl = document.getElementById('worklogs-empty');
    if (!filtered.length) {
      if (emptyEl) emptyEl.classList.remove('d-none');
      return;
    }
    if (emptyEl) emptyEl.classList.add('d-none');

    var f = getFilters();
    var hasActiveFilters = f.worker || f.dateFrom || f.dateTo || f.location || f.status || (f.search && f.search.length > 0);

    filtered.forEach(function (job) {
      var tr = document.createElement('tr');
      tr.className = 'worklogs-status-' + (job.status || 'pending');
      if (hasActiveFilters) tr.classList.add('worklogs-row-filtered');

      var canSelect = job.status === 'approved';
      var cb = document.createElement('td');
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'worklogs-job-cb';
      input.dataset.id = job.id;
      input.dataset.jobId = job.jobId;
      input.checked = false;
      input.disabled = !canSelect;
      cb.appendChild(input);
      tr.appendChild(cb);

      var idCell = document.createElement('td');
      var link = document.createElement('a');
      link.href = '#';
      link.className = 'worklogs-job-id-link';
      link.textContent = job.jobId;
      link.dataset.jobId = job.jobId;
      link.dataset.id = job.id;
      idCell.appendChild(link);
      tr.appendChild(idCell);

      tr.appendChild(document.createElement('td')).textContent = job.workerName || '—';
      tr.appendChild(document.createElement('td')).textContent = getLocation(job);
      tr.appendChild(document.createElement('td')).textContent = job.workType || '—';
      tr.appendChild(document.createElement('td')).textContent =
        (job.quantity != null ? job.quantity : '—') + ' / £' + formatWorkLogTotalDisplay(job);
      var statusCell = document.createElement('td');
      var badge = document.createElement('span');
      badge.className = statusClass(job.status);
      badge.textContent = statusLabel(job.status);
      statusCell.appendChild(badge);
      if (job.operativeArchived) {
        var oa = document.createElement('span');
        oa.className = 'worklogs-badge-operative-archived';
        oa.textContent = 'Operative archived';
        statusCell.appendChild(oa);
      }
      if (job.workWasEdited) {
        var ed = document.createElement('span');
        ed.className = 'worklogs-badge-edited';
        ed.textContent = 'Edited';
        statusCell.appendChild(ed);
      }
      tr.appendChild(statusCell);

      var actionsCell = document.createElement('td');
      var viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'btn-worklogs btn-worklogs-secondary';
      viewBtn.innerHTML = '<i class="bi bi-eye"></i> View';
      viewBtn.dataset.jobId = job.jobId;
      viewBtn.dataset.id = job.id;
      actionsCell.appendChild(viewBtn);
      tr.appendChild(actionsCell);

      container.appendChild(tr);
    });
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  /** Render QA price work entries for manager detail modal */
  function renderQaPriceWorkHtml(entries) {
    if (!entries || !entries.length) return '';
    var html =
      '<div class="worklogs-details-qa-price"><h4 class="worklogs-details-subhd">QA price work</h4>';
    entries.forEach(function (ent) {
      var jn = ent.jobNumber != null && String(ent.jobNumber).trim() !== '' ? String(ent.jobNumber) : ent.qaJobId || '—';
      var jt = (ent.jobTitle && String(ent.jobTitle).trim()) || '';
      html +=
        '<div class="worklogs-qa-price-job"><div class="worklogs-qa-price-job-head"><strong>' +
        escapeHtml('Job ' + jn) +
        '</strong>' +
        (jt ? ' — ' + escapeHtml(jt) : '') +
        '</div>';
      var sq = ent.stepQuantities && typeof ent.stepQuantities === 'object' ? ent.stepQuantities : {};
      var stepLabels = ent.stepLabels && typeof ent.stepLabels === 'object' ? ent.stepLabels : {};
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
        html += '<p class="worklogs-qa-price-empty">No step quantities recorded.</p>';
      } else {
        var lines = [];
        keys.forEach(function (k) {
          var q = sq[k] || {};
          var parts = [];
          if (q.m2 != null && String(q.m2).trim() !== '') parts.push('m²: ' + escapeHtml(String(q.m2)));
          if (q.linear != null && String(q.linear).trim() !== '') parts.push('linear m: ' + escapeHtml(String(q.linear)));
          if (q.units != null && String(q.units).trim() !== '') parts.push('units: ' + escapeHtml(String(q.units)));
          var urls = Array.isArray(spu[k]) ? spu[k] : [];
          if (!parts.length && !urls.length) return;
          var display = stepLabels[k] || k;
          var li =
            '<li><span class="worklogs-qa-price-step-name">' +
            escapeHtml(display) +
            '</span>';
          if (parts.length) li += ' — ' + parts.join(', ');
          if (urls.length) {
            li += '<div class="worklogs-qa-price-step-photos">';
            urls.forEach(function (url) {
              li +=
                '<a href="' +
                escapeHtml(url) +
                '" target="_blank" rel="noopener" class="worklogs-qa-price-photo-thumb-wrap"><img src="' +
                escapeHtml(url) +
                '" alt="" class="worklogs-qa-price-photo-thumb"></a>';
            });
            li += '</div>';
          }
          li += '</li>';
          lines.push(li);
        });
        if (lines.length) {
          html += '<ul class="worklogs-qa-price-steps">' + lines.join('') + '</ul>';
        } else {
          html += '<p class="worklogs-qa-price-empty">No step quantities recorded.</p>';
        }
      }
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  function getJobById(jobs, idOrJobId) {
    if (idOrJobId == null) return null;
    var byId = typeof idOrJobId === 'number' || (typeof idOrJobId === 'string' && /^\d+$/.test(idOrJobId));
    for (var i = 0; i < jobs.length; i++) {
      if (byId && Number(jobs[i].id) === Number(idOrJobId)) return jobs[i];
      if (!byId && jobs[i].jobId === idOrJobId) return jobs[i];
    }
    return null;
  }

  function openDetailsModal(job) {
    if (!job) return;
    var modal = document.getElementById('worklogs-modal-details');
    var content = document.getElementById('worklogs-details-content');
    if (!modal || !content) return;

    var total = formatWorkLogTotalDisplay(job);
    var submitted = job.submittedAt ? new Date(job.submittedAt).toLocaleString() : '—';

    var html = '<dl class="worklogs-details-dl">';
    html += '<dt>Worker</dt><dd>' + (job.workerName || '—') + '</dd>';
    html += '<dt>Location</dt><dd>' + getLocation(job) + '</dd>';
    html += '<dt>Work type</dt><dd>' + (job.workType || '—') + '</dd>';
    html += '<dt>Quantity</dt><dd>' + (job.quantity != null ? job.quantity : '—') + '</dd>';
    html += '<dt>Unit price</dt><dd>£' + (job.unitPrice != null ? Number(job.unitPrice).toFixed(2) : '—') + '</dd>';
    html += '<dt>Total</dt><dd>' + (total === '—' ? '—' : '£' + total) + '</dd>';
    html += '<dt>Description</dt><dd>' + (job.description || '—') + '</dd>';
    html += '<dt>Submitted</dt><dd>' + submitted + '</dd>';
    if (job.operativeArchived) {
      html += '<dt>Note</dt><dd>Operative archived this entry (hidden in operative dashboard).</dd>';
    }
    html += '</dl>';
    html += '<div class="worklogs-details-invoice">';
    var invoicePath = job.invoiceFilePath || job.invoice_file_path || '';
    if (invoicePath) {
      html += '<p class="worklogs-invoice-text">The worker uploaded an invoice file.</p>';
      html += '<button type="button" class="btn-worklogs btn-worklogs-primary worklogs-btn-download-invoice" data-job-id="' + (job.jobId || '') + '" data-invoice-path="' + invoicePath + '"><i class="bi bi-download"></i> Download file</button>';
      html +=
        '<div class="worklogs-details-invoice-save-cloud" data-invoice-encoded="' +
        encodeURIComponent(String(invoicePath)) +
        '">';
      html += '<span class="worklogs-cloud-save-label">Save to cloud</span>';
      html += '<div class="worklogs-cloud-save-row">';
      html += '<select class="worklogs-cloud-folder-select" aria-label="Cloud folder"><option value="">Select folder</option></select>';
      html += '<button type="button" class="btn-worklogs btn-worklogs-secondary worklogs-btn-save-invoice-cloud" disabled><i class="bi bi-cloud-upload"></i> Save</button>';
      html += '</div>';
      html += '<div class="worklogs-cloud-save-feedback" role="status" aria-live="polite"></div>';
      html += '</div>';
    } else {
      html += '<p class="worklogs-invoice-text">No invoice file uploaded yet.</p>';
      html += '<button type="button" class="btn-worklogs btn-worklogs-primary worklogs-btn-download-invoice" disabled><i class="bi bi-download"></i> Download file</button>';
    }
    html += '</div>';
    if (job.timesheetJobs && Array.isArray(job.timesheetJobs) && job.timesheetJobs.length) {
      job.timesheetJobs.forEach(function (tj) {
        if (tj && tj.type === 'qa_price_work' && Array.isArray(tj.entries)) {
          html += renderQaPriceWorkHtml(tj.entries);
        }
      });
      var tsPhotoJobs = job.timesheetJobs.filter(function (tj) {
        if (tj && tj.type === 'qa_price_work') return false;
        return tj && Array.isArray(tj.photos) && tj.photos.length > 0;
      });
      if (tsPhotoJobs.length) {
        html += '<h4 class="worklogs-details-subhd" style="margin-top:16px">Photos</h4>';
        tsPhotoJobs.forEach(function (tj, i) {
          var photos = tj.photos;
          html +=
            '<div style="margin-top:10px;">' +
            '<div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:6px;">Timesheet job ' +
            (i + 1) +
            '</div>' +
            '<div class="worklogs-details-photos">';
          photos.forEach(function (url, idx) {
            html +=
              '<img src="' + url + '" alt="Photo ' + (idx + 1) + '" data-url="' + url + '" class="worklogs-photo-thumb">';
          });
          html += '</div></div>';
        });
      }
    } else if (job.photoUrls && job.photoUrls.length) {
      html += '<dt>Photos</dt><dd><div class="worklogs-details-photos">';
      job.photoUrls.forEach(function (url, idx) {
        html += '<img src="' + url + '" alt="Photo ' + (idx + 1) + '" data-url="' + url + '" class="worklogs-photo-thumb">';
      });
      html += '</div></dd>';
    }
    content.innerHTML = html;
    content.dataset.jobId = job.jobId;
    content.dataset.id = job.id;

    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');

    // Photo thumb click -> lightbox
    content.querySelectorAll('.worklogs-photo-thumb').forEach(function (img) {
      img.addEventListener('click', function () {
        var url = img.getAttribute('data-url');
        if (url) openLightbox(url);
      });
    });

    // Download file
    content.querySelectorAll('.worklogs-btn-download-invoice').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var invoicePath = btn.getAttribute('data-invoice-path') || (job && job.invoiceFilePath) || '';
        if (!invoicePath) return;
        var filename = String(invoicePath).split('/').pop() || 'invoice.pdf';
        var a = document.createElement('a');
        a.href = invoicePath;
        a.download = filename;
        a.click();
      });
    });

    wireInvoiceSaveToCloud(content);
  }

  function openLightbox(url) {
    var modal = document.getElementById('worklogs-modal-lightbox');
    var img = document.getElementById('worklogs-lightbox-img');
    if (modal && img) {
      img.src = url;
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function openEditModal(job) {
    if (!job) return;
    document.getElementById('worklogs-modal-details').classList.remove('is-open');
    var modal = document.getElementById('worklogs-modal-edit');
    var idEl = document.getElementById('worklogs-edit-job-id');
    var qtyEl = document.getElementById('worklogs-edit-quantity');
    var upEl = document.getElementById('worklogs-edit-unit-price');
    var totEl = document.getElementById('worklogs-edit-total');
    var histEl = document.getElementById('worklogs-edit-history');
    if (!modal || !idEl) return;

    idEl.value = job.id;
    qtyEl.value = job.quantity != null ? job.quantity : '';
    upEl.value = job.unitPrice != null ? job.unitPrice : '';
    totEl.value = job.total != null ? job.total : '';

    if (job.editHistory && job.editHistory.length) {
      histEl.innerHTML = '<strong>Edit history:</strong><ul>' + job.editHistory.map(function (h) {
        return '<li>' + h.field + ': ' + h.oldVal + ' → ' + h.newVal + ' by ' + (h.editor || '—') + ' at ' + (h.at ? new Date(h.at).toLocaleString() : '') + '</li>';
      }).join('') + '</ul>';
    } else {
      histEl.innerHTML = '';
    }

    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function openInvoiceModal(selectedJobs) {
    if (!selectedJobs.length) return;
    var modal = document.getElementById('worklogs-modal-invoice');
    var content = document.getElementById('worklogs-invoice-content');
    if (!modal || !content) return;

    var totalAmount = 0;
    var rows = selectedJobs.map(function (j) {
      var t = getWorkLogAmountNumeric(j);
      totalAmount += t;
      return '<tr><td>' + (j.workerName || '—') + '</td><td>' + getLocation(j) + '</td><td>' + (j.workType || '—') + '</td><td>' + (j.quantity != null ? j.quantity : '—') + '</td><td>£' + (j.unitPrice != null ? Number(j.unitPrice).toFixed(2) : '—') + '</td><td>£' + t.toFixed(2) + '</td></tr>';
    }).join('');
    content.innerHTML = '<p><strong>Invoice</strong> – ' + selectedJobs.length + ' job(s)</p><table><thead><tr><th>Worker</th><th>Location</th><th>Work type</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead><tbody>' + rows + '</tbody></table><p class="worklogs-invoice-total">Total: £' + totalAmount.toFixed(2) + '</p>';
    content.dataset.jobIds = selectedJobs.map(function (j) { return j.id; }).join(',');

    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function updateAnalytics(jobs, filtered) {
    var visible = filtered.filter(function (j) { return !j.archived; });
    var total = visible.length;
    var approved = visible.filter(function (j) { return j.status === 'approved'; }).length;
    var totalCost = visible.reduce(function (sum, j) { return sum + getWorkLogAmountNumeric(j); }, 0);
    var oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    var weeklyJobs = visible.filter(function (j) { return new Date(j.submittedAt) >= oneWeekAgo; });
    var weeklyCost = weeklyJobs.reduce(function (sum, j) { return sum + getWorkLogAmountNumeric(j); }, 0);

    var now = new Date();
    var thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    var thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    var monthlyJobs = visible.filter(function (j) {
      var t = new Date(j.submittedAt).getTime();
      return t >= thisMonthStart.getTime() && t <= thisMonthEnd.getTime();
    });
    var monthlyCost = monthlyJobs.reduce(function (sum, j) { return sum + getWorkLogAmountNumeric(j); }, 0);

    var progressText = document.getElementById('worklogs-progress-text');
    var progressFill = document.getElementById('worklogs-progress-fill');
    if (progressText) progressText.textContent = approved + ' approved / ' + total + ' total';
    if (progressFill) progressFill.style.width = total ? (approved / total * 100) + '%' : '0%';

    var totalCostEl = document.getElementById('worklogs-total-cost');
    var weeklyCostEl = document.getElementById('worklogs-weekly-cost');
    var monthlyCostEl = document.getElementById('worklogs-monthly-cost');
    if (totalCostEl) totalCostEl.textContent = '£' + totalCost.toFixed(2);
    if (weeklyCostEl) weeklyCostEl.textContent = '£' + weeklyCost.toFixed(2);
    if (monthlyCostEl) monthlyCostEl.textContent = '£' + monthlyCost.toFixed(2);
  }

  function updateChart(filtered) {
    var canvas = document.getElementById('worklogs-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    var approved = filtered.filter(function (j) { return j.status === 'approved'; }).length;
    var pending = filtered.filter(function (j) { return j.status === 'pending' || j.status === 'edited' || j.status === 'waiting_worker'; }).length;
    var ctx = canvas.getContext('2d');
    var existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Approved', 'Pending / Edited'],
        datasets: [{ label: 'Jobs', data: [approved, pending], backgroundColor: ['#49E67E', '#FFC947'] }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { display: false } },
      },
    });
  }

  function refreshAll(jobs) {
    var tbody = document.getElementById('worklogs-tbody');
    renderTable(jobs, jobs, tbody);
    updateAnalytics(jobs, jobs);
    updateChart(jobs);
    updateInvoiceButton(jobs);
  }

  function updateInvoiceButton(filtered) {
    var btn = document.getElementById('worklogs-btn-invoice');
    if (!btn) return;
    var approved = filtered.filter(function (j) { return j.status === 'approved'; });
    btn.disabled = approved.length === 0;
  }

  function getSelectedApprovedJobIds() {
    var cbs = document.querySelectorAll('.worklogs-job-cb:checked');
    var ids = [];
    cbs.forEach(function (cb) {
      var id = cb.dataset.id;
      if (id) ids.push(Number(id));
    });
    return ids;
  }

  function initWorkLogsModule() {
    var jobs = [];
    var container = document.getElementById('dashboard-content');
    if (!container) return;

    var contentWrapEl = document.getElementById('worklogs-content-wrap');

    function showContent() {
      if (contentWrapEl) contentWrapEl.classList.remove('d-none');
    }

    function refreshAllFromApi() {
      loadJobsFromApi(getFilters()).then(function (list) {
        jobs = list;
        refreshAll(jobs);
      });
    }

    function runWorkLogsInit() {
      if (!container) return;

      // Worker dropdown from API
      loadWorkersFromApi().then(function (names) {
        var workerSelect = document.getElementById('worklogs-filter-worker');
        if (workerSelect) {
          workerSelect.innerHTML = '<option value="">All</option>' + names.map(function (n) { return '<option value="' + n + '">' + n + '</option>'; }).join('');
        }
      });
      applyDashboardProjectToWorklogsFilter(function () {
        refreshAllFromApi();
      });

      // Filters
      ['worklogs-filter-worker', 'worklogs-filter-date-from', 'worklogs-filter-date-to', 'worklogs-filter-project', 'worklogs-filter-status', 'worklogs-search'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('input', function () { refreshAllFromApi(); });
        if (el) el.addEventListener('change', function () { refreshAllFromApi(); });
      });

      // Table: Job ID / View click
      container.addEventListener('click', function (e) {
        var link = e.target.closest('.worklogs-job-id-link');
        var viewBtn = e.target.closest('.btn-worklogs[data-job-id]');
        var jobId = (link && link.dataset.jobId) || (viewBtn && viewBtn.dataset.jobId);
        if (jobId) {
          e.preventDefault();
          var job = getJobById(jobs, jobId);
          if (job) openDetailsModal(job);
          return;
        }

        if (e.target.id === 'worklogs-select-all' || e.target.closest('#worklogs-select-all')) {
          var all = document.getElementById('worklogs-select-all');
          var checkboxes = container.querySelectorAll('.worklogs-job-cb:not([disabled])');
          if (all && checkboxes.length) {
            checkboxes.forEach(function (cb) { cb.checked = all.checked; });
            updateInvoiceButton(jobs);
          }
          return;
        }
      });

      // Details modal: Edit / Approve / Reject (API)
      var detailsEdit = document.getElementById('worklogs-details-btn-edit');
      var detailsApprove = document.getElementById('worklogs-details-btn-approve');
      var detailsReject = document.getElementById('worklogs-details-btn-reject');
      var headers = getHeaders();
      if (detailsEdit) detailsEdit.addEventListener('click', function () {
        var content = document.getElementById('worklogs-details-content');
        var id = content && content.dataset.id;
        var job = id ? getJobById(jobs, id) : null;
        if (job) openEditModal(job);
      });
      if (detailsApprove) detailsApprove.addEventListener('click', function () {
        var content = document.getElementById('worklogs-details-content');
        var id = content && content.dataset.id;
        if (!id || !headers) return;
        fetch('/api/worklogs/' + id + '/approve', { method: 'POST', headers: headers })
          .then(function (res) { return res.json(); })
          .then(function () {
            document.getElementById('worklogs-modal-details').classList.remove('is-open');
            refreshAllFromApi();
          })
          .catch(function () { alert('Failed to approve job.'); });
      });
      if (detailsReject) detailsReject.addEventListener('click', function () {
        var content = document.getElementById('worklogs-details-content');
        var id = content && content.dataset.id;
        var jobId = content && content.dataset.jobId;
        if (!id || !headers) return;
        fetch('/api/worklogs/' + id + '/reject', { method: 'POST', headers: headers })
          .then(function (res) { return res.json(); })
          .then(function () {
            document.getElementById('worklogs-modal-details').classList.remove('is-open');
            refreshAllFromApi();
            alert('Job ' + (jobId || id) + ' rejected. Worker will be notified.');
          })
          .catch(function () { alert('Failed to reject job.'); });
      });

      var detailsDelete = document.getElementById('worklogs-details-btn-delete');
      if (detailsDelete) detailsDelete.addEventListener('click', function () {
        var content = document.getElementById('worklogs-details-content');
        var id = content && content.dataset.id;
        var jobId = content && content.dataset.jobId;
        if (!id || !headers) return;
        var msg = 'Delete this work log entry permanently?\n\n' +
          'Job: ' + (jobId || id) + '\n\n' +
          'This will remove the database record and delete all related files on the server (photos, PDF / invoice). This cannot be undone.';
        if (!window.confirm(msg)) return;
        fetch('/api/worklogs/' + id, { method: 'DELETE', headers: headers })
          .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
          .then(function (r) {
            if (!r.ok || !r.body || !r.body.success) {
              var errMsg = (r.body && r.body.message) ? r.body.message : 'Delete failed.';
              alert(errMsg);
              return;
            }
            document.getElementById('worklogs-modal-details').classList.remove('is-open');
            refreshAllFromApi();
          })
          .catch(function () { alert('Failed to delete job.'); });
      });

      // Edit modal: Save (API)
      var editSave = document.getElementById('worklogs-edit-save');
      if (editSave) editSave.addEventListener('click', function () {
        var idEl = document.getElementById('worklogs-edit-job-id');
        var qtyEl = document.getElementById('worklogs-edit-quantity');
        var upEl = document.getElementById('worklogs-edit-unit-price');
        var totEl = document.getElementById('worklogs-edit-total');
        var id = idEl && idEl.value;
        var job = id ? getJobById(jobs, id) : null;
        if (!job || !headers) return;
        var qty = parseFloat(qtyEl.value);
        var up = parseFloat(upEl.value);
        var tot = parseFloat(totEl.value);
        if (isNaN(qty)) qty = job.quantity;
        if (isNaN(up)) up = job.unitPrice;
        if (isNaN(tot)) tot = qty * up;
        fetch('/api/worklogs/' + id, {
          method: 'PATCH',
          headers: headers,
          body: JSON.stringify({ quantity: qty, unitPrice: up, total: tot }),
        })
          .then(function (res) { return res.json(); })
          .then(function () {
            document.getElementById('worklogs-modal-edit').classList.remove('is-open');
            refreshAllFromApi();
          })
          .catch(function () { alert('Failed to save changes.'); });
      });

      // Generate Invoice
      var btnInvoice = document.getElementById('worklogs-btn-invoice');
      if (btnInvoice) btnInvoice.addEventListener('click', function () {
        var ids = getSelectedApprovedJobIds();
        var approved = jobs.filter(function (j) { return j.status === 'approved'; });
        var selected = ids.length ? ids.map(function (id) { return getJobById(jobs, id); }).filter(Boolean) : approved;
        if (!selected.length) return;
        openInvoiceModal(selected);
      });

      // Invoice: Print / Send / Archive
      var invPrint = document.getElementById('worklogs-invoice-print');
      var invSend = document.getElementById('worklogs-invoice-send');
      var invArchive = document.getElementById('worklogs-invoice-archive');
      if (invPrint) invPrint.addEventListener('click', function () { window.print(); });
      if (invSend) invSend.addEventListener('click', function () { alert('Invoice sent to client (simulated).'); });
      if (invArchive) invArchive.addEventListener('click', function () {
        var content = document.getElementById('worklogs-invoice-content');
        var raw = content && content.dataset.jobIds;
        if (!raw || !headers) return;
        var ids = raw.split(',').map(function (x) { return parseInt(x, 10); }).filter(function (n) { return !isNaN(n); });
        if (!ids.length) return;
        fetch('/api/worklogs/archive-bulk', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ jobIds: ids }),
        })
          .then(function (res) { return res.json(); })
          .then(function () {
            document.getElementById('worklogs-modal-invoice').classList.remove('is-open');
            refreshAllFromApi();
          })
          .catch(function () { alert('Failed to archive jobs.'); });
      });
    }

    showContent();
    runWorkLogsInit();
  }

  window.initWorkLogsModule = initWorkLogsModule;
})();
