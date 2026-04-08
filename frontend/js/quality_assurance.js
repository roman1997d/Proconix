/**
 * Proconix QA Module — enterprise UI (views, drawers, full pages)
 */
(function () {
  'use strict';

  var QA_SUPERVISOR_MODE = /(?:^|[?&])supervisor=1(?:&|$)/.test(window.location.search) || window.QA_SUPERVISOR_MODE === true;
  var OPERATIVE_TOKEN_KEY_QA = 'proconix_operative_token';

  var projectSelect = document.getElementById('qa-project');
  var currentView = 'home';
  var jobsLayoutMode = 'cards';
  var templateDrawerMode = 'create';
  var templateSortable = null;
  var searchTimers = {};
  var openJobMenuId = null;

  /** Mirrors backend compact job numbers for offline QA demo. */
  var QA_MAX_COMPACT_SEQ = 26 * 99;
  function qaVirtualSeqFromJobNumber(jn) {
    if (!jn) return 0;
    var s = String(jn).trim();
    var m = /^([A-Za-z])(\d{2})$/.exec(s);
    if (m) {
      var li = m[1].toUpperCase().charCodeAt(0) - 65;
      var n = parseInt(m[2], 10);
      if (li >= 0 && li <= 25 && n >= 1 && n <= 99) return li * 99 + n;
    }
    var leg = /^J-0*(\d+)$/i.exec(s);
    if (leg) return QA_MAX_COMPACT_SEQ + parseInt(leg[1], 10);
    return 0;
  }
  function qaFormatSeqToJobNumber(seq) {
    if (!seq || seq < 1) seq = 1;
    if (seq > QA_MAX_COMPACT_SEQ) {
      return 'J-' + String(seq - QA_MAX_COMPACT_SEQ).padStart(6, '0');
    }
    var letterIndex = Math.floor((seq - 1) / 99);
    var num = ((seq - 1) % 99) + 1;
    return String.fromCharCode(65 + letterIndex) + String(num).padStart(2, '0');
  }

  function iconsRefresh() {
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  if (window !== window.top) {
    document.addEventListener('DOMContentLoaded', function () {
      var dashboardLink = document.querySelector('.qa-dashboard-link');
      if (dashboardLink) {
        dashboardLink.addEventListener('click', function (e) {
          e.preventDefault();
          var base = window.top.location.href.replace(/\/[^/]*$/, '/');
          var target = QA_SUPERVISOR_MODE ? 'supervisor_dashboard.html' : 'dashboard_manager.html';
          window.top.location.href = base + target;
        });
      }
    });
  }

  (function () {
    try {
      if (QA_SUPERVISOR_MODE) {
        var tok = localStorage.getItem(OPERATIVE_TOKEN_KEY_QA) || sessionStorage.getItem(OPERATIVE_TOKEN_KEY_QA);
        if (tok) {
          window.QA_CONFIG = window.QA_CONFIG || { useBackend: true, apiBase: '/api/supervisor/qa' };
          window.QA_CONFIG.useBackend = true;
          window.QA_CONFIG.apiBase = '/api/supervisor/qa';
          return;
        }
      }
      var raw = localStorage.getItem('proconix_manager_session') || sessionStorage.getItem('proconix_manager_session');
      var session = raw ? JSON.parse(raw) : null;
      var hasSession = session && session.manager_id != null && session.email;
      window.QA_CONFIG = window.QA_CONFIG || { useBackend: !!hasSession, apiBase: '/api' };
      if (hasSession && !window.QA_CONFIG.useBackend) window.QA_CONFIG.useBackend = true;
    } catch (e) {
      window.QA_CONFIG = window.QA_CONFIG || { useBackend: false, apiBase: '/api' };
    }
  })();

  var workersData = [
    { id: 'w1', name: 'John Smith', category: 'fixers' },
    { id: 'w2', name: 'Maria Garcia', category: 'plaster' },
    { id: 'w3', name: 'David Brown', category: 'electricians' },
    { id: 'w4', name: 'Emma Wilson', category: 'painters' },
    { id: 'w5', name: 'James Taylor', category: 'fixers' },
    { id: 'w6', name: 'Anna Kowalski', category: 'plaster' },
    { id: 'w7', name: 'Paul Murphy', category: 'electricians' },
    { id: 'w8', name: 'Lisa Chen', category: 'painters' }
  ];

  var supervisorsData = [
    { id: 'sup1', name: 'Michael Roberts' },
    { id: 'sup2', name: 'Sarah Clark' },
    { id: 'sup3', name: 'James Wright' }
  ];

  var qaApiLocal = (function () {
    var _templates = [];
    var _jobs = [];
    function loadFromStorage() {
      try {
        var t = localStorage.getItem('qa_templates');
        if (t) _templates = JSON.parse(t);
      } catch (e) {}
      try {
        var j = localStorage.getItem('qa_jobs');
        if (j) _jobs = JSON.parse(j);
      } catch (e) {}
    }
    function saveTemplates() {
      try { localStorage.setItem('qa_templates', JSON.stringify(_templates)); } catch (e) {}
    }
    function saveJobs() {
      try { localStorage.setItem('qa_jobs', JSON.stringify(_jobs)); } catch (e) {}
    }
    loadFromStorage();

    return {
      getTemplates: function () { return Promise.resolve(_templates.slice()); },
      getTemplate: function (id) {
        var t = _templates.find(function (x) { return x.id === id; });
        return Promise.resolve(t ? Object.assign({}, t) : null);
      },
      createTemplate: function (data) {
        var id = 'tpl_' + Date.now();
        var createdBy = (typeof window.qaCurrentUserName === 'string' && window.qaCurrentUserName.trim()) ? window.qaCurrentUserName.trim() : '';
        var created = {
          id: id,
          name: data.name,
          steps: data.steps || [],
          createdAt: new Date().toISOString(),
          createdBy: createdBy
        };
        _templates.push(created);
        saveTemplates();
        return Promise.resolve(created);
      },
      getJobStepEvidence: function () {
        return Promise.resolve({ steps: [], operativePhotos: [] });
      },
      updateTemplate: function (id, data) {
        var idx = _templates.findIndex(function (x) { return x.id === id; });
        if (idx === -1) return Promise.reject(new Error('Template not found'));
        var existing = _templates[idx];
        _templates[idx] = {
          id: id,
          name: data.name,
          steps: data.steps || [],
          createdAt: existing.createdAt || new Date().toISOString(),
          createdBy: existing.createdBy || ''
        };
        saveTemplates();
        return Promise.resolve(_templates[idx]);
      },
      deleteTemplate: function (id) {
        _templates = _templates.filter(function (x) { return x.id !== id; });
        saveTemplates();
        return Promise.resolve();
      },
      getJobs: function (projectId) {
        var list = projectId ? _jobs.filter(function (j) { return String(j.projectId) === String(projectId); }) : _jobs.slice();
        return Promise.resolve(list);
      },
      getJob: function (id) {
        var j = _jobs.find(function (x) { return x.id === id; });
        return Promise.resolve(j ? Object.assign({}, j) : null);
      },
      createJob: function (data) {
        var id = 'job_' + Date.now();
        var job = Object.assign({ id: id, notes: data.notes || '' }, data);
        _jobs.push(job);
        saveJobs();
        return Promise.resolve(job);
      },
      updateJob: function (id, data) {
        var j = _jobs.find(function (x) { return x.id === id; });
        if (!j) return Promise.reject(new Error('Job not found'));
        Object.keys(data).forEach(function (k) { j[k] = data[k]; });
        saveJobs();
        return Promise.resolve(j);
      },
      deleteJob: function (id) {
        _jobs = _jobs.filter(function (x) { return x.id !== id; });
        saveJobs();
        return Promise.resolve();
      },
      getNextJobNumber: function () {
        var maxSeq = 0;
        _jobs.forEach(function (j) {
          var v = qaVirtualSeqFromJobNumber(j.jobNumber);
          if (v > maxSeq) maxSeq = v;
        });
        return Promise.resolve(qaFormatSeqToJobNumber(maxSeq + 1));
      }
    };
  })();

  function getQASessionHeaders() {
    if (QA_SUPERVISOR_MODE) {
      try {
        var t = localStorage.getItem(OPERATIVE_TOKEN_KEY_QA) || sessionStorage.getItem(OPERATIVE_TOKEN_KEY_QA);
        if (t) return { 'X-Operative-Token': t };
      } catch (e) {}
      return {};
    }
    try {
      var raw = localStorage.getItem('proconix_manager_session') || sessionStorage.getItem('proconix_manager_session');
      var session = raw ? JSON.parse(raw) : null;
      if (session && session.manager_id != null && session.email) {
        return { 'X-Manager-Id': String(session.manager_id), 'X-Manager-Email': session.email };
      }
    } catch (e) {}
    return {};
  }

  if (window.QA_CONFIG && window.QA_CONFIG.useBackend) {
    try {
      var raw = localStorage.getItem('proconix_manager_session') || sessionStorage.getItem('proconix_manager_session');
      var session = raw ? JSON.parse(raw) : null;
      if (session && (session.name || session.email)) {
        window.qaCurrentUserName = [session.name, session.surname].filter(Boolean).join(' ').trim() || session.email || '';
      }
    } catch (e) {}
  }

  function qaFetch(path, opts) {
    opts = opts || {};
    var headers = Object.assign({}, getQASessionHeaders(), opts.headers || {});
    opts.headers = headers;
    var base = (window.QA_CONFIG && window.QA_CONFIG.apiBase) ? window.QA_CONFIG.apiBase.replace(/\/$/, '') : '/api';
    var url = base + (path.charAt(0) === '/' ? path : '/' + path);
    return fetch(url, opts).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (text) {
          var msg = 'Request failed';
          try {
            var body = text ? JSON.parse(text) : {};
            if (body && body.message) msg = body.message;
            else if (text && text.length) msg = msg + ' (' + res.status + '): ' + text.slice(0, 120);
            else msg = msg + ' (' + res.status + ')';
          } catch (_) {
            if (text && text.length) msg = msg + ' (' + res.status + '): ' + text.slice(0, 120);
            else msg = msg + ' (' + res.status + ')';
          }
          throw new Error(msg);
        });
      }
      if (res.status === 204) return null;
      return res.json();
    });
  }

  var qaApiBackend = {
    getPersonnel: function () { return qaFetch('/personnel'); },
    getTemplates: function (projectId) {
      if (!projectId) return Promise.resolve([]);
      return qaFetch('/templates?projectId=' + encodeURIComponent(projectId));
    },
    getTemplate: function (id) {
      return qaFetch('/templates/' + encodeURIComponent(id)).then(function (t) { return t || null; }, function () { return null; });
    },
    createTemplate: function (data) {
      var pid = projectSelect && projectSelect.value;
      if (!pid) return Promise.reject(new Error('Select a project first.'));
      var body = { name: data.name, steps: data.steps || [], projectId: parseInt(pid, 10) };
      return qaFetch('/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    },
    updateTemplate: function (id, data) {
      return qaFetch('/templates/' + encodeURIComponent(id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: data.name, steps: data.steps || [] }) });
    },
    deleteTemplate: function (id) { return qaFetch('/templates/' + encodeURIComponent(id), { method: 'DELETE' }); },
    getJobs: function (projectId) { return qaFetch('/jobs?projectId=' + encodeURIComponent(projectId)); },
    getJob: function (id) { return qaFetch('/jobs/' + encodeURIComponent(id)).then(function (j) { return j || null; }, function () { return null; }); },
    getJobStepEvidence: function (id) {
      return qaFetch('/jobs/' + encodeURIComponent(id) + '/step-evidence').then(function (d) {
        if (!d || typeof d !== 'object') return { steps: [], operativePhotos: [] };
        return {
          steps: Array.isArray(d.steps) ? d.steps : [],
          operativePhotos: Array.isArray(d.operativePhotos) ? d.operativePhotos : [],
        };
      }, function () { return { steps: [], operativePhotos: [] }; });
    },
    createJob: function (data) { return qaFetch('/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); },
    updateJob: function (id, data) { return qaFetch('/jobs/' + encodeURIComponent(id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); },
    deleteJob: function (id) { return qaFetch('/jobs/' + encodeURIComponent(id), { method: 'DELETE' }); },
    getNextJobNumber: function () {
      var projectId = projectSelect && projectSelect.value;
      if (!projectId) return Promise.resolve('A01');
      return qaFetch('/jobs/next-number?projectId=' + encodeURIComponent(projectId)).then(function (d) {
        return (d && d.jobNumber) ? d.jobNumber : 'A01';
      }, function () { return 'A01'; });
    }
  };

  var qaApi = (window.QA_CONFIG && window.QA_CONFIG.useBackend) ? qaApiBackend : qaApiLocal;
  if (QA_SUPERVISOR_MODE && window.QA_CONFIG && window.QA_CONFIG.useBackend) {
    var _qaBack = qaApi;
    qaApi = Object.assign({}, _qaBack, {
      createTemplate: function () {
        return Promise.reject(new Error('Templates are read-only for supervisors.'));
      },
      updateTemplate: function () {
        return Promise.reject(new Error('Templates are read-only for supervisors.'));
      },
      deleteTemplate: function () {
        return Promise.reject(new Error('Templates are read-only for supervisors.'));
      },
      deleteJob: function () {
        return Promise.reject(new Error('Deleting jobs is not available for supervisors.'));
      }
    });
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s == null ? '' : String(s);
    return div.innerHTML;
  }

  function jobSpecificationOrDescSummary(job) {
    if (!job) return '';
    var spec = String(job.specification || '').trim();
    if (spec) return spec;
    var desc = String(job.description || '').trim();
    if (!desc) return '';
    var line = desc.split(/\r?\n/)[0].trim();
    return line || '';
  }

  /** Human-facing line: job title, else specification / description summary. */
  function jobSideTitle(job) {
    if (!job) return '';
    var jt = String(job.jobTitle || '').trim();
    if (jt) return jt;
    return jobSpecificationOrDescSummary(job);
  }

  function templateLabelForStep(templates, templateId) {
    var t = (templates || []).find(function (x) { return String(x.id) === String(templateId); });
    return t ? String(t.name || '').trim() : '';
  }

  function stepDescriptionForStep(templates, templateId, stepId) {
    var t = (templates || []).find(function (x) { return String(x.id) === String(templateId); });
    if (!t || !t.steps) return '';
    var s = t.steps.find(function (z) { return String(z.id) === String(stepId); });
    return s ? String(s.description || '').trim() : '';
  }

  function buildJobEvidenceSection(steps, templates, operativePhotos) {
    var list = steps || [];
    var opList = operativePhotos || [];
    function photosHtml(photos) {
      return (photos || [])
        .map(function (p) {
          var u = p.file_url || '';
          if (!u) return '';
          return (
            '<a href="' +
            escapeHtml(u) +
            '" target="_blank" rel="noopener" class="qa-job-evidence__photo-link"><img src="' +
            escapeHtml(u) +
            '" alt="" loading="lazy" class="qa-job-evidence__thumb"></a>'
          );
        })
        .join('');
    }
    var opBlock = '';
    if (opList.length) {
      var oph = photosHtml(opList);
      opBlock =
        '<div class="qa-job-evidence__block qa-job-evidence__block--operative">' +
        '<div class="qa-job-evidence__block-head">Operative confirmation (task photos)</div>' +
        (oph ? '<div class="qa-job-evidence__photos">' + oph + '</div>' : '') +
        '</div>';
    }
    if (!list.length && !opList.length) {
      return (
        '<div class="qa-job-evidence">' +
        '<h4 class="qa-job-evidence__title">Site evidence</h4>' +
        '<p class="qa-job-evidence__empty">No photos or comments on template steps yet.</p>' +
        '</div>'
      );
    }
    var blocks = list.map(function (st) {
      var tplName = templateLabelForStep(templates, st.templateId);
      var stepDesc = stepDescriptionForStep(templates, st.templateId, st.stepId);
      var photos = photosHtml(st.photos || []);
      var comment = (st.comment || '').trim();
      var head =
        escapeHtml(tplName || 'Template ' + st.templateId) +
        (stepDesc
          ? ' — ' + escapeHtml(stepDesc.length > 140 ? stepDesc.slice(0, 140) + '…' : stepDesc)
          : '');
      return (
        '<div class="qa-job-evidence__block">' +
        '<div class="qa-job-evidence__block-head">' +
        head +
        '</div>' +
        (comment ? '<div class="qa-job-evidence__comment">' + escapeHtml(comment) + '</div>' : '') +
        (photos ? '<div class="qa-job-evidence__photos">' + photos + '</div>' : '') +
        '</div>'
      );
    }).join('');
    return (
      '<div class="qa-job-evidence">' +
      '<h4 class="qa-job-evidence__title">Site evidence (step photos &amp; comments)</h4>' +
      opBlock +
      blocks +
      '</div>'
    );
  }

  function generateStepId() {
    return 'step_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  function normalizeStepData(s) {
    return {
      id: s && s.id ? s.id : generateStepId(),
      description: (s && s.description !== undefined) ? String(s.description) : '',
      pricePerM2: (s && s.pricePerM2 !== undefined) ? String(s.pricePerM2) : '',
      pricePerUnit: (s && s.pricePerUnit !== undefined) ? String(s.pricePerUnit) : '',
      pricePerLinear: (s && s.pricePerLinear !== undefined) ? String(s.pricePerLinear) : ''
    };
  }

  function computeTotalFromSteps(steps) {
    var total = 0;
    (steps || []).forEach(function (s) {
      total += (parseFloat(s && s.pricePerM2) || 0) + (parseFloat(s && s.pricePerUnit) || 0) + (parseFloat(s && s.pricePerLinear) || 0);
    });
    return total;
  }

  function formatTemplatePrice(v) {
    if (v === undefined || v === null || String(v).trim() === '') return '—';
    var n = parseFloat(v);
    if (isNaN(n)) return '—';
    return '£' + n.toFixed(2);
  }

  function getSupervisorName(id) {
    if (!id) return '—';
    var s = supervisorsData.find(function (x) { return x.id === id; });
    return s ? s.name : id;
  }

  function getWorkerNames(ids) {
    if (!ids || !ids.length) return [];
    return ids.map(function (id) {
      var w = workersData.find(function (x) { return x.id === id; });
      return w ? w.name : id;
    });
  }

  function getTemplateNames(templates, ids) {
    if (!ids || !ids.length) return [];
    return ids.map(function (id) {
      var t = (templates || []).find(function (x) { return x.id === id; });
      return t ? t.name : id;
    });
  }

  function getCostDisplay(job) {
    if (!job.costIncluded || !job.costType) return 'No cost provided';
    var v = job.costValue || '';
    if (job.costType === 'day') return 'Day work (' + v + ' day' + (v !== '1' ? 's' : '') + ')';
    if (job.costType === 'hour') return 'Hour work (' + v + ' hour' + (v !== '1' ? 's' : '') + ')';
    if (job.costType === 'price') return 'Price work (£' + (v ? Number(v).toFixed(2) : '0') + ')';
    return 'No cost provided';
  }

  function getStatusLabel(s) {
    if (s === 'active') return 'Active';
    if (s === 'completed') return 'Completed';
    if (s === 'archived') return 'Archived';
    return 'New';
  }

  function statusBadgeClass(s) {
    if (s === 'completed') return 'qa-badge--completed';
    if (s === 'active') return 'qa-badge--active';
    if (s === 'archived') return 'qa-badge--archived';
    return 'qa-badge--new';
  }

  function formatJobDate(val) {
    if (!val) return '—';
    var d = new Date(val);
    if (isNaN(d.getTime())) return '—';
    var day = String(d.getDate()).padStart(2, '0');
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var year = d.getFullYear();
    return day + '/' + month + '/' + year;
  }

  function categoryLabel(cat) {
    var labels = { fixers: 'Fixers', plaster: 'Plaster', electricians: 'Electricians', painters: 'Painters' };
    return labels[cat] || cat;
  }

  /* ——— Toast ——— */
  var toastEl = document.getElementById('qa-toast');
  var toastTimer;
  function showToast(message, variant) {
    if (!toastEl) return;
    if (toastTimer) clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.className = 'qa-toast is-show' + (variant === 'success' ? ' qa-toast--success' : variant === 'error' ? ' qa-toast--error' : '');
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('is-show', 'qa-toast--success', 'qa-toast--error');
      toastTimer = null;
    }, 4200);
    iconsRefresh();
  }

  /* ——— Confirm ——— */
  var confirmResolve;
  function openConfirm(text) {
    return new Promise(function (resolve) {
      confirmResolve = resolve;
      var o = document.getElementById('qa-confirm-overlay');
      document.getElementById('qa-confirm-text').textContent = text;
      o.classList.add('is-open');
      o.setAttribute('aria-hidden', 'false');
    });
  }
  document.getElementById('qa-confirm-cancel').addEventListener('click', function () {
    document.getElementById('qa-confirm-overlay').classList.remove('is-open');
    document.getElementById('qa-confirm-overlay').setAttribute('aria-hidden', 'true');
    if (confirmResolve) confirmResolve(false);
    confirmResolve = null;
  });
  document.getElementById('qa-confirm-ok').addEventListener('click', function () {
    document.getElementById('qa-confirm-overlay').classList.remove('is-open');
    document.getElementById('qa-confirm-overlay').setAttribute('aria-hidden', 'true');
    if (confirmResolve) confirmResolve(true);
    confirmResolve = null;
  });

  /* ——— Views ——— */
  function showView(name) {
    currentView = name;
    ['qa-view-home', 'qa-view-templates', 'qa-view-job-create', 'qa-view-jobs'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('d-none', id !== 'qa-view-' + (name === 'home' ? 'home' : name === 'templates' ? 'templates' : name === 'job-create' ? 'job-create' : 'jobs'));
    });
    document.body.style.overflow = name === 'home' ? '' : '';
    iconsRefresh();
  }

  function navigateTo(name) {
    showView(name);
    if (name === 'templates') {
      var opt = projectSelect.options[projectSelect.selectedIndex];
      document.getElementById('qa-lib-project-label').textContent = opt ? opt.text : '';
      renderTemplateLibrary();
    }
    if (name === 'job-create') {
      var o = projectSelect.options[projectSelect.selectedIndex];
      document.getElementById('qa-job-create-project-label').textContent = o ? o.text : '';
      rebuildJobFloorSelect(false);
      refreshJobNumberPreview();
      switchJobTab('details');
      refreshJobTemplatesList();
      renderWorkersList(document.getElementById('qa-worker-category').value);
      updateCostPreview();
    }
    if (name === 'jobs') {
      var opt = projectSelect.options[projectSelect.selectedIndex];
      document.getElementById('qa-jobs-page-title').textContent = 'QA Jobs — ' + (opt ? opt.text.split('–')[0].trim() : '—');
      document.getElementById('qa-jobs-project-sub').textContent = opt ? opt.text : '';
      renderJobsOverview(true);
    }
  }

  /**
   * Floor / level options for Create QA Job: match project's number_of_floors (My Projects).
   * N storeys → Ground + Floor 1 … Floor (N−1). If unset, fall back to Ground + Floors 1–3.
   */
  function rebuildJobFloorSelect(preserveValue) {
    var floorSel = document.getElementById('qa-job-floor');
    if (!floorSel || !projectSelect) return;
    var projOpt = projectSelect.selectedIndex >= 0 ? projectSelect.options[projectSelect.selectedIndex] : null;
    var raw = projOpt && projOpt.getAttribute('data-floors');
    var parsed = raw != null && raw !== '' ? parseInt(raw, 10) : NaN;
    var totalStoreys = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    var prev = preserveValue ? floorSel.value : '';
    floorSel.innerHTML = '';
    var ph = document.createElement('option');
    ph.value = '';
    ph.textContent = '— Select —';
    floorSel.appendChild(ph);
    function addOpt(value, label) {
      var o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      floorSel.appendChild(o);
    }
    if (totalStoreys == null) {
      addOpt('ground', 'Ground');
      addOpt('1', 'Floor 1');
      addOpt('2', 'Floor 2');
      addOpt('3', 'Floor 3');
    } else {
      addOpt('ground', 'Ground');
      for (var j = 1; j < totalStoreys; j++) {
        addOpt(String(j), 'Floor ' + j);
      }
    }
    if (preserveValue && prev) {
      var ok = Array.prototype.some.call(floorSel.options, function (opt) { return opt.value === prev; });
      floorSel.value = ok ? prev : '';
    }
  }

  function refreshJobNumberPreview() {
    var el = document.getElementById('qa-job-number-preview');
    if (!el) return;
    if (!projectSelect || !projectSelect.value) {
      el.textContent = '—';
      return;
    }
    el.textContent = '…';
    qaApi.getNextJobNumber().then(function (num) {
      el.textContent = num || '—';
    }).catch(function () { el.textContent = '—'; });
  }

  /* ——— Project load ——— */
  function loadQaProjects() {
    var sel = projectSelect;
    var loadingEl = document.getElementById('qa-projects-loading');
    var errorEl = document.getElementById('qa-projects-error');
    if (!sel) return;
    var headers = getQASessionHeaders();
    if (loadingEl) loadingEl.classList.add('d-none');
    if (errorEl) errorEl.classList.add('d-none');
    if (QA_SUPERVISOR_MODE) {
      if (!headers['X-Operative-Token']) {
        if (errorEl) {
          errorEl.textContent = 'Supervisor session required.';
          errorEl.classList.remove('d-none');
        }
        return;
      }
      if (loadingEl) loadingEl.classList.remove('d-none');
      fetch('/api/operatives/me', { headers: { 'X-Operative-Token': headers['X-Operative-Token'] }, credentials: 'same-origin' })
        .then(function (res) {
          return res.json();
        })
        .then(function (meData) {
          if (loadingEl) loadingEl.classList.add('d-none');
          if (!meData || !meData.success || !meData.user || meData.user.project_id == null) {
            if (errorEl) {
              errorEl.textContent = 'No project assigned to your supervisor account.';
              errorEl.classList.remove('d-none');
            }
            return;
          }
          var pid = String(meData.user.project_id);
          return fetch('/api/materials/supervisor/projects', {
            headers: { 'X-Operative-Token': headers['X-Operative-Token'] },
            credentials: 'same-origin'
          })
            .then(function (r) {
              return r.json();
            })
            .then(function (projData) {
              if (errorEl) errorEl.classList.add('d-none');
              while (sel.options.length > 1) sel.remove(1);
              var label = 'Project #' + pid;
              var list = (projData && projData.projects) || [];
              if (list.length && list[0].name) label = list[0].name;
              var opt = document.createElement('option');
              opt.value = pid;
              opt.textContent = label;
              var p0 = list[0];
              if (p0 && p0.number_of_floors != null && p0.number_of_floors !== '') {
                var ns = parseInt(p0.number_of_floors, 10);
                if (Number.isInteger(ns) && ns > 0) opt.setAttribute('data-floors', String(ns));
              }
              sel.appendChild(opt);
              sel.value = pid;
              sel.disabled = true;
              enableModuleCards();
              if (currentView === 'job-create') rebuildJobFloorSelect(false);
            });
        })
        .catch(function () {
          if (loadingEl) loadingEl.classList.add('d-none');
          if (errorEl) {
            errorEl.textContent = 'Could not load project.';
            errorEl.classList.remove('d-none');
          }
        });
      return;
    }
    if (!headers['X-Manager-Id']) {
      if (errorEl) {
        errorEl.textContent = 'Log in as manager to see your company\'s projects.';
        errorEl.classList.remove('d-none');
      }
      return;
    }
    if (loadingEl) loadingEl.classList.remove('d-none');
    fetch('/api/projects/list', { headers: headers })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (loadingEl) loadingEl.classList.add('d-none');
        if (!data || !data.success || !Array.isArray(data.projects)) {
          if (errorEl) {
            errorEl.textContent = 'Could not load projects.';
            errorEl.classList.remove('d-none');
          }
          return;
        }
        if (errorEl) errorEl.classList.add('d-none');
        while (sel.options.length > 1) sel.remove(1);
        data.projects.forEach(function (p) {
          if (!p || p.id == null) return;
          var name = (p.project_name || p.name || '').trim() || ('Project #' + p.id);
          var addr = (p.address || '').trim();
          var label = addr ? name + ' – ' + addr : name;
          var opt = document.createElement('option');
          opt.value = String(p.id);
          opt.textContent = label;
          var nf = p.number_of_floors;
          if (nf != null && nf !== '') {
            var n = parseInt(nf, 10);
            if (Number.isInteger(n) && n > 0) opt.setAttribute('data-floors', String(n));
          }
          sel.appendChild(opt);
        });
        enableModuleCards();
        if (currentView === 'job-create') rebuildJobFloorSelect(false);
      })
      .catch(function () {
        if (loadingEl) loadingEl.classList.add('d-none');
        if (errorEl) {
          errorEl.textContent = 'Could not load projects. Check your connection.';
          errorEl.classList.remove('d-none');
        }
      });
  }

  function enableModuleCards() {
    var has = projectSelect && projectSelect.value !== '';
    document.querySelectorAll('#qa-module-cards .qa-module-card').forEach(function (card) {
      card.classList.toggle('is-disabled', !has);
      card.setAttribute('aria-disabled', has ? 'false' : 'true');
    });
    var hint = document.getElementById('qa-project-empty-hint');
    if (hint) hint.classList.toggle('d-none', !!has);
  }

  projectSelect.addEventListener('change', function () {
    enableModuleCards();
    rebuildJobFloorSelect(false);
    if (currentView === 'job-create') refreshJobNumberPreview();
    if (currentView === 'jobs') renderJobsOverview(true);
    if (currentView === 'templates') renderTemplateLibrary();
  });

  /* ——— Home cards ——— */
  document.querySelectorAll('#qa-module-cards .qa-module-card').forEach(function (card) {
    card.addEventListener('click', function () {
      if (card.classList.contains('is-disabled')) return;
      var action = card.getAttribute('data-action');
      if (action === 'template') openTemplateDrawer('create');
      else if (action === 'library') navigateTo('templates');
      else if (action === 'job') navigateTo('job-create');
      else if (action === 'jobs') navigateTo('jobs');
    });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
  });

  document.getElementById('qa-back-templates').addEventListener('click', function () { showView('home'); });
  document.getElementById('qa-back-job-create').addEventListener('click', function () { showView('home'); });
  document.getElementById('qa-back-jobs').addEventListener('click', function () { showView('home'); });

  document.getElementById('qa-lib-new-template').addEventListener('click', function () { openTemplateDrawer('create'); });
  document.getElementById('qa-lib-empty-cta').addEventListener('click', function () { openTemplateDrawer('create'); });
  document.getElementById('qa-lib-price-list').addEventListener('click', createPriceListFile);

  document.getElementById('qa-jobs-add-job').addEventListener('click', function () { navigateTo('job-create'); });
  document.getElementById('qa-empty-add-job').addEventListener('click', function () { navigateTo('job-create'); });

  /* ——— Template drawer ——— */
  var layerTemplate = document.getElementById('qa-layer-template');
  var stepsContainer = document.getElementById('qa-template-steps-container');

  function destroyTemplateSortable() {
    if (templateSortable) {
      templateSortable.destroy();
      templateSortable = null;
    }
  }

  function initTemplateSortable() {
    destroyTemplateSortable();
    if (typeof Sortable === 'undefined' || !stepsContainer) return;
    templateSortable = Sortable.create(stepsContainer, {
      animation: 150,
      handle: '.qa-step-drag',
      ghostClass: 'sortable-ghost'
    });
  }

  function openLayer(layerEl, open) {
    layerEl.classList.toggle('d-none', !open);
    layerEl.classList.toggle('is-open', !!open);
    layerEl.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) iconsRefresh();
  }

  function buildStepCardHtml(stepNum, stepData) {
    stepData = normalizeStepData(stepData);
    var desc = stepData.description;
    return (
      '<div class="qa-step-card" data-step-id="' + escapeHtml(stepData.id) + '">' +
        '<div class="qa-step-head">' +
          '<span class="qa-step-drag" aria-label="Drag to reorder"><i data-lucide="grip-vertical"></i></span>' +
          '<h3 class="qa-step-title">Step ' + stepNum + '</h3>' +
          '<button type="button" class="qa-step-remove" aria-label="Remove step"><i data-lucide="trash-2"></i></button>' +
        '</div>' +
        '<textarea class="qa-textarea qa-step-desc" rows="2" placeholder="Description…">' + escapeHtml(desc) + '</textarea>' +
        '<div class="qa-step-prices">' +
          '<label class="qa-step-price-row"><span class="qa-step-price-label">Price per m² (£)</span>' +
          '<input type="number" class="qa-input qa-step-price-m2" min="0" step="0.01" value="' + escapeHtml(stepData.pricePerM2) + '"></label>' +
          '<label class="qa-step-price-row"><span class="qa-step-price-label">Price per unit (£)</span>' +
          '<input type="number" class="qa-input qa-step-price-unit" min="0" step="0.01" value="' + escapeHtml(stepData.pricePerUnit) + '"></label>' +
          '<label class="qa-step-price-row"><span class="qa-step-price-label">Price per linear m (£)</span>' +
          '<input type="number" class="qa-input qa-step-price-linear" min="0" step="0.01" value="' + escapeHtml(stepData.pricePerLinear) + '"></label>' +
        '</div>' +
      '</div>'
    );
  }

  function renumberSteps() {
    if (!stepsContainer) return;
    var cards = stepsContainer.querySelectorAll('.qa-step-card');
    cards.forEach(function (card, i) {
      var t = card.querySelector('.qa-step-title');
      if (t) t.textContent = 'Step ' + (i + 1);
    });
  }

  function openTemplateDrawer(mode, templateId) {
    templateDrawerMode = mode;
    document.getElementById('qa-template-drawer-title').textContent = mode === 'edit' ? 'Edit template' : 'Create template';
    document.getElementById('qa-edit-template-id').value = templateId || '';
    document.getElementById('qa-template-name').value = '';
    stepsContainer.innerHTML = '';
    if (mode === 'edit' && templateId) {
      qaApi.getTemplate(templateId).then(function (t) {
        if (!t) {
          showToast('Template not found.', 'error');
          return;
        }
        document.getElementById('qa-template-name').value = t.name || '';
        var steps = (t.steps && t.steps.length) ? t.steps : [normalizeStepData({ id: generateStepId() })];
        steps.forEach(function (s, i) {
          stepsContainer.insertAdjacentHTML('beforeend', buildStepCardHtml(i + 1, s));
        });
        bindStepContainerEvents();
        initTemplateSortable();
        openLayer(layerTemplate, true);
        document.getElementById('qa-template-name').focus();
        iconsRefresh();
      });
      return;
    }
    stepsContainer.insertAdjacentHTML('beforeend', buildStepCardHtml(1, { id: generateStepId() }));
    bindStepContainerEvents();
    initTemplateSortable();
    openLayer(layerTemplate, true);
    document.getElementById('qa-template-name').focus();
    iconsRefresh();
  }

  function bindStepContainerEvents() {
    stepsContainer.querySelectorAll('.qa-step-remove').forEach(function (btn) {
      btn.onclick = function () {
        var card = btn.closest('.qa-step-card');
        if (card && stepsContainer.querySelectorAll('.qa-step-card').length > 1) {
          card.remove();
          renumberSteps();
        } else showToast('At least one step is required.', 'error');
      };
    });
  }

  document.getElementById('qa-template-add-step').addEventListener('click', function () {
    var n = stepsContainer.querySelectorAll('.qa-step-card').length;
    if (n >= 20) return showToast('Maximum 20 steps.', 'error');
    stepsContainer.insertAdjacentHTML('beforeend', buildStepCardHtml(n + 1, { id: generateStepId() }));
    bindStepContainerEvents();
    initTemplateSortable();
    iconsRefresh();
  });

  function closeTemplateDrawer() {
    destroyTemplateSortable();
    openLayer(layerTemplate, false);
  }

  document.getElementById('qa-template-backdrop').addEventListener('click', closeTemplateDrawer);
  document.getElementById('qa-template-drawer-close').addEventListener('click', closeTemplateDrawer);
  document.getElementById('qa-template-cancel').addEventListener('click', closeTemplateDrawer);

  function collectStepsFromDom() {
    var cards = stepsContainer.querySelectorAll('.qa-step-card');
    var steps = [];
    cards.forEach(function (card) {
      var stepId = card.getAttribute('data-step-id') || generateStepId();
      var ta = card.querySelector('.qa-step-desc');
      var pM2 = card.querySelector('.qa-step-price-m2');
      var pUnit = card.querySelector('.qa-step-price-unit');
      var pLinear = card.querySelector('.qa-step-price-linear');
      steps.push({
        id: stepId,
        description: (ta && ta.value) ? ta.value.trim() : '',
        pricePerM2: (pM2 && pM2.value) ? pM2.value.trim() : '',
        pricePerUnit: (pUnit && pUnit.value) ? pUnit.value.trim() : '',
        pricePerLinear: (pLinear && pLinear.value) ? pLinear.value.trim() : ''
      });
    });
    return steps;
  }

  document.getElementById('qa-template-save').addEventListener('click', function () {
    var name = document.getElementById('qa-template-name').value.trim();
    if (!name) return showToast('Template name is required.', 'error');
    var steps = collectStepsFromDom();
    if (steps.length === 0) return showToast('At least one step is required.', 'error');
    var editId = document.getElementById('qa-edit-template-id').value;
    var p = editId
      ? qaApi.updateTemplate(editId, { name: name, steps: steps })
      : qaApi.createTemplate({ name: name, steps: steps });
    p.then(function () {
      refreshJobTemplatesList();
      closeTemplateDrawer();
      if (currentView === 'templates') renderTemplateLibrary();
      showToast('Template saved.', 'success');
    }).catch(function (err) {
      showToast(err && err.message ? err.message : 'Failed to save.', 'error');
    });
  });

  /* ——— Template library ——— */
  function debounce(key, fn, ms) {
    return function () {
      var ctx = this;
      var args = arguments;
      clearTimeout(searchTimers[key]);
      searchTimers[key] = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  function renderTemplateLibrary() {
    var listEl = document.getElementById('qa-lib-list');
    var emptyEl = document.getElementById('qa-lib-empty');
    var noMatch = document.getElementById('qa-lib-no-match');
    var sk = document.getElementById('qa-lib-skeleton');
    var projectId = projectSelect && projectSelect.value;
    listEl.innerHTML = '';
    if (sk) { sk.classList.remove('d-none'); }
    if (emptyEl) emptyEl.classList.add('d-none');
    if (noMatch) noMatch.classList.add('d-none');

    var q = (document.getElementById('qa-lib-search') && document.getElementById('qa-lib-search').value) || '';
    q = q.trim().toLowerCase();

    if (window.QA_CONFIG && window.QA_CONFIG.useBackend && !projectId) {
      if (sk) sk.classList.add('d-none');
      if (emptyEl) emptyEl.classList.remove('d-none');
      return;
    }

    qaApi.getTemplates(projectId).then(function (templates) {
      if (sk) sk.classList.add('d-none');
      var list = (templates || []).filter(function (t) {
        return !q || (t.name || '').toLowerCase().indexOf(q) !== -1;
      });
      list.sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }); });
      if (!templates || templates.length === 0) {
        if (emptyEl) emptyEl.classList.remove('d-none');
        return;
      }
      if (list.length === 0) {
        if (noMatch) noMatch.classList.remove('d-none');
        return;
      }
      list.forEach(function (t) {
        var total = formatTemplatePrice(computeTotalFromSteps(t.steps));
        var row = document.createElement('div');
        row.className = 'qa-tpl-row';
        row.innerHTML =
          '<div><div class="qa-tpl-row__name">' + escapeHtml(t.name) + '</div>' +
          '<div class="qa-tpl-row__meta">' + (t.steps || []).length + ' steps · Total ' + escapeHtml(total) + '</div></div>' +
          '<span class="qa-badge qa-badge--new">' + escapeHtml(total) + '</span>' +
          '<button type="button" class="qa-btn qa-btn--secondary qa-btn--sm qa-tpl-edit" data-id="' + escapeHtml(t.id) + '">Edit</button>' +
          '<button type="button" class="qa-btn qa-btn--danger qa-btn--sm qa-tpl-del" data-id="' + escapeHtml(t.id) + '">Delete</button>';
        listEl.appendChild(row);
        row.querySelector('.qa-tpl-edit').addEventListener('click', function () {
          openTemplateDrawer('edit', t.id);
        });
        row.querySelector('.qa-tpl-del').addEventListener('click', function () {
          openConfirm('Delete template "' + (t.name || '') + '"?').then(function (ok) {
            if (!ok) return;
            qaApi.deleteTemplate(t.id).then(function () {
              renderTemplateLibrary();
              refreshJobTemplatesList();
            }).catch(function (err) { showToast(err.message || 'Delete failed', 'error'); });
          });
        });
      });
      iconsRefresh();
    });
  }

  document.getElementById('qa-lib-search').addEventListener('input', debounce('lib', function () { renderTemplateLibrary(); }, 300));

  function createPriceListFile() {
    var projectId = projectSelect && projectSelect.value;
    if (window.QA_CONFIG && window.QA_CONFIG.useBackend && !projectId) {
      showToast('Select a project first.', 'error');
      return;
    }
    qaApi.getTemplates(projectId).then(function (templates) {
      if (!templates.length) {
        showToast('No templates to export.', 'error');
        return;
      }
      function csvEscape(str) {
        if (str === undefined || str === null) return '';
        var s = String(str);
        if (s.indexOf('"') !== -1) s = s.replace(/"/g, '""');
        if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) return '"' + s + '"';
        return s;
      }
      var rows = [];
      var header = ['Template Name', 'Total (£)', 'Step', 'Description', 'Price per m² (£)', 'Price per unit (£)', 'Price per linear meter (£)'];
      rows.push(header.map(csvEscape).join(','));
      templates.forEach(function (t) {
        var total = computeTotalFromSteps(t.steps);
        var totalStr = total > 0 ? total.toFixed(2) : '';
        var steps = t.steps || [];
        if (steps.length === 0) {
          rows.push([t.name || '', totalStr, '', '', '', '', ''].map(csvEscape).join(','));
        } else {
          steps.forEach(function (s, i) {
            rows.push([t.name || '', totalStr, (i + 1), (s.description || '').trim(), (s.pricePerM2 || '').trim(), (s.pricePerUnit || '').trim(), (s.pricePerLinear || '').trim()].map(csvEscape).join(','));
          });
        }
      });
      var blob = new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'template-price-list.csv';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  /* ——— Job create tabs ——— */
  function switchJobTab(tabKey) {
    document.querySelectorAll('.qa-tab').forEach(function (t) {
      var on = t.getAttribute('data-tab') === tabKey;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('#qa-view-job-create .qa-tab-panel').forEach(function (p) {
      var id = p.id.replace('qa-job-panel-', '');
      var on = id === tabKey;
      p.classList.toggle('d-none', !on);
      if (on) p.removeAttribute('hidden'); else p.setAttribute('hidden', 'hidden');
    });
  }

  document.querySelectorAll('#qa-view-job-create .qa-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      var key = tab.getAttribute('data-tab');
      if (key) switchJobTab(key);
    });
  });

  function setWorkType(val) {
    document.getElementById('qa-work-type-value').value = val;
    document.querySelectorAll('.qa-cost-toggle .qa-seg').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-work-type') === val);
    });
    document.getElementById('qa-cost-day-wrap').classList.toggle('d-none', val !== 'day');
    document.getElementById('qa-cost-hour-wrap').classList.toggle('d-none', val !== 'hour');
    document.getElementById('qa-cost-price-wrap').classList.toggle('d-none', val !== 'price');
    updateCostPreview();
  }

  document.querySelectorAll('.qa-cost-toggle .qa-seg').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setWorkType(btn.getAttribute('data-work-type'));
    });
  });

  var includeCostCheck = document.getElementById('qa-job-include-cost');
  function toggleCostOptions() {
    var on = includeCostCheck && includeCostCheck.checked;
    document.getElementById('qa-cost-options').classList.toggle('d-none', !on);
    updateCostPreview();
  }
  if (includeCostCheck) includeCostCheck.addEventListener('change', toggleCostOptions);

  function updateCostPreview() {
    var el = document.getElementById('qa-cost-preview');
    if (!el) return;
    if (!includeCostCheck || !includeCostCheck.checked) {
      el.textContent = 'Cost not included for this job.';
      return;
    }
    var wt = document.getElementById('qa-work-type-value').value;
    if (wt === 'day') {
      var d = document.getElementById('qa-job-days') && document.getElementById('qa-job-days').value;
      el.textContent = 'Preview: Day work — ' + (d || '0') + ' day(s) recorded.';
    } else if (wt === 'hour') {
      var h = document.getElementById('qa-job-hours') && document.getElementById('qa-job-hours').value;
      el.textContent = 'Preview: Hour work — ' + (h || '0') + ' hour(s).';
    } else {
      var p = document.getElementById('qa-job-total-price') && document.getElementById('qa-job-total-price').value;
      el.textContent = 'Preview: Fixed price — £' + (p ? Number(p).toFixed(2) : '0.00');
    }
  }
  ['qa-job-days', 'qa-job-hours', 'qa-job-total-price'].forEach(function (id) {
    var n = document.getElementById(id);
    if (n) n.addEventListener('input', updateCostPreview);
  });

  function refreshJobTemplatesList() {
    var jobTemplatesList = document.getElementById('qa-job-templates-list');
    if (!jobTemplatesList) return;
    jobTemplatesList.innerHTML = '';
    var projectId = projectSelect && projectSelect.value;
    qaApi.getTemplates(projectId).then(function (templates) {
      if (!templates.length) {
        jobTemplatesList.innerHTML = '<p class="qa-message">No templates yet.</p>';
        iconsRefresh();
        return;
      }
      templates.forEach(function (t) {
        var label = document.createElement('label');
        label.className = 'qa-check-item';
        label.innerHTML = '<input type="checkbox" name="qa-job-template" value="' + escapeHtml(t.id) + '"> <span>' + escapeHtml(t.name) + '</span>';
        jobTemplatesList.appendChild(label);
      });
      iconsRefresh();
    });
  }

  function renderWorkersList(categoryFilter) {
    var listEl = document.getElementById('qa-workers-list');
    if (!listEl) return;
    var checked = [];
    listEl.querySelectorAll('input[name="qa-worker"]:checked').forEach(function (cb) { checked.push(cb.value); });
    var filtered = categoryFilter ? workersData.filter(function (w) { return w.category === categoryFilter; }) : workersData.slice();
    listEl.innerHTML = '';
    filtered.forEach(function (w) {
      var label = document.createElement('label');
      label.className = 'qa-check-item';
      var isChecked = checked.indexOf(w.id) !== -1;
      label.innerHTML = '<input type="checkbox" name="qa-worker" value="' + escapeHtml(w.id) + '"' + (isChecked ? ' checked' : '') + '> <span>' + escapeHtml(w.name) + ' <span class="qa-message">(' + categoryLabel(w.category) + ')</span></span>';
      listEl.appendChild(label);
    });
  }

  document.getElementById('qa-worker-category').addEventListener('change', function () {
    renderWorkersList(this.value);
  });

  function refreshPersonnelUI() {
    var sel = document.getElementById('qa-job-responsible');
    if (sel) {
      sel.innerHTML = '<option value="">— Select —</option>';
      supervisorsData.forEach(function (s) {
        var opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        sel.appendChild(opt);
      });
    }
    var catSel = document.getElementById('qa-worker-category');
    if (catSel) {
      catSel.innerHTML = '<option value="">All categories</option>';
      ['fixers', 'plaster', 'electricians', 'painters'].forEach(function (c) {
        var opt = document.createElement('option');
        opt.value = c;
        opt.textContent = categoryLabel(c);
        catSel.appendChild(opt);
      });
    }
    renderWorkersList('');
  }

  function loadQAPersonnel() {
    if (!(window.QA_CONFIG && window.QA_CONFIG.useBackend)) return;
    qaApi.getPersonnel().then(function (data) {
      if (data && Array.isArray(data.supervisors)) supervisorsData = data.supervisors;
      if (data && Array.isArray(data.workers)) workersData = data.workers;
      refreshPersonnelUI();
    }).catch(function () {});
  }

  document.getElementById('qa-job-cancel').addEventListener('click', function () { showView('home'); });

  document.getElementById('qa-job-create').addEventListener('click', function () {
    var projectId = projectSelect && projectSelect.value;
    if (!projectId) return;
    var templateIds = [];
    document.querySelectorAll('#qa-job-templates-list input[name="qa-job-template"]:checked').forEach(function (cb) { templateIds.push(cb.value); });
    var workerIds = [];
    document.querySelectorAll('#qa-workers-list input[name="qa-worker"]:checked').forEach(function (cb) { workerIds.push(cb.value); });
    var includeCost = document.getElementById('qa-job-include-cost') && document.getElementById('qa-job-include-cost').checked;
    var costType = includeCost ? document.getElementById('qa-work-type-value').value : '';
    var costValue = '';
    if (costType === 'day') costValue = (document.getElementById('qa-job-days') && document.getElementById('qa-job-days').value) || '';
    else if (costType === 'hour') costValue = (document.getElementById('qa-job-hours') && document.getElementById('qa-job-hours').value) || '';
    else if (costType === 'price') costValue = (document.getElementById('qa-job-total-price') && document.getElementById('qa-job-total-price').value) || '';
    var targetDate = (document.getElementById('qa-job-target-date') && document.getElementById('qa-job-target-date').value) || '';
    var createdBy = (typeof window.qaCurrentUserName === 'string' && window.qaCurrentUserName.trim()) ? window.qaCurrentUserName.trim() : '';
    var jobTitle = (document.getElementById('qa-job-title') && document.getElementById('qa-job-title').value || '').trim();
    if (!jobTitle) {
      showToast('Job title is required.', 'error');
      return;
    }
    var job = {
      projectId: projectId,
      jobTitle: jobTitle,
      floor: (document.getElementById('qa-job-floor') && document.getElementById('qa-job-floor').value) || '',
      location: (document.getElementById('qa-job-location') && document.getElementById('qa-job-location').value) || '',
      sqm: (document.getElementById('qa-job-sqm') && document.getElementById('qa-job-sqm').value) || '',
      linearMeters: (document.getElementById('qa-job-linear') && document.getElementById('qa-job-linear').value) || '',
      specification: (document.getElementById('qa-job-spec') && document.getElementById('qa-job-spec').value) || '',
      description: (document.getElementById('qa-job-description') && document.getElementById('qa-job-description').value) || '',
      targetCompletionDate: targetDate,
      createdAt: new Date().toISOString(),
      createdBy: createdBy,
      templateIds: templateIds,
      costIncluded: !!includeCost,
      costType: costType,
      costValue: costValue,
      responsibleId: (document.getElementById('qa-job-responsible') && document.getElementById('qa-job-responsible').value) || '',
      workerIds: workerIds,
      status: 'new',
      notes: ''
    };
    qaApi.createJob(job).then(function () {
      showToast('Job created.', 'success');
      showView('home');
    }).catch(function (err) {
      showToast(err && err.message ? err.message : 'Failed to create job.', 'error');
    });
  });

  /* ——— Jobs overview ——— */
  function getFilterState() {
    return {
      search: (document.getElementById('qa-view-jobs-search') && document.getElementById('qa-view-jobs-search').value.trim().toLowerCase()) || '',
      floor: document.getElementById('qa-view-jobs-floor') && document.getElementById('qa-view-jobs-floor').value,
      cost: document.getElementById('qa-view-jobs-cost') && document.getElementById('qa-view-jobs-cost').value,
      status: document.getElementById('qa-view-jobs-status') && document.getElementById('qa-view-jobs-status').value,
      dateFrom: document.getElementById('qa-view-jobs-date-from') && document.getElementById('qa-view-jobs-date-from').value,
      dateTo: document.getElementById('qa-view-jobs-date-to') && document.getElementById('qa-view-jobs-date-to').value
    };
  }

  function filterJobs(jobs, templates) {
    var f = getFilterState();
    if (f.search) {
      jobs = jobs.filter(function (j) {
        var num = (j.jobNumber || '').toLowerCase();
        var loc = (j.location || '').toLowerCase();
        var spec = (j.specification || '').toLowerCase();
        var jt = (j.jobTitle || '').toLowerCase();
        return num.indexOf(f.search) !== -1 || loc.indexOf(f.search) !== -1 || spec.indexOf(f.search) !== -1
          || jt.indexOf(f.search) !== -1;
      });
    }
    if (f.floor) jobs = jobs.filter(function (j) { return (j.floor || '') === f.floor; });
    if (f.cost) {
      if (f.cost === 'none') jobs = jobs.filter(function (j) { return !j.costIncluded || !j.costType; });
      else jobs = jobs.filter(function (j) { return j.costType === f.cost; });
    }
    if (f.status) jobs = jobs.filter(function (j) { return (j.status || 'new') === f.status; });
    if (f.dateFrom || f.dateTo) {
      jobs = jobs.filter(function (j) {
        var target = (j.targetCompletionDate || '').toString().trim();
        if (!target) return false;
        var norm = target.indexOf('T') !== -1 ? target.slice(0, 10) : target;
        if (f.dateFrom && norm < f.dateFrom) return false;
        if (f.dateTo && norm > f.dateTo) return false;
        return true;
      });
    }
    return jobs;
  }

  function renderJobsOverview(showSkeleton) {
    var projectId = projectSelect && projectSelect.value;
    var listEl = document.getElementById('qa-view-jobs-list');
    var tableWrap = document.getElementById('qa-view-jobs-table-wrap');
    var emptyEl = document.getElementById('qa-view-jobs-empty');
    var noMatch = document.getElementById('qa-view-jobs-no-match');
    var sk = document.getElementById('qa-jobs-skeleton');
    if (!projectId || !listEl) return;

    if (showSkeleton && sk) {
      sk.classList.remove('d-none');
      listEl.innerHTML = '';
      if (tableWrap) tableWrap.innerHTML = '';
    }

    qaApi.getJobs(projectId).then(function (allJobs) {
      if (sk) sk.classList.add('d-none');
      var jobs = allJobs || [];
      return qaApi.getTemplates(projectId).then(function (templates) {
        if (jobs.length === 0) {
          if (emptyEl) emptyEl.classList.remove('d-none');
          if (noMatch) noMatch.classList.add('d-none');
          listEl.innerHTML = '';
          if (tableWrap) { tableWrap.innerHTML = ''; tableWrap.classList.add('d-none'); }
          return;
        }
        if (emptyEl) emptyEl.classList.add('d-none');
        var filtered = filterJobs(jobs.slice(), templates);
        if (filtered.length === 0) {
          if (noMatch) noMatch.classList.remove('d-none');
          listEl.innerHTML = '';
          if (tableWrap) { tableWrap.innerHTML = ''; tableWrap.classList.add('d-none'); }
          return;
        }
        if (noMatch) noMatch.classList.add('d-none');

        if (jobsLayoutMode === 'table') {
          listEl.classList.add('d-none');
          tableWrap.classList.remove('d-none');
          renderJobsTable(filtered, templates, projectId);
        } else {
          listEl.classList.remove('d-none');
          tableWrap.classList.add('d-none');
          renderJobsCards(filtered, templates, projectId);
        }
        iconsRefresh();
      });
    });
  }

  function renderJobsCards(jobs, templates, projectId) {
    var listEl = document.getElementById('qa-view-jobs-list');
    listEl.innerHTML = '';
    jobs.forEach(function (job) {
      var hasJT = String(job.jobTitle || '').trim();
      var title = escapeHtml(hasJT || job.jobNumber || job.location || 'Job');
      var refLine = (hasJT && job.jobNumber) ? '<p class="qa-job-card-pro__ref">' + escapeHtml(job.jobNumber) + '</p>' : '';
      var specExtra = '';
      var sum = jobSpecificationOrDescSummary(job);
      if (hasJT) {
        if (sum && sum !== hasJT) specExtra = '<p class="qa-job-card-pro__jobtitle">' + escapeHtml(sum) + '</p>';
      } else if (sum) {
        specExtra = '<p class="qa-job-card-pro__jobtitle">' + escapeHtml(sum) + '</p>';
      }
      var st = job.status || 'new';
      var card = document.createElement('article');
      card.className = 'qa-job-card-pro';
      card.setAttribute('data-job-id', job.id);
      card.innerHTML =
        '<div class="qa-job-card-pro__top">' +
          '<div><h3 class="qa-job-card-pro__title">' + title + '</h3>' +
          refLine +
          specExtra +
          '<p class="qa-job-card-pro__meta">' + escapeHtml(job.location || '—') + '</p></div>' +
          '<div class="qa-job-menu-wrap">' +
            '<button type="button" class="qa-job-menu-btn" aria-label="Menu" data-menu="' + escapeHtml(job.id) + '"><i data-lucide="more-vertical"></i></button>' +
            '<div class="qa-dropdown d-none" id="qa-menu-' + escapeHtml(job.id) + '">' +
              '<button type="button" data-act="view">View / update</button>' +
              (QA_SUPERVISOR_MODE
                ? ''
                : '<button type="button" data-act="dup">Duplicate</button>') +
              '<button type="button" data-act="arch">Archive</button>' +
              (QA_SUPERVISOR_MODE ? '' : '<button type="button" data-act="del">Delete</button>') +
            '</div></div></div>' +
        '<span class="qa-badge ' + statusBadgeClass(st) + '">' + escapeHtml(getStatusLabel(st)) + '</span>' +
        '<p class="qa-job-card-pro__row"><i data-lucide="layers" style="width:14px;height:14px;vertical-align:middle;"></i> Level: ' + escapeHtml(job.floor || '—') + ' · ' + escapeHtml(getCostDisplay(job)) + '</p>' +
        '<p class="qa-job-card-pro__row"><i data-lucide="calendar" style="width:14px;height:14px;vertical-align:middle;"></i> Due: ' + escapeHtml(formatJobDate(job.targetCompletionDate)) + '</p>' +
        '<p class="qa-job-card-pro__row">Supervisor: ' + escapeHtml(getSupervisorName(job.responsibleId)) + ' · Workers: ' + (job.workerIds ? job.workerIds.length : 0) + '</p>' +
        (job.stepPhotoCount > 0
          ? '<div class="qa-job-card-pro__photos">' +
            (job.stepPhotoPreviewUrl
              ? '<img src="' +
                escapeHtml(job.stepPhotoPreviewUrl) +
                '" alt="" class="qa-job-card-pro__photo-prev" loading="lazy" width="56" height="56">'
              : '') +
            '<span class="qa-job-card-pro__photo-count"><i data-lucide="image" style="width:14px;height:14px;vertical-align:middle;"></i> ' +
            escapeHtml(String(job.stepPhotoCount)) +
            ' photo' +
            (job.stepPhotoCount === 1 ? '' : 's') +
            '</span></div>'
          : '');
      listEl.appendChild(card);

      var menuBtn = card.querySelector('.qa-job-menu-btn');
      var dropdown = card.querySelector('.qa-dropdown');
      menuBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        document.querySelectorAll('.qa-dropdown').forEach(function (d) { if (d !== dropdown) d.classList.add('d-none'); });
        dropdown.classList.toggle('d-none');
        openJobMenuId = job.id;
      });
      dropdown.querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () {
          var act = b.getAttribute('data-act');
          dropdown.classList.add('d-none');
          if (act === 'view') openJobDrawer(job);
          else if (act === 'dup') duplicateJob(job, projectId);
          else if (act === 'arch') archiveJob(job, projectId);
          else if (act === 'del') deleteJobConfirm(job, projectId);
        });
      });
    });
  }

  function renderJobsTable(jobs, templates, projectId) {
    var tableWrap = document.getElementById('qa-view-jobs-table-wrap');
    var rows = jobs.map(function (job) {
      var rowSub = String(job.jobTitle || '').trim() || jobSpecificationOrDescSummary(job);
      var photoCell =
        job.stepPhotoCount > 0
          ? '<span class="qa-tbl-photo-cell">' +
            (job.stepPhotoPreviewUrl
              ? '<img src="' + escapeHtml(job.stepPhotoPreviewUrl) + '" alt="" class="qa-tbl-photo-thumb" width="40" height="40" loading="lazy">'
              : '') +
            '<span class="qa-tbl-photo-num">' +
            escapeHtml(String(job.stepPhotoCount)) +
            '</span></span>'
          : '—';
      return '<tr data-id="' + escapeHtml(job.id) + '">' +
        '<td>' +
        escapeHtml(job.jobNumber || '—') +
        (rowSub ? '<br><span class="qa-tbl-subtitle">' + escapeHtml(rowSub) + '</span>' : '') +
        '</td>' +
        '<td><span class="qa-badge ' + statusBadgeClass(job.status) + '">' + escapeHtml(getStatusLabel(job.status)) + '</span></td>' +
        '<td>' + escapeHtml(job.floor || '—') + '</td>' +
        '<td>' + escapeHtml(getCostDisplay(job)) + '</td>' +
        '<td>' + escapeHtml(formatJobDate(job.targetCompletionDate)) + '</td>' +
        '<td>' + photoCell + '</td>' +
        '<td><button type="button" class="qa-btn qa-btn--ghost qa-btn--sm qa-tbl-open" data-id="' + escapeHtml(job.id) + '">Open</button></td>' +
        '</tr>';
    }).join('');
    tableWrap.innerHTML =
      '<table class="qa-table"><thead><tr><th>Title</th><th>Status</th><th>Level</th><th>Cost</th><th>Deadline</th><th>Photos</th><th>Actions</th></tr></thead><tbody>' +
      rows +
      '</tbody></table>';
    tableWrap.querySelectorAll('.qa-tbl-open').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        var j = jobs.find(function (x) { return x.id === id; });
        if (j) openJobDrawer(j);
      });
    });
  }

  document.addEventListener('click', function () {
    document.querySelectorAll('.qa-dropdown').forEach(function (d) { d.classList.add('d-none'); });
  });

  document.getElementById('qa-view-jobs-search').addEventListener('input', debounce('jobs', function () { renderJobsOverview(false); }, 300));
  ['qa-view-jobs-floor', 'qa-view-jobs-cost', 'qa-view-jobs-status', 'qa-view-jobs-date-from', 'qa-view-jobs-date-to'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', function () { renderJobsOverview(false); });
  });

  document.getElementById('qa-jobs-reset-filters').addEventListener('click', function () {
    document.getElementById('qa-view-jobs-search').value = '';
    document.getElementById('qa-view-jobs-floor').value = '';
    document.getElementById('qa-view-jobs-cost').value = '';
    document.getElementById('qa-view-jobs-status').value = '';
    document.getElementById('qa-view-jobs-date-from').value = '';
    document.getElementById('qa-view-jobs-date-to').value = '';
    renderJobsOverview(false);
  });

  document.getElementById('qa-jobs-layout-cards').addEventListener('click', function () {
    jobsLayoutMode = 'cards';
    document.getElementById('qa-jobs-layout-cards').classList.add('is-active');
    document.getElementById('qa-jobs-layout-table').classList.remove('is-active');
    renderJobsOverview(false);
  });
  document.getElementById('qa-jobs-layout-table').addEventListener('click', function () {
    jobsLayoutMode = 'table';
    document.getElementById('qa-jobs-layout-table').classList.add('is-active');
    document.getElementById('qa-jobs-layout-cards').classList.remove('is-active');
    renderJobsOverview(false);
  });

  function duplicateJob(job, projectId) {
    var copy = Object.assign({}, job);
    delete copy.id;
    delete copy.jobNumber;
    copy.status = 'new';
    copy.createdAt = new Date().toISOString();
    copy.notes = (copy.notes || '') + '\n[Duplicated from ' + (job.jobNumber || '') + ']';
    if (!(copy.jobTitle && String(copy.jobTitle).trim())) {
      copy.jobTitle = ((job.jobNumber || job.id || 'Job') + ' (copy)').slice(0, 500);
    }
    qaApi.createJob(copy).then(function () {
      showToast('Job duplicated.', 'success');
      renderJobsOverview(false);
    }).catch(function (e) { showToast(e.message || 'Failed', 'error'); });
  }

  function archiveJob(job, projectId) {
    qaApi.updateJob(job.id, { status: 'archived' }).then(function () {
      showToast('Job archived.', 'success');
      renderJobsOverview(false);
    }).catch(function (e) { showToast(e.message || 'Failed', 'error'); });
  }

  function deleteJobConfirm(job, projectId) {
    openConfirm('Delete job ' + (job.jobNumber || job.id) + '?').then(function (ok) {
      if (!ok) return;
      qaApi.deleteJob(job.id).then(function () {
        renderJobsOverview(false);
      }).catch(function (e) { showToast(e.message || 'Failed', 'error'); });
    });
  }

  /* ——— Job drawer ——— */
  var layerJob = document.getElementById('qa-layer-job');

  function openJobDrawer(job) {
    document.getElementById('qa-job-panel-id').value = job.id;
    document.getElementById('qa-job-drawer-title').textContent = job.jobNumber || 'Job';
    var subEl = document.getElementById('qa-job-drawer-subtitle');
    var sideTit = jobSideTitle(job);
    var drawerEl = document.getElementById('qa-job-drawer');
    subEl.textContent = sideTit;
    if (sideTit) drawerEl.setAttribute('aria-describedby', 'qa-job-drawer-subtitle');
    else drawerEl.removeAttribute('aria-describedby');
    document.getElementById('qa-job-drawer-status').value = job.status || 'new';
    document.getElementById('qa-job-drawer-notes').value = job.notes || '';
    var workerNames = getWorkerNames(job.workerIds || []);
    var projId = job.projectId || (projectSelect && projectSelect.value);
    var evFn = typeof qaApi.getJobStepEvidence === 'function'
      ? qaApi.getJobStepEvidence(job.id)
      : Promise.resolve({ steps: [], operativePhotos: [] });
    Promise.all([qaApi.getTemplates(projId), evFn]).then(function (results) {
      var templates = results[0] || [];
      var evPayload = results[1] || { steps: [], operativePhotos: [] };
      var tplNames = getTemplateNames(templates, job.templateIds || []);
      var specStr = String(job.specification || '').trim();
      var descStr = String(job.description || '').trim();
      var jtStr = String(job.jobTitle || '').trim();
      var html =
        '<dl class="qa-dl">' +
        '<dt>Job title</dt><dd>' + (jtStr ? escapeHtml(jtStr) : '—') + '</dd>' +
        '<dt>Job reference</dt><dd>' + escapeHtml(job.jobNumber || '—') + '</dd>' +
        '<dt>Specification</dt><dd>' + (specStr ? escapeHtml(specStr) : '—') + '</dd>' +
        '<dt>Description</dt><dd class="qa-dl__preline">' + (descStr ? escapeHtml(descStr) : '—') + '</dd>' +
        '<dt>Location</dt><dd>' + escapeHtml(job.location || '—') + '</dd>' +
        '<dt>Floor</dt><dd>' + escapeHtml(job.floor || '—') + '</dd>' +
        '<dt>Cost</dt><dd>' + escapeHtml(getCostDisplay(job)) + '</dd>' +
        '<dt>Target</dt><dd>' + escapeHtml(formatJobDate(job.targetCompletionDate)) + '</dd>' +
        '<dt>Templates</dt><dd>' + (tplNames.length ? tplNames.map(escapeHtml).join(', ') : '—') + '</dd>' +
        '<dt>Team</dt><dd>' + escapeHtml(getSupervisorName(job.responsibleId)) + ' · ' + (workerNames.length ? workerNames.map(escapeHtml).join(', ') : '—') + '</dd>' +
        '</dl>' +
        buildJobEvidenceSection(evPayload.steps, templates, evPayload.operativePhotos || []);
      document.getElementById('qa-job-drawer-readonly').innerHTML = html;
      openLayer(layerJob, true);
      iconsRefresh();
    });
  }

  function closeJobDrawer() {
    openLayer(layerJob, false);
  }

  document.getElementById('qa-job-drawer-backdrop').addEventListener('click', closeJobDrawer);
  document.getElementById('qa-job-drawer-close').addEventListener('click', closeJobDrawer);
  document.getElementById('qa-job-drawer-cancel').addEventListener('click', closeJobDrawer);

  document.getElementById('qa-job-drawer-save').addEventListener('click', function () {
    var id = document.getElementById('qa-job-panel-id').value;
    var status = document.getElementById('qa-job-drawer-status').value;
    var notes = document.getElementById('qa-job-drawer-notes').value;
    var projectId = projectSelect && projectSelect.value;
    qaApi.updateJob(id, { status: status, notes: notes }).then(function () {
      closeJobDrawer();
      if (currentView === 'jobs') renderJobsOverview(false);
      showToast('Job updated.', 'success');
    }).catch(function (e) { showToast(e.message || 'Failed', 'error'); });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (layerTemplate && !layerTemplate.classList.contains('d-none')) closeTemplateDrawer();
    else if (layerJob && !layerJob.classList.contains('d-none')) closeJobDrawer();
  });

  refreshPersonnelUI();
  loadQAPersonnel();
  loadQaProjects();
  enableModuleCards();
  iconsRefresh();

  if (QA_SUPERVISOR_MODE) {
    document.body.classList.add('qa-supervisor-mode');
    ['qa-lib-new-template', 'qa-lib-empty-cta'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.add('d-none');
    });
    var tplCard = document.querySelector('#qa-module-cards [data-action="template"]');
    if (tplCard) tplCard.classList.add('d-none');
  }
})();
