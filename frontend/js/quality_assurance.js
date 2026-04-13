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
  /** Templates for current project, refreshed when opening job create (for price estimate). */
  var jobCreateTemplatesCache = [];

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

  /** Company crews from GET /api/crews (manager); used in Create QA Job personnel tab. */
  var crewsData = [];

  /** Materials catalogue for the selected project (Create QA Job → Step materials). */
  var jobCreateMaterialsCache = [];
  /** Material categories (manager / supervisor API). */
  var jobCreateCategoriesCache = [];
  /** stepKey → material id strings (legacy job UI; job materials now come from template). */
  var qaJobCreateMaterialPicks = {};
  /** stepKey → material id strings for Create / Edit template wizard (step 2). */
  var qaTemplateDrawerMaterialPicks = {};
  /** 1 = name+steps, 2 = step materials. */
  var templateDrawerWizardStep = 1;
  /** Latest full template from API while creating a job (includes stepMaterials for defaults). */
  var jobCreateActiveTemplateDetail = null;

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
        var sid = String(id);
        var t = _templates.find(function (x) { return String(x.id) === sid; });
        return Promise.resolve(t ? Object.assign({}, t) : null);
      },
      createTemplate: function (data) {
        var id = 'tpl_' + Date.now();
        var createdBy = (typeof window.qaCurrentUserName === 'string' && window.qaCurrentUserName.trim()) ? window.qaCurrentUserName.trim() : '';
        var sm = data.stepMaterials && typeof data.stepMaterials === 'object' ? data.stepMaterials : {};
        var created = {
          id: id,
          name: data.name,
          steps: data.steps || [],
          stepMaterials: sm,
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
          stepMaterials: data.stepMaterials && typeof data.stepMaterials === 'object' ? data.stepMaterials : {},
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
      },
      getCrews: function () { return Promise.resolve([]); }
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

  function fetchMaterialsForProject(projectId) {
    var url = QA_SUPERVISOR_MODE
      ? '/api/materials/supervisor?projectId=' + encodeURIComponent(projectId)
      : '/api/materials?projectId=' + encodeURIComponent(projectId);
    return fetch(url, { credentials: 'same-origin', headers: getQASessionHeaders() })
      .then(function (res) {
        if (!res.ok) return [];
        return res.json();
      })
      .catch(function () {
        return [];
      });
  }

  /** Unify API shape (camelCase vs snake_case) and treat empty as null. */
  function normalizeMaterialRow(m) {
    if (!m || typeof m !== 'object') return m;
    var raw = m.categoryId != null && m.categoryId !== '' ? m.categoryId : m.category_id;
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      return Object.assign({}, m, { categoryId: null });
    }
    return Object.assign({}, m, { categoryId: raw });
  }

  function qaMaterialCategoryIdString(m) {
    if (!m || m.categoryId == null || m.categoryId === '') return '';
    return String(m.categoryId).trim();
  }

  function qaCategoryIdsMatch(materialCat, selectedVal) {
    if (selectedVal == null || selectedVal === '') return false;
    var a = String(materialCat).trim();
    var b = String(selectedVal).trim();
    if (a === b) return true;
    var na = Number(a);
    var nb = Number(b);
    return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
  }

  function loadJobCreateMaterialsCatalog() {
    var pid = projectSelect && projectSelect.value;
    if (!pid || !(window.QA_CONFIG && window.QA_CONFIG.useBackend)) {
      jobCreateMaterialsCache = [];
      return Promise.resolve();
    }
    return fetchMaterialsForProject(pid).then(function (rows) {
      var raw = Array.isArray(rows) ? rows : [];
      jobCreateMaterialsCache = raw.map(normalizeMaterialRow);
    });
  }

  function fetchMaterialCategories() {
    var url = QA_SUPERVISOR_MODE ? '/api/materials/supervisor/categories' : '/api/materials/categories';
    return fetch(url, { credentials: 'same-origin', headers: getQASessionHeaders() })
      .then(function (res) {
        if (!res.ok) return [];
        return res.json();
      })
      .catch(function () {
        return [];
      });
  }

  function loadJobCreateCategoriesCatalog() {
    if (!(window.QA_CONFIG && window.QA_CONFIG.useBackend)) {
      jobCreateCategoriesCache = [];
      return Promise.resolve();
    }
    return fetchMaterialCategories().then(function (rows) {
      jobCreateCategoriesCache = Array.isArray(rows) ? rows : [];
    });
  }

  function materialPicksForStep(stepKey, picksRef) {
    picksRef = picksRef || qaJobCreateMaterialPicks;
    if (!picksRef[stepKey]) picksRef[stepKey] = [];
    return picksRef[stepKey];
  }

  /**
   * @param {string} stepKey
   * @param {string} categoryVal
   * @param {{ scopeRoot?: HTMLElement, picksRef?: Object }} [opts]
   */
  function fillMaterialsForCategory(stepKey, categoryVal, opts) {
    opts = opts || {};
    var scope = opts.scopeRoot || document.getElementById('qa-view-job-create');
    if (!scope) return;
    var picksRef = opts.picksRef || qaJobCreateMaterialPicks;
    var wrap = null;
    scope.querySelectorAll('.qa-job-step-material-mats').forEach(function (w) {
      if (w.getAttribute('data-step-key') === stepKey) wrap = w;
    });
    if (!wrap) return;
    var picks = materialPicksForStep(stepKey, picksRef);
    if (!categoryVal) {
      wrap.innerHTML = '<p class="qa-message" style="margin-top:0.35rem;">Select a category to list materials.</p>';
      return;
    }
    var selectedCat =
      categoryVal !== '__all__' && categoryVal !== '__uncat__'
        ? jobCreateCategoriesCache.find(function (c) {
            return qaCategoryIdsMatch(c.id, categoryVal);
          })
        : null;
    var selectedNameNorm = selectedCat && selectedCat.name ? String(selectedCat.name).trim().toLowerCase() : '';

    var list = jobCreateMaterialsCache.filter(function (m) {
      var cid = qaMaterialCategoryIdString(m);
      if (categoryVal === '__all__') return true;
      if (categoryVal === '__uncat__') return !cid;
      if (cid && qaCategoryIdsMatch(cid, categoryVal)) return true;
      if (selectedNameNorm && String(m.categoryName || '').trim().toLowerCase() === selectedNameNorm) return true;
      return false;
    });
    if (!list.length) {
      wrap.innerHTML = '<p class="qa-message" style="margin-top:0.35rem;">No materials in this category for this project.</p>';
      return;
    }
    wrap.innerHTML = '';
    var inner = document.createElement('div');
    inner.className = 'qa-checklist';
    inner.style.marginTop = '0.35rem';
    list.forEach(function (m) {
      var mid = String(m.id);
      var nm = (m.name || '') + (m.supplierName ? ' · ' + m.supplierName : '');
      if (m.unit) nm += ' (' + m.unit + ')';
      var lab = document.createElement('label');
      lab.className = 'qa-check-item';
      var checked = picks.indexOf(mid) !== -1;
      lab.innerHTML =
        '<input type="checkbox" class="qa-job-mat-cb" data-step-key="' +
        escapeHtml(stepKey) +
        '" value="' +
        escapeHtml(mid) +
        '"' +
        (checked ? ' checked' : '') +
        '> <span>' +
        escapeHtml(nm) +
        '</span>';
      inner.appendChild(lab);
    });
    wrap.appendChild(inner);
  }

  function renderTemplateStepMaterialsForm(templateDraft, picksRef) {
    var container = document.getElementById('qa-template-step-materials');
    if (!container) return;
    picksRef = picksRef || qaTemplateDrawerMaterialPicks;
    if (!templateDraft || !templateDraft.steps || !templateDraft.steps.length) {
      container.innerHTML = '<p class="qa-message">Add at least one step on the previous screen.</p>';
      return;
    }
    if (!(window.QA_CONFIG && window.QA_CONFIG.useBackend)) {
      container.innerHTML = '<p class="qa-message">Step materials are saved with the template when using the server.</p>';
      return;
    }
    if (!jobCreateMaterialsCache.length) {
      container.innerHTML =
        '<p class="qa-message">No materials in the catalogue for this project. Add items under <strong>Dashboard → Materials</strong>, then open this template again.</p>';
      return;
    }
    container.innerHTML = '';
    var drawer = document.getElementById('qa-template-drawer');
    var scopeRoot = drawer || document.getElementById('qa-layer-template');
    var hasCategories = jobCreateCategoriesCache.length > 0;
    var hasUncat = jobCreateMaterialsCache.some(function (m) {
      return !qaMaterialCategoryIdString(m);
    });

    templateDraft.steps.forEach(function (s, i) {
      var key = jobStepKey(templateDraft.id, s.id);
      var title = 'Step ' + (i + 1) + (s.description ? ' — ' + String(s.description).trim() : '');
      var sec = document.createElement('div');
      sec.className = 'qa-step-materials-block';
      sec.style.marginBottom = '1.25rem';
      var h = document.createElement('div');
      h.className = 'qa-label';
      h.style.marginBottom = '0.35rem';
      h.textContent = title;
      sec.appendChild(h);

      var matsWrap = document.createElement('div');
      matsWrap.className = 'qa-job-step-material-mats';
      matsWrap.setAttribute('data-step-key', key);

      if (hasCategories || hasUncat) {
        var labCat = document.createElement('label');
        labCat.className = 'qa-label';
        labCat.setAttribute('for', 'qa-tpl-mat-cat-' + String(templateDraft.id) + '-' + i);
        labCat.textContent = 'Category';
        labCat.style.display = 'block';
        labCat.style.marginBottom = '0.25rem';
        sec.appendChild(labCat);
        var catSel = document.createElement('select');
        catSel.id = 'qa-tpl-mat-cat-' + String(templateDraft.id) + '-' + i;
        catSel.className = 'qa-select qa-job-step-material-cat';
        catSel.setAttribute('data-step-key', key);
        catSel.innerHTML = '<option value="">— Select category —</option>';
        jobCreateCategoriesCache.forEach(function (c) {
          var opt = document.createElement('option');
          opt.value = String(c.id);
          opt.textContent = c.name || 'Category';
          catSel.appendChild(opt);
        });
        if (hasUncat) {
          var ou = document.createElement('option');
          ou.value = '__uncat__';
          ou.textContent = 'Uncategorised';
          catSel.appendChild(ou);
        }
        sec.appendChild(catSel);
        matsWrap.innerHTML = '<p class="qa-message" style="margin-top:0.35rem;">Select a category to list materials.</p>';
      } else {
        var hint = document.createElement('p');
        hint.className = 'qa-message';
        hint.style.marginBottom = '0.35rem';
        hint.textContent =
          'No material categories in the catalogue. All project materials are listed below for this step.';
        sec.appendChild(hint);
        matsWrap.innerHTML = '';
      }

      sec.appendChild(matsWrap);
      container.appendChild(sec);

      if (!hasCategories && !hasUncat) {
        fillMaterialsForCategory(key, '__all__', { scopeRoot: scopeRoot, picksRef: picksRef });
      }
    });
  }

  function hydrateTemplateMaterialPicksFromServer(templateIdStr, stepMaterials) {
    qaTemplateDrawerMaterialPicks = {};
    if (!stepMaterials || typeof stepMaterials !== 'object') return;
    Object.keys(stepMaterials).forEach(function (stepExt) {
      var key = jobStepKey(templateIdStr, stepExt);
      var arr = stepMaterials[stepExt];
      qaTemplateDrawerMaterialPicks[key] = Array.isArray(arr) ? arr.map(String) : [];
    });
  }

  function collectTemplateStepMaterialsPayload(templateIdStr, steps) {
    var out = {};
    (steps || []).forEach(function (s) {
      if (!s || s.id == null) return;
      var key = jobStepKey(templateIdStr, s.id);
      var arr = qaTemplateDrawerMaterialPicks[key];
      if (arr && arr.length) out[String(s.id)] = arr.slice();
    });
    return out;
  }

  function collectJobCreateStepMaterials() {
    var t = jobCreateActiveTemplateDetail;
    if (!t || !t.id || !t.steps) return {};
    var sm = t.stepMaterials || {};
    var out = {};
    t.steps.forEach(function (s) {
      if (!s || s.id == null) return;
      var mids = sm[s.id];
      if (mids && mids.length) {
        out[jobStepKey(t.id, s.id)] = mids.map(String).slice();
      }
    });
    return out;
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
      if (data.stepMaterials != null && typeof data.stepMaterials === 'object') body.stepMaterials = data.stepMaterials;
      return qaFetch('/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    },
    updateTemplate: function (id, data) {
      var body = { name: data.name, steps: data.steps || [] };
      if (data.stepMaterials != null && typeof data.stepMaterials === 'object') body.stepMaterials = data.stepMaterials;
      return qaFetch('/templates/' + encodeURIComponent(id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
    },
    /** Operatives → Crews (manager session). Not under /api/qa; uses /api/crews. */
    getCrews: function () {
      return fetch('/api/crews', {
        headers: Object.assign({}, getQASessionHeaders(), { Accept: 'application/json' }),
        credentials: 'same-origin',
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (!data || !data.success || !Array.isArray(data.crews)) return [];
          return data.crews.map(function (c) {
            return {
              id: String(c.id),
              name: (c.name && String(c.name).trim()) || ('Crew ' + c.id),
              memberCount: c.member_count,
            };
          });
        })
        .catch(function () { return []; });
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

  /**
   * Job price from template rates × job quantities (all selected templates, all steps):
   * Σ(price/m²)×job sqm + Σ(price/m lin)×job linear m + Σ(price/unit)×job units.
   */
  function computeJobTemplatePriceEstimate(templates, templateIds, sqmStr, linearStr, unitsStr) {
    var ids = (templateIds || []).map(String).filter(Boolean);
    if (!ids.length || !templates || !templates.length) return null;
    var sumM2 = 0;
    var sumLin = 0;
    var sumUnit = 0;
    templates.forEach(function (t) {
      if (ids.indexOf(String(t.id)) === -1) return;
      (t.steps || []).forEach(function (s) {
        var m = parseFloat(s.pricePerM2);
        var ln = parseFloat(s.pricePerLinear);
        var u = parseFloat(s.pricePerUnit);
        if (m === m) sumM2 += m;
        if (ln === ln) sumLin += ln;
        if (u === u) sumUnit += u;
      });
    });
    if (!(sumM2 > 0 || sumLin > 0 || sumUnit > 0)) return null;
    var S = parseFloat(sqmStr) || 0;
    var L = parseFloat(linearStr) || 0;
    var U = parseFloat(unitsStr) || 0;
    var m2Part = sumM2 * S;
    var linPart = sumLin * L;
    var unitPart = sumUnit * U;
    var total = m2Part + linPart + unitPart;
    return {
      mode: 'global',
      total: total,
      sumM2: sumM2,
      sumLin: sumLin,
      sumUnit: sumUnit,
      m2Part: m2Part,
      linPart: linPart,
      unitPart: unitPart,
      S: S,
      L: L,
      U: U,
    };
  }

  function jobStepKey(templateId, stepId) {
    return String(templateId) + ':' + String(stepId);
  }

  function hasPositiveStepRate(v) {
    var n = parseFloat(v);
    return v != null && String(v).trim() !== '' && n === n && n > 0;
  }

  /**
   * Price from each template step’s rate × quantity entered for that step (m² / linear / units).
   */
  function computeJobPriceFromStepQuantities(templates, templateIds, stepQuantities) {
    var ids = (templateIds || []).map(String).filter(Boolean);
    var sq = stepQuantities && typeof stepQuantities === 'object' ? stepQuantities : {};
    if (!ids.length || !templates || !templates.length) return null;
    var hasAnyRate = false;
    templates.forEach(function (t) {
      if (ids.indexOf(String(t.id)) === -1) return;
      (t.steps || []).forEach(function (s) {
        if (hasPositiveStepRate(s.pricePerM2) || hasPositiveStepRate(s.pricePerLinear) || hasPositiveStepRate(s.pricePerUnit)) {
          hasAnyRate = true;
        }
      });
    });
    if (!hasAnyRate) return null;
    var total = 0;
    var hintParts = [];
    templates.forEach(function (t) {
      if (ids.indexOf(String(t.id)) === -1) return;
      (t.steps || []).forEach(function (s, idx) {
        var key = jobStepKey(t.id, s.id);
        var q = sq[key] || {};
        var pm2 = parseFloat(s.pricePerM2);
        var plin = parseFloat(s.pricePerLinear);
        var pun = parseFloat(s.pricePerUnit);
        var m2 = parseFloat(q.m2);
        var lin = parseFloat(q.linear);
        var un = parseFloat(q.units);
        var stepTitle = 'Step ' + (idx + 1) + (s.description ? ' (' + String(s.description).trim().slice(0, 36) + (String(s.description).length > 36 ? '…' : '') + ')' : '');
        if (hasPositiveStepRate(s.pricePerM2) && pm2 === pm2) {
          var qm = m2 === m2 ? m2 : 0;
          var part = pm2 * qm;
          total += part;
          hintParts.push(stepTitle + ' m²: £' + part.toFixed(2));
        }
        if (hasPositiveStepRate(s.pricePerLinear) && plin === plin) {
          var ql = lin === lin ? lin : 0;
          var part2 = plin * ql;
          total += part2;
          hintParts.push(stepTitle + ' lin: £' + part2.toFixed(2));
        }
        if (hasPositiveStepRate(s.pricePerUnit) && pun === pun) {
          var qu = un === un ? un : 0;
          var part3 = pun * qu;
          total += part3;
          hintParts.push(stepTitle + ' units: £' + part3.toFixed(2));
        }
      });
    });
    return { mode: 'perStep', total: total, hintParts: hintParts };
  }

  function collectJobCreateStepQuantities() {
    var out = {};
    document.querySelectorAll('.qa-step-qty-input').forEach(function (el) {
      var key = el.getAttribute('data-step-qty-key');
      var dim = el.getAttribute('data-step-dim');
      if (!key || !dim) return;
      var v = (el.value || '').trim();
      if (!out[key]) out[key] = { m2: '', linear: '', units: '' };
      out[key][dim] = v;
    });
    return out;
  }

  function formatTemplateEstimateHint(est) {
    if (!est) return '';
    if (est.mode === 'perStep') {
      if (est.hintParts && est.hintParts.length) return est.hintParts.join(' · ');
      return 'Enter quantities for each step where the template defines a rate.';
    }
    var parts = [];
    if (est.sumM2 > 0) {
      parts.push('m²: £' + est.m2Part.toFixed(2) + ' (' + est.sumM2.toFixed(2) + '/m² × ' + est.S + ')');
    }
    if (est.sumLin > 0) {
      parts.push('linear: £' + est.linPart.toFixed(2) + ' (' + est.sumLin.toFixed(2) + '/m × ' + est.L + ')');
    }
    if (est.sumUnit > 0) {
      parts.push('units: £' + est.unitPart.toFixed(2) + ' (' + est.sumUnit.toFixed(2) + '/unit × ' + est.U + ')');
    }
    var h = parts.join(' · ');
    if (est.sumM2 > 0 && est.S <= 0) h += (h ? ' · ' : '') + 'Add total sqm to include m² component.';
    if (est.sumLin > 0 && est.L <= 0) h += (h ? ' · ' : '') + 'Add linear meters to include linear component.';
    if (est.sumUnit > 0 && est.U <= 0) h += (h ? ' · ' : '') + 'Add total units to include per-unit component.';
    return h;
  }

  function getJobTemplatePriceEstimate(job, templates) {
    if (!job) return null;
    var sq = job.stepQuantities;
    if (sq && typeof sq === 'object' && Object.keys(sq).length > 0) {
      return computeJobPriceFromStepQuantities(templates, job.templateIds, sq);
    }
    return computeJobTemplatePriceEstimate(templates, job.templateIds, job.sqm, job.linearMeters, job.totalUnits);
  }

  function formatJobCostAndEstimate(job, templates) {
    var base = getCostDisplay(job);
    var est = getJobTemplatePriceEstimate(job, templates);
    if (est && (est.mode === 'perStep' || est.total > 0 || est.sumM2 > 0 || est.sumLin > 0 || est.sumUnit > 0)) {
      var estStr = 'Est. £' + (est.total != null ? est.total : 0).toFixed(2) + ' (templates × quantities)';
      if (base === 'No cost provided') return estStr;
      return base + ' · ' + estStr;
    }
    return base;
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

  function getCrewNames(ids) {
    if (!ids || !ids.length) return [];
    return ids.map(function (id) {
      var c = crewsData.find(function (x) { return String(x.id) === String(id); });
      return c ? c.name : id;
    });
  }

  function renderDrawerSupervisorSelect(selectedId) {
    var sel = document.getElementById('qa-job-drawer-responsible');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select —</option>';
    supervisorsData.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      if (String(selectedId || '') === String(s.id)) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function renderDrawerWorkersList(selectedIds) {
    var listEl = document.getElementById('qa-job-drawer-workers-list');
    if (!listEl) return;
    var selSet = new Set((selectedIds || []).map(String));
    listEl.innerHTML = '';
    workersData.forEach(function (w) {
      var label = document.createElement('label');
      label.className = 'qa-check-item';
      var checked = selSet.has(String(w.id)) ? ' checked' : '';
      label.innerHTML =
        '<input type="checkbox" name="qa-job-drawer-worker" value="' +
        escapeHtml(w.id) +
        '"' +
        checked +
        '> <span>' +
        escapeHtml(w.name) +
        (w.category ? ' <span class="qa-message">(' + escapeHtml(categoryLabel(w.category)) + ')</span>' : '') +
        '</span>';
      listEl.appendChild(label);
    });
    if (!workersData.length) {
      listEl.innerHTML = '<p class="qa-message">No workers found.</p>';
    }
  }

  function renderDrawerCrewsList(selectedIds) {
    var listEl = document.getElementById('qa-job-drawer-crews-list');
    if (!listEl) return;
    var selSet = new Set((selectedIds || []).map(String));
    listEl.innerHTML = '';
    if (!crewsData.length) {
      listEl.innerHTML = '<p class="qa-message">No crews loaded.</p>';
      return;
    }
    crewsData.forEach(function (c) {
      var label = document.createElement('label');
      label.className = 'qa-check-item';
      var checked = selSet.has(String(c.id)) ? ' checked' : '';
      label.innerHTML =
        '<input type="checkbox" name="qa-job-drawer-crew" value="' +
        escapeHtml(c.id) +
        '"' +
        checked +
        '> <span>' +
        escapeHtml(c.name) +
        '</span>';
      listEl.appendChild(label);
    });
  }

  function parseQaCostValue(raw) {
    if (raw == null || raw === '') return null;
    var s = String(raw).trim();
    if (s.charAt(0) === '{') {
      try {
        return JSON.parse(s);
      } catch (e) {
        return { legacy: true, raw: s };
      }
    }
    return { legacy: true, raw: s };
  }

  function getCostDisplay(job) {
    if (!job.costIncluded || !job.costType) return 'No cost provided';
    var v = job.costValue || '';
    var p = parseQaCostValue(v);
    if (job.costType === 'day') {
      if (p && !p.legacy && p.days != null && p.ratePerDay != null) {
        var d = parseFloat(p.days);
        var r = parseFloat(p.ratePerDay);
        var td = (d === d ? d : 0) * (r === r ? r : 0);
        return (
          'Day work (' +
          (d === d ? d : 0) +
          ' day(s) × £' +
          (r === r ? r.toFixed(2) : '0.00') +
          '/day = £' +
          td.toFixed(2) +
          ')'
        );
      }
      var dv = p && p.legacy ? p.raw : v;
      return 'Day work (' + dv + ' day(s))';
    }
    if (job.costType === 'hour') {
      if (p && !p.legacy && p.hours != null && p.ratePerHour != null) {
        var h = parseFloat(p.hours);
        var rh = parseFloat(p.ratePerHour);
        var th = (h === h ? h : 0) * (rh === rh ? rh : 0);
        return (
          'Hour work (' +
          (h === h ? h : 0) +
          ' h × £' +
          (rh === rh ? rh.toFixed(2) : '0.00') +
          '/h = £' +
          th.toFixed(2) +
          ')'
        );
      }
      var hv = p && p.legacy ? p.raw : v;
      return 'Hour work (' + hv + ' hour(s))';
    }
    if (job.costType === 'price') {
      if (p && !p.legacy && p.total != null) return 'Price work (£' + Number(p.total).toFixed(2) + ')';
      var num = p && p.legacy ? p.raw : v;
      return 'Price work (£' + (num ? Number(num).toFixed(2) : '0.00') + ')';
    }
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
      switchJobTab('template');
      refreshJobTemplatesList();
      refreshPersonnelUI();
      loadQACrews();
      updateCostPreview();
    }
    if (name === 'jobs') {
      loadQACrews();
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
    if (currentView === 'job-create') {
      refreshJobNumberPreview();
      refreshJobTemplatesList();
    }
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

  function setTemplateWizardStep(n) {
    templateDrawerWizardStep = n;
    var s1 = document.getElementById('qa-template-wizard-step-1');
    var s2 = document.getElementById('qa-template-wizard-step-2');
    var backBtn = document.getElementById('qa-template-back');
    var nextBtn = document.getElementById('qa-template-next');
    var saveBtn = document.getElementById('qa-template-save');
    if (s1) s1.classList.toggle('d-none', n !== 1);
    if (s2) s2.classList.toggle('d-none', n !== 2);
    if (backBtn) backBtn.classList.toggle('d-none', n === 1);
    if (nextBtn) nextBtn.classList.toggle('d-none', n === 2);
    if (saveBtn) saveBtn.classList.toggle('d-none', n === 1);
    iconsRefresh();
  }

  function openTemplateDrawer(mode, templateId) {
    templateDrawerMode = mode;
    qaTemplateDrawerMaterialPicks = {};
    setTemplateWizardStep(1);
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
    setTemplateWizardStep(1);
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

  document.getElementById('qa-template-next').addEventListener('click', function () {
    var name = document.getElementById('qa-template-name').value.trim();
    if (!name) return showToast('Template name is required.', 'error');
    var steps = collectStepsFromDom();
    if (steps.length === 0) return showToast('At least one step is required.', 'error');
    var editId = document.getElementById('qa-edit-template-id').value;
    var templateDraftId = editId || 'new';
    var afterLoad = function () {
      renderTemplateStepMaterialsForm({ id: templateDraftId, steps: steps }, qaTemplateDrawerMaterialPicks);
      setTemplateWizardStep(2);
      iconsRefresh();
    };
    Promise.all([loadJobCreateMaterialsCatalog(), loadJobCreateCategoriesCatalog()]).then(function () {
      if (editId && window.QA_CONFIG && window.QA_CONFIG.useBackend) {
        qaApi.getTemplate(editId).then(function (t) {
          hydrateTemplateMaterialPicksFromServer(editId, t && t.stepMaterials);
          afterLoad();
        }).catch(function () {
          qaTemplateDrawerMaterialPicks = {};
          afterLoad();
        });
      } else {
        qaTemplateDrawerMaterialPicks = {};
        afterLoad();
      }
    });
  });

  document.getElementById('qa-template-back').addEventListener('click', function () {
    setTemplateWizardStep(1);
    iconsRefresh();
  });

  document.getElementById('qa-template-save').addEventListener('click', function () {
    var name = document.getElementById('qa-template-name').value.trim();
    if (!name) return showToast('Template name is required.', 'error');
    var steps = collectStepsFromDom();
    if (steps.length === 0) return showToast('At least one step is required.', 'error');
    var editId = document.getElementById('qa-edit-template-id').value;
    var draftId = editId || 'new';
    var stepMaterials = collectTemplateStepMaterialsPayload(draftId, steps);
    var p = editId
      ? qaApi.updateTemplate(editId, { name: name, steps: steps, stepMaterials: stepMaterials })
      : qaApi.createTemplate({ name: name, steps: steps, stepMaterials: stepMaterials });
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
  var JOB_CREATE_TAB_ORDER = ['template', 'quantities', 'details', 'cost', 'personnel'];

  function jobCreateTabIndex(tabKey) {
    var i = JOB_CREATE_TAB_ORDER.indexOf(tabKey);
    return i === -1 ? 0 : i;
  }

  function updateJobWizardFooter(activeTabKey) {
    var backBtn = document.getElementById('qa-job-wizard-back');
    var nextBtn = document.getElementById('qa-job-wizard-next');
    var createBtn = document.getElementById('qa-job-create');
    if (!backBtn || !nextBtn || !createBtn) return;
    var idx = jobCreateTabIndex(activeTabKey);
    var last = JOB_CREATE_TAB_ORDER.length - 1;
    backBtn.classList.toggle('d-none', idx <= 0);
    nextBtn.classList.toggle('d-none', idx >= last);
    createBtn.classList.toggle('d-none', idx < last);
  }

  function switchJobTab(tabKey) {
    document.querySelectorAll('#qa-view-job-create .qa-tab').forEach(function (t) {
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
    updateJobWizardFooter(tabKey);
  }

  document.querySelectorAll('#qa-view-job-create .qa-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      var key = tab.getAttribute('data-tab');
      if (key) switchJobTab(key);
    });
  });

  var wizardNextBtn = document.getElementById('qa-job-wizard-next');
  var wizardBackBtn = document.getElementById('qa-job-wizard-back');
  if (wizardNextBtn) {
    wizardNextBtn.addEventListener('click', function () {
      var active = document.querySelector('#qa-view-job-create .qa-tab.is-active');
      var key = active && active.getAttribute('data-tab') ? active.getAttribute('data-tab') : 'template';
      var idx = jobCreateTabIndex(key);
      if (idx < JOB_CREATE_TAB_ORDER.length - 1) {
        switchJobTab(JOB_CREATE_TAB_ORDER[idx + 1]);
      }
    });
  }
  if (wizardBackBtn) {
    wizardBackBtn.addEventListener('click', function () {
      var active = document.querySelector('#qa-view-job-create .qa-tab.is-active');
      var key = active && active.getAttribute('data-tab') ? active.getAttribute('data-tab') : 'template';
      var idx = jobCreateTabIndex(key);
      if (idx > 0) {
        switchJobTab(JOB_CREATE_TAB_ORDER[idx - 1]);
      }
    });
  }

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
    updateJobPriceEstimateDisplay();
    var el = document.getElementById('qa-cost-preview');
    if (!el) return;
    if (!includeCostCheck || !includeCostCheck.checked) {
      el.textContent = 'Cost not included for this job.';
      return;
    }
    var wt = document.getElementById('qa-work-type-value').value;
    if (wt === 'day') {
      var d = parseFloat(document.getElementById('qa-job-days') && document.getElementById('qa-job-days').value) || 0;
      var rd = parseFloat(document.getElementById('qa-job-rate-day') && document.getElementById('qa-job-rate-day').value) || 0;
      var td = d * rd;
      el.textContent =
        'Preview: Day work — ' + d + ' day(s) × £' + rd.toFixed(2) + '/day = £' + td.toFixed(2) + ' total.';
    } else if (wt === 'hour') {
      var h = parseFloat(document.getElementById('qa-job-hours') && document.getElementById('qa-job-hours').value) || 0;
      var rh = parseFloat(document.getElementById('qa-job-rate-hour') && document.getElementById('qa-job-rate-hour').value) || 0;
      var th = h * rh;
      el.textContent =
        'Preview: Hour work — ' + h + ' h × £' + rh.toFixed(2) + '/h = £' + th.toFixed(2) + ' total.';
    } else {
      var p = document.getElementById('qa-job-total-price') && document.getElementById('qa-job-total-price').value;
      el.textContent = 'Preview: Fixed price — £' + (p ? Number(p).toFixed(2) : '0.00');
    }
  }
  ['qa-job-days', 'qa-job-rate-day', 'qa-job-hours', 'qa-job-rate-hour', 'qa-job-total-price'].forEach(function (id) {
    var n = document.getElementById(id);
    if (n) n.addEventListener('input', updateCostPreview);
  });

  var jobCreateSection = document.getElementById('qa-view-job-create');
  if (jobCreateSection) {
    jobCreateSection.addEventListener('input', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains('qa-step-qty-input')) {
        updateJobPriceEstimateDisplay();
      }
    });
    jobCreateSection.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || !t.classList) return;
    });
  }

  var qaLayerTemplate = document.getElementById('qa-layer-template');
  if (qaLayerTemplate) {
    qaLayerTemplate.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || !t.classList) return;
      if (t.classList.contains('qa-job-step-material-cat')) {
        var sk = t.getAttribute('data-step-key');
        var drawer = document.getElementById('qa-template-drawer');
        var scopeRoot = drawer || qaLayerTemplate;
        fillMaterialsForCategory(sk, t.value, { scopeRoot: scopeRoot, picksRef: qaTemplateDrawerMaterialPicks });
        return;
      }
      if (t.classList.contains('qa-job-mat-cb')) {
        var stepKey = t.getAttribute('data-step-key');
        var mid = t.value;
        if (!stepKey || !mid) return;
        var arr = materialPicksForStep(stepKey, qaTemplateDrawerMaterialPicks);
        if (t.checked) {
          if (arr.indexOf(mid) === -1) arr.push(mid);
        } else {
          var j = arr.indexOf(mid);
          if (j !== -1) arr.splice(j, 1);
        }
      }
    });
  }

  var jobTemplatesListRoot = document.getElementById('qa-job-templates-list');
  if (jobTemplatesListRoot) {
    jobTemplatesListRoot.addEventListener('change', function (e) {
      if (e.target && e.target.name === 'qa-job-base-template') {
        renderJobStepQuantityForm(e.target.value);
      }
    });
  }

  var applyEstBtn = document.getElementById('qa-job-apply-estimate');
  if (applyEstBtn) {
    if (QA_SUPERVISOR_MODE) {
      applyEstBtn.classList.add('d-none');
    } else {
      applyEstBtn.addEventListener('click', function () {
        var est = computeJobPriceFromStepQuantities(
          jobCreateTemplatesCache,
          getJobCreateFormSelectedTemplateIds(),
          collectJobCreateStepQuantities()
        );
        if (!est || est.total <= 0) {
          showToast('No positive estimate. Select a template, enter step quantities, and check template rates.', 'error');
          return;
        }
        if (includeCostCheck) includeCostCheck.checked = true;
        toggleCostOptions();
        setWorkType('price');
        var inp = document.getElementById('qa-job-total-price');
        if (inp) inp.value = est.total.toFixed(2);
        updateCostPreview();
      });
    }
  }

  function getJobCreateBaseTemplateId() {
    var r = document.querySelector('#qa-job-templates-list input[name="qa-job-base-template"]:checked');
    return r ? r.value : '';
  }

  function getJobCreateFormSelectedTemplateIds() {
    var id = getJobCreateBaseTemplateId();
    return id ? [id] : [];
  }

  function renderJobStepQuantityForm(templateId) {
    var container = document.getElementById('qa-job-step-quantities');
    if (!container) return;
    if (!templateId) {
      container.innerHTML = '<p class="qa-message">Select a template on the Template tab to load steps.</p>';
      jobCreateActiveTemplateDetail = null;
      updateJobPriceEstimateDisplay();
      return;
    }
    container.innerHTML = '<p class="qa-message">Loading steps…</p>';
    qaApi.getTemplate(templateId).then(function (t) {
      if (!t || !t.steps || !t.steps.length) {
        container.innerHTML = '<p class="qa-message">This template has no steps.</p>';
        jobCreateActiveTemplateDetail = null;
        updateJobPriceEstimateDisplay();
        iconsRefresh();
        return;
      }
      jobCreateActiveTemplateDetail = t;
      container.innerHTML = '';
      t.steps.forEach(function (s, i) {
        var key = jobStepKey(t.id, s.id);
        var title = 'Step ' + (i + 1) + (s.description ? ' — ' + String(s.description).trim() : '');
        var block = document.createElement('div');
        block.className = 'qa-form-grid';
        block.style.marginBottom = '1.25rem';
        var inner = '<div class="qa-label" style="grid-column:1/-1;">' + escapeHtml(title) + '</div>';
        var any = false;
        if (hasPositiveStepRate(s.pricePerM2)) {
          inner +=
            '<div><label class="qa-label" for="qa-sq-m2-' +
            i +
            '">Total m² (this step)</label>' +
            '<input type="number" min="0" step="0.01" class="qa-input qa-step-qty-input" id="qa-sq-m2-' +
            i +
            '" data-step-qty-key="' +
            escapeHtml(key) +
            '" data-step-dim="m2" placeholder="0"></div>';
          any = true;
        }
        if (hasPositiveStepRate(s.pricePerLinear)) {
          inner +=
            '<div><label class="qa-label" for="qa-sq-lin-' +
            i +
            '">Total linear m (this step)</label>' +
            '<input type="number" min="0" step="0.01" class="qa-input qa-step-qty-input" id="qa-sq-lin-' +
            i +
            '" data-step-qty-key="' +
            escapeHtml(key) +
            '" data-step-dim="linear" placeholder="0"></div>';
          any = true;
        }
        if (hasPositiveStepRate(s.pricePerUnit)) {
          inner +=
            '<div><label class="qa-label" for="qa-sq-u-' +
            i +
            '">Total units (this step)</label>' +
            '<input type="number" min="0" step="1" class="qa-input qa-step-qty-input" id="qa-sq-u-' +
            i +
            '" data-step-qty-key="' +
            escapeHtml(key) +
            '" data-step-dim="units" placeholder="0"></div>';
          any = true;
        }
        if (!any) {
          inner += '<p class="qa-message" style="grid-column:1/-1;">No price rates on this step.</p>';
        }
        block.innerHTML = inner;
        container.appendChild(block);
      });
      updateJobPriceEstimateDisplay();
      iconsRefresh();
    }).catch(function () {
      container.innerHTML = '<p class="qa-message">Could not load template steps.</p>';
      jobCreateActiveTemplateDetail = null;
      updateJobPriceEstimateDisplay();
    });
  }

  function updateJobPriceEstimateDisplay() {
    var valEl = document.getElementById('qa-job-estimated-price');
    var hintEl = document.getElementById('qa-job-estimated-price-hint');
    var costLine = document.getElementById('qa-cost-template-estimate-line');
    if (!valEl) return;
    var est = computeJobPriceFromStepQuantities(
      jobCreateTemplatesCache,
      getJobCreateFormSelectedTemplateIds(),
      collectJobCreateStepQuantities()
    );
    if (!est) {
      valEl.textContent = '—';
      if (hintEl) {
        hintEl.textContent =
          'Choose a template, then enter quantities per step on the Step quantities tab (m², linear m, or units where the template defines rates).';
      }
      if (costLine && !QA_SUPERVISOR_MODE) costLine.textContent = '';
      return;
    }
    valEl.textContent = '£' + est.total.toFixed(2);
    if (hintEl) hintEl.textContent = formatTemplateEstimateHint(est);
    if (costLine && !QA_SUPERVISOR_MODE) {
      costLine.textContent =
        'Template-based estimate: £' +
        est.total.toFixed(2) +
        ' — enable “Enter cost”, choose Price work, then “Use template estimate” or type the total.';
    }
  }

  function refreshJobTemplatesList() {
    var jobTemplatesList = document.getElementById('qa-job-templates-list');
    if (!jobTemplatesList) return;
    jobTemplatesList.innerHTML = '';
    var projectId = projectSelect && projectSelect.value;
    qaApi.getTemplates(projectId).then(function (templates) {
      jobCreateTemplatesCache = templates || [];
      if (!templates.length) {
        jobTemplatesList.innerHTML = '<p class="qa-message">No templates yet.</p>';
        renderJobStepQuantityForm('');
        jobCreateActiveTemplateDetail = null;
        updateJobPriceEstimateDisplay();
        iconsRefresh();
        return;
      }
      templates.forEach(function (t) {
        var label = document.createElement('label');
        label.className = 'qa-check-item';
        label.innerHTML =
          '<input type="radio" name="qa-job-base-template" value="' + escapeHtml(t.id) + '"> <span>' + escapeHtml(t.name) + '</span>';
        jobTemplatesList.appendChild(label);
      });
      renderJobStepQuantityForm('');
      updateJobPriceEstimateDisplay();
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

  function renderJobCrewsList() {
    var listEl = document.getElementById('qa-job-crews-list');
    if (!listEl) return;
    var checked = [];
    listEl.querySelectorAll('input[name="qa-job-crew"]:checked').forEach(function (cb) {
      checked.push(cb.value);
    });
    listEl.innerHTML = '';
    if (!crewsData.length) {
      listEl.innerHTML =
        '<p class="qa-message">No crews loaded. Create teams under Dashboard → Operatives → Crews (manager session).</p>';
      return;
    }
    crewsData.forEach(function (c) {
      var label = document.createElement('label');
      label.className = 'qa-check-item';
      var isChecked = checked.indexOf(c.id) !== -1;
      var meta =
        c.memberCount != null && c.memberCount !== ''
          ? ' · ' + c.memberCount + ' member' + (c.memberCount === 1 ? '' : 's')
          : '';
      label.innerHTML =
        '<input type="checkbox" name="qa-job-crew" value="' +
        escapeHtml(c.id) +
        '"' +
        (isChecked ? ' checked' : '') +
        '> <span>' +
        escapeHtml(c.name) +
        '<span class="qa-message">' +
        escapeHtml(meta) +
        '</span></span>';
      listEl.appendChild(label);
    });
  }

  function loadQACrews() {
    if (!(window.QA_CONFIG && window.QA_CONFIG.useBackend) || QA_SUPERVISOR_MODE) {
      crewsData = [];
      renderJobCrewsList();
      return;
    }
    if (typeof qaApi.getCrews !== 'function') {
      renderJobCrewsList();
      return;
    }
    qaApi
      .getCrews()
      .then(function (list) {
        crewsData = list || [];
        renderJobCrewsList();
      })
      .catch(function () {
        crewsData = [];
        renderJobCrewsList();
      });
  }

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
    renderJobCrewsList();
  }

  function loadQAPersonnel() {
    if (!(window.QA_CONFIG && window.QA_CONFIG.useBackend)) return;
    qaApi
      .getPersonnel()
      .then(function (data) {
        if (data && Array.isArray(data.supervisors)) supervisorsData = data.supervisors;
        if (data && Array.isArray(data.workers)) workersData = data.workers;
        refreshPersonnelUI();
        loadQACrews();
      })
      .catch(function () {});
  }

  document.getElementById('qa-job-cancel').addEventListener('click', function () { showView('home'); });

  document.getElementById('qa-job-create').addEventListener('click', function () {
    var projectId = projectSelect && projectSelect.value;
    if (!projectId) return;
    var baseTpl = getJobCreateBaseTemplateId();
    if (!baseTpl) {
      showToast('Select a template this job is based on (Template tab).', 'error');
      return;
    }
    var templateIds = getJobCreateFormSelectedTemplateIds();
    var stepQuantities = collectJobCreateStepQuantities();
    var workerIds = [];
    document.querySelectorAll('#qa-workers-list input[name="qa-worker"]:checked').forEach(function (cb) { workerIds.push(cb.value); });
    var crewIds = [];
    document.querySelectorAll('#qa-job-crews-list input[name="qa-job-crew"]:checked').forEach(function (cb) { crewIds.push(cb.value); });
    var includeCost = document.getElementById('qa-job-include-cost') && document.getElementById('qa-job-include-cost').checked;
    var costType = includeCost ? document.getElementById('qa-work-type-value').value : '';
    var costValue = '';
    if (costType === 'day') {
      var d = parseFloat(document.getElementById('qa-job-days') && document.getElementById('qa-job-days').value) || 0;
      var rd = parseFloat(document.getElementById('qa-job-rate-day') && document.getElementById('qa-job-rate-day').value) || 0;
      costValue = JSON.stringify({ type: 'day', days: d, ratePerDay: rd });
    } else if (costType === 'hour') {
      var h = parseFloat(document.getElementById('qa-job-hours') && document.getElementById('qa-job-hours').value) || 0;
      var rh = parseFloat(document.getElementById('qa-job-rate-hour') && document.getElementById('qa-job-rate-hour').value) || 0;
      costValue = JSON.stringify({ type: 'hour', hours: h, ratePerHour: rh });
    } else if (costType === 'price') {
      costValue = (document.getElementById('qa-job-total-price') && document.getElementById('qa-job-total-price').value) || '';
      if (!String(costValue).trim() && includeCost) {
        var estAuto = computeJobPriceFromStepQuantities(jobCreateTemplatesCache, templateIds, stepQuantities);
        if (estAuto && estAuto.total > 0) costValue = estAuto.total.toFixed(2);
      }
    }
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
      stepQuantities: stepQuantities,
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
      crewIds: crewIds,
      status: 'new',
      notes: '',
      stepMaterials: collectJobCreateStepMaterials()
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
        '<p class="qa-job-card-pro__row"><i data-lucide="layers" style="width:14px;height:14px;vertical-align:middle;"></i> Level: ' + escapeHtml(job.floor || '—') + ' · ' + escapeHtml(formatJobCostAndEstimate(job, templates)) + '</p>' +
        '<p class="qa-job-card-pro__row"><i data-lucide="calendar" style="width:14px;height:14px;vertical-align:middle;"></i> Due: ' + escapeHtml(formatJobDate(job.targetCompletionDate)) + '</p>' +
        '<p class="qa-job-card-pro__row">Supervisor: ' +
          escapeHtml(getSupervisorName(job.responsibleId)) +
          ' · Workers: ' +
          (job.workerIds ? job.workerIds.length : 0) +
          (job.crewIds && job.crewIds.length
            ? ' · Crews: ' + getCrewNames(job.crewIds).map(escapeHtml).join(', ')
            : '') +
          '</p>' +
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
        '<td>' + escapeHtml(formatJobCostAndEstimate(job, templates)) + '</td>' +
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

  function formatQtyDisplay(n, isUnits) {
    if (n == null || isNaN(n)) return '0';
    if (isUnits && Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
    var x = Math.round(n * 100) / 100;
    return String(x);
  }

  function formatQaDateTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    } catch (e) {
      return '—';
    }
  }

  /**
   * @param {object} [bookedStepQuantities] - from GET job: sums from approved Work Logs (QA price work) per step key
   * @param {object} [bookedStepDetails] - per step key: [{ workerName, submittedAt, approvedAt, amount, ... }]
   */
  function formatJobStepQuantitiesReadonly(job, templates, bookedStepQuantities, bookedStepDetails) {
    var sq = job.stepQuantities && typeof job.stepQuantities === 'object' ? job.stepQuantities : {};
    var booked = bookedStepQuantities && typeof bookedStepQuantities === 'object' ? bookedStepQuantities : {};
    var details = bookedStepDetails && typeof bookedStepDetails === 'object' ? bookedStepDetails : {};
    var lines = [];
    var tplById = {};
    (templates || []).forEach(function (t) { tplById[String(t.id)] = t; });
    (job.templateIds || []).forEach(function (tid) {
      var t = tplById[String(tid)];
      if (!t || !t.steps) return;
      t.steps.forEach(function (s, idx) {
        var key = jobStepKey(t.id, s.id);
        var q = sq[key] || {};
        var b = booked[key] || { m2: 0, linear: 0, units: 0 };
        var bm = typeof b.m2 === 'number' ? b.m2 : parseFloat(b.m2) || 0;
        var bl = typeof b.linear === 'number' ? b.linear : parseFloat(b.linear) || 0;
        var bu = typeof b.units === 'number' ? b.units : parseFloat(b.units) || 0;

        var dimLines = [];
        if (hasPositiveStepRate(s.pricePerM2) || (q.m2 != null && String(q.m2).trim() !== '') || bm > 0) {
          var tm = parseFloat(q.m2);
          var hasT = q.m2 != null && String(q.m2).trim() !== '' && !isNaN(tm);
          var rem = hasT ? Math.max(0, tm - bm) : null;
          dimLines.push(
            'm² — Total: ' +
              (hasT ? formatQtyDisplay(tm, false) : '—') +
              ' → Booked: ' +
              formatQtyDisplay(bm, false) +
              ' → Remaining: ' +
              (rem != null ? formatQtyDisplay(rem, false) : '—')
          );
        }
        if (hasPositiveStepRate(s.pricePerLinear) || (q.linear != null && String(q.linear).trim() !== '') || bl > 0) {
          var tl = parseFloat(q.linear);
          var hasL = q.linear != null && String(q.linear).trim() !== '' && !isNaN(tl);
          var remL = hasL ? Math.max(0, tl - bl) : null;
          dimLines.push(
            'Linear m — Total: ' +
              (hasL ? formatQtyDisplay(tl, false) : '—') +
              ' → Booked: ' +
              formatQtyDisplay(bl, false) +
              ' → Remaining: ' +
              (remL != null ? formatQtyDisplay(remL, false) : '—')
          );
        }
        if (hasPositiveStepRate(s.pricePerUnit) || (q.units != null && String(q.units).trim() !== '') || bu > 0) {
          var tu = parseFloat(q.units);
          var hasU = q.units != null && String(q.units).trim() !== '' && !isNaN(tu);
          var remU = hasU ? Math.max(0, tu - bu) : null;
          dimLines.push(
            'Units — Total: ' +
              (hasU ? formatQtyDisplay(tu, true) : '—') +
              ' → Booked: ' +
              formatQtyDisplay(bu, true) +
              ' → Remaining: ' +
              (remU != null ? formatQtyDisplay(remU, true) : '—')
          );
        }
        var title = 'Step ' + (idx + 1) + (s.description ? ' — ' + String(s.description).trim() : '');
        var stepBookings = details[key] && Array.isArray(details[key]) ? details[key] : [];
        if (!dimLines.length && !stepBookings.length) return;
        var bookingHtml = '';
        if (stepBookings.length) {
          bookingHtml =
            '<ul class="qa-step-booking-list">' +
            stepBookings
              .map(function (bk) {
                var parts = [
                  'Booked by <strong>' + escapeHtml(bk.workerName || '—') + '</strong>',
                  'Submitted: ' + escapeHtml(formatQaDateTime(bk.submittedAt)),
                  'Approved: ' + escapeHtml(formatQaDateTime(bk.approvedAt)),
                ];
                if (bk.amount != null && !isNaN(Number(bk.amount)) && Number(bk.amount) > 0) {
                  parts.push('Step <strong>£' + Number(bk.amount).toFixed(2) + '</strong>');
                }
                var photoUrls = Array.isArray(bk.photoUrls) ? bk.photoUrls : [];
                var photosHtml = '';
                if (photoUrls.length) {
                  photosHtml =
                    '<div class="qa-step-booking-photos" role="group" aria-label="Price work confirmation photos">' +
                    photoUrls
                      .map(function (url) {
                        return (
                          '<a href="' +
                          escapeHtml(url) +
                          '" target="_blank" rel="noopener" class="qa-step-booking-photo-wrap">' +
                          '<img src="' +
                          escapeHtml(url) +
                          '" alt="" class="qa-step-booking-photo-thumb" loading="lazy">' +
                          '</a>'
                        );
                      })
                      .join('') +
                    '</div>';
                }
                return '<li class="qa-step-booking-item">' + parts.join(' · ') + photosHtml + '</li>';
              })
              .join('') +
            '</ul>';
        }
        lines.push(
          '<div class="qa-step-qty-block"><strong>' +
            escapeHtml(title) +
            '</strong>' +
            dimLines
              .map(function (line) {
                return '<div class="qa-step-qty-dim">' + escapeHtml(line) + '</div>';
              })
              .join('') +
            bookingHtml +
            '</div>'
        );
      });
    });
    if (!lines.length) return '';
    return (
      '<dt>Quantities per step</dt><dd class="qa-dl__preline qa-dl__step-qty">' +
      '<p class="qa-message" style="margin:0 0 8px;">Booked totals and booking lines are from <strong>approved</strong> Work Logs only (QA price work). Each line shows operative name, submitted time, and approval time.</p>' +
      lines.join('') +
      '</dd>'
    );
  }

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
    var projId = job.projectId || (projectSelect && projectSelect.value);
    var evFn = typeof qaApi.getJobStepEvidence === 'function'
      ? qaApi.getJobStepEvidence(job.id)
      : Promise.resolve({ steps: [], operativePhotos: [] });
    var jobFetch =
      window.QA_CONFIG && window.QA_CONFIG.useBackend && typeof qaApi.getJob === 'function'
        ? qaApi.getJob(job.id)
        : Promise.resolve(job);
    Promise.all([jobFetch, qaApi.getTemplates(projId), evFn]).then(function (results) {
      var freshJob = results[0] || job;
      var templates = results[1] || [];
      var evPayload = results[2] || { steps: [], operativePhotos: [] };
      var workerNames = getWorkerNames(freshJob.workerIds || []);
      var tplNames = getTemplateNames(templates, freshJob.templateIds || []);
      var specStr = String(freshJob.specification || '').trim();
      var descStr = String(freshJob.description || '').trim();
      var jtStr = String(freshJob.jobTitle || '').trim();
      var priceEst = getJobTemplatePriceEstimate(freshJob, templates);
      var alreadyPaid =
        freshJob.templatePriceAlreadyPaid != null && !isNaN(Number(freshJob.templatePriceAlreadyPaid))
          ? Number(freshJob.templatePriceAlreadyPaid)
          : 0;
      var hasEst =
        priceEst &&
        (priceEst.mode === 'perStep' ||
          priceEst.total > 0 ||
          priceEst.sumM2 > 0 ||
          priceEst.sumLin > 0 ||
          priceEst.sumUnit > 0);
      var estTotal = hasEst && priceEst.total != null ? priceEst.total : 0;
      var remainingEst = hasEst ? Math.max(0, estTotal - alreadyPaid) : null;
      var estRow = '';
      if (hasEst || alreadyPaid > 0) {
        estRow =
          '<dt>Template price estimate</dt><dd class="qa-dl__preline qa-dl__price-est">' +
          (hasEst
            ? '<div class="qa-price-est-row"><span class="qa-price-est-label">Estimate</span> <strong>£' +
              estTotal.toFixed(2) +
              '</strong>' +
              (estTotal <= 0 ? ' <span class="qa-muted">(add step quantities if rates apply)</span>' : '') +
              '</div>'
            : '<div class="qa-price-est-row"><span class="qa-price-est-label">Estimate</span> <span class="qa-muted">—</span></div>') +
          '<div class="qa-price-est-row"><span class="qa-price-est-label">Already paid</span> <strong>£' +
          alreadyPaid.toFixed(2) +
          '</strong> <span class="qa-muted">(approved Work Logs, QA price work)</span></div>' +
          (hasEst
            ? '<div class="qa-price-est-row"><span class="qa-price-est-label">Remaining</span> <strong>£' +
              (remainingEst != null ? remainingEst.toFixed(2) : '0.00') +
              '</strong> <span class="qa-muted">(estimate − paid)</span></div>'
            : '<div class="qa-price-est-row"><span class="qa-price-est-label">Remaining</span> <span class="qa-muted">—</span> <span class="qa-muted">(add template quantities to compare)</span></div>') +
          '</dd>';
      }
      var booked = freshJob.bookedStepQuantities;
      var bookedDet = freshJob.bookedStepDetails;
      var stepQtyRow = formatJobStepQuantitiesReadonly(freshJob, templates, booked, bookedDet);
      var html =
        '<dl class="qa-dl">' +
        '<dt>Job title</dt><dd>' + (jtStr ? escapeHtml(jtStr) : '—') + '</dd>' +
        '<dt>Job reference</dt><dd>' + escapeHtml(freshJob.jobNumber || '—') + '</dd>' +
        estRow +
        stepQtyRow +
        '<dt>Specification</dt><dd>' + (specStr ? escapeHtml(specStr) : '—') + '</dd>' +
        '<dt>Description</dt><dd class="qa-dl__preline">' + (descStr ? escapeHtml(descStr) : '—') + '</dd>' +
        '<dt>Location</dt><dd>' + escapeHtml(freshJob.location || '—') + '</dd>' +
        '<dt>Floor</dt><dd>' + escapeHtml(freshJob.floor || '—') + '</dd>' +
        '<dt>Total sqm</dt><dd>' + escapeHtml(freshJob.sqm || '—') + '</dd>' +
        '<dt>Total linear m</dt><dd>' + escapeHtml(freshJob.linearMeters || '—') + '</dd>' +
        '<dt>Total units</dt><dd>' + escapeHtml(freshJob.totalUnits || '—') + '</dd>' +
        '<dt>Cost</dt><dd>' + escapeHtml(getCostDisplay(freshJob)) + '</dd>' +
        '<dt>Target</dt><dd>' + escapeHtml(formatJobDate(freshJob.targetCompletionDate)) + '</dd>' +
        '<dt>Templates</dt><dd>' + (tplNames.length ? tplNames.map(escapeHtml).join(', ') : '—') + '</dd>' +
        '<dt>Team</dt><dd>' +
          escapeHtml(getSupervisorName(freshJob.responsibleId)) +
          ' · Workers: ' +
          (workerNames.length ? workerNames.map(escapeHtml).join(', ') : '—') +
          ' · Crews: ' +
          (freshJob.crewIds && freshJob.crewIds.length ? getCrewNames(freshJob.crewIds).map(escapeHtml).join(', ') : '—') +
          '</dd>' +
        '</dl>' +
        buildJobEvidenceSection(evPayload.steps, templates, evPayload.operativePhotos || []);
      document.getElementById('qa-job-drawer-readonly').innerHTML = html;
      var jtInput = document.getElementById('qa-job-drawer-title-input');
      if (jtInput) jtInput.value = freshJob.jobTitle || '';
      var tdInput = document.getElementById('qa-job-drawer-target-date');
      if (tdInput) tdInput.value = freshJob.targetCompletionDate ? String(freshJob.targetCompletionDate).slice(0, 10) : '';
      renderDrawerSupervisorSelect(freshJob.responsibleId || '');
      renderDrawerWorkersList(freshJob.workerIds || []);
      renderDrawerCrewsList(freshJob.crewIds || []);
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
    var jobTitle = (document.getElementById('qa-job-drawer-title-input') && document.getElementById('qa-job-drawer-title-input').value || '').trim();
    if (!jobTitle) {
      showToast('Job title is required.', 'error');
      return;
    }
    var targetCompletionDate =
      (document.getElementById('qa-job-drawer-target-date') &&
        document.getElementById('qa-job-drawer-target-date').value) ||
      '';
    var responsibleId =
      (document.getElementById('qa-job-drawer-responsible') &&
        document.getElementById('qa-job-drawer-responsible').value) ||
      '';
    var workerIds = [];
    document.querySelectorAll('#qa-job-drawer-workers-list input[name="qa-job-drawer-worker"]:checked').forEach(function (cb) {
      workerIds.push(cb.value);
    });
    var crewIds = [];
    document.querySelectorAll('#qa-job-drawer-crews-list input[name="qa-job-drawer-crew"]:checked').forEach(function (cb) {
      crewIds.push(cb.value);
    });
    qaApi.updateJob(id, {
      status: status,
      notes: notes,
      jobTitle: jobTitle,
      targetCompletionDate: targetCompletionDate,
      responsibleId: responsibleId,
      workerIds: workerIds,
      crewIds: crewIds,
    }).then(function () {
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
    var jcw = document.getElementById('qa-job-crews-wrap');
    if (jcw) jcw.classList.add('d-none');
  }
})();
