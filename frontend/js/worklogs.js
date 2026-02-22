/**
 * Work Logs module – uses backend API when available.
 * Manager: list, view, edit, approve, reject, archive. Passkey gate before access.
 */

(function () {
  'use strict';

  var PASSKEY_STORAGE = 'worklogs_unlocked';
  var PASSKEY = 'proconix2026'; // change to your desired passkey
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
      tr.appendChild(document.createElement('td')).textContent = (job.quantity != null ? job.quantity : '—') + ' / £' + (job.total != null ? Number(job.total).toFixed(2) : '0');
      var statusCell = document.createElement('td');
      var badge = document.createElement('span');
      badge.className = statusClass(job.status);
      badge.textContent = statusLabel(job.status);
      statusCell.appendChild(badge);
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

    var total = job.total != null ? Number(job.total).toFixed(2) : (job.quantity != null && job.unitPrice != null ? (job.quantity * job.unitPrice).toFixed(2) : '—');
    var submitted = job.submittedAt ? new Date(job.submittedAt).toLocaleString() : '—';

    var html = '<dl class="worklogs-details-dl">';
    html += '<dt>Worker</dt><dd>' + (job.workerName || '—') + '</dd>';
    html += '<dt>Location</dt><dd>' + getLocation(job) + '</dd>';
    html += '<dt>Work type</dt><dd>' + (job.workType || '—') + '</dd>';
    html += '<dt>Quantity</dt><dd>' + (job.quantity != null ? job.quantity : '—') + '</dd>';
    html += '<dt>Unit price</dt><dd>£' + (job.unitPrice != null ? Number(job.unitPrice).toFixed(2) : '—') + '</dd>';
    html += '<dt>Total</dt><dd>£' + total + '</dd>';
    html += '<dt>Description</dt><dd>' + (job.description || '—') + '</dd>';
    html += '<dt>Submitted</dt><dd>' + submitted + '</dd>';
    html += '</dl>';
    html += '<div class="worklogs-details-invoice">';
    html += '<p class="worklogs-invoice-text">Lucrătorul a încărcat un invoice file.</p>';
    html += '<button type="button" class="btn-worklogs btn-worklogs-primary worklogs-btn-download-invoice" data-job-id="' + (job.jobId || '') + '"><i class="bi bi-download"></i> Descarcă file</button>';
    html += '</div>';
    if (job.photoUrls && job.photoUrls.length) {
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

    // Descarcă file – simulated download
    content.querySelectorAll('.worklogs-btn-download-invoice').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var jobId = (job && job.jobId) || btn.getAttribute('data-job-id') || 'job';
        var filename = 'invoice-' + jobId + '.pdf';
        var text = 'Invoice for job ' + jobId + '\n\nGenerated from Work Logs.';
        var blob = new Blob([text], { type: 'application/pdf' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
      });
    });
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
      var t = j.total != null ? Number(j.total) : (j.quantity * j.unitPrice) || 0;
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
    var totalCost = visible.reduce(function (sum, j) { return sum + (Number(j.total) || 0); }, 0);
    var oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    var weeklyJobs = visible.filter(function (j) { return new Date(j.submittedAt) >= oneWeekAgo; });
    var weeklyCost = weeklyJobs.reduce(function (sum, j) { return sum + (Number(j.total) || 0); }, 0);

    var now = new Date();
    var thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    var thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    var monthlyJobs = visible.filter(function (j) {
      var t = new Date(j.submittedAt).getTime();
      return t >= thisMonthStart.getTime() && t <= thisMonthEnd.getTime();
    });
    var monthlyCost = monthlyJobs.reduce(function (sum, j) { return sum + (Number(j.total) || 0); }, 0);

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

    var gateEl = document.getElementById('worklogs-passkey-gate');
    var contentWrapEl = document.getElementById('worklogs-content-wrap');
    var formEl = document.getElementById('worklogs-passkey-form');
    var inputEl = document.getElementById('worklogs-passkey-input');
    var errorEl = document.getElementById('worklogs-passkey-error');

    function showGate() {
      if (gateEl) gateEl.classList.remove('d-none');
      if (contentWrapEl) contentWrapEl.classList.add('d-none');
    }
    function showContent() {
      if (gateEl) gateEl.classList.add('d-none');
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
      refreshAllFromApi();

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

    try {
      if (sessionStorage.getItem(PASSKEY_STORAGE) === 'true') {
        showContent();
        runWorkLogsInit();
      } else {
        showGate();
        if (formEl && inputEl) {
          formEl.addEventListener('submit', function (e) {
            e.preventDefault();
            if (errorEl) errorEl.classList.add('d-none');
            var value = (inputEl.value || '').trim();
            if (value === PASSKEY) {
              try { sessionStorage.setItem(PASSKEY_STORAGE, 'true'); } catch (_) {}
              inputEl.value = '';
              showContent();
              runWorkLogsInit();
            } else {
              if (errorEl) errorEl.classList.remove('d-none');
            }
          });
        }
        var requestBtn = document.getElementById('worklogs-btn-request-passkey');
        if (requestBtn) {
          requestBtn.addEventListener('click', function () {
            alert('Passkey request has been sent to your administrator.');
          });
        }
      }
    } catch (_) {
      showContent();
      runWorkLogsInit();
    }
  }

  window.initWorkLogsModule = initWorkLogsModule;
})();
