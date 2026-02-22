/**
 * Projects module – Proconix spec.
 * Manager: create, edit, deactivate, view all company projects. No full page refresh.
 * Token validation on load; fetch() for all API calls.
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

  function getHeaders() {
    var session = getSession();
    if (!session || session.manager_id == null || !session.email) return null;
    return {
      'Content-Type': 'application/json',
      'X-Manager-Id': String(session.manager_id),
      'X-Manager-Email': session.email,
    };
  }

  function escapeHtml(str) {
    if (str == null) return '';
    var s = String(str);
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function formatDate(val) {
    if (!val) return '—';
    var d = new Date(val);
    return isNaN(d.getTime()) ? val : d.toLocaleDateString();
  }

  function showToast(message, isError) {
    var el = document.getElementById('projects-toast');
    if (!el) return;
    el.textContent = message;
    el.className = 'projects-toast ' + (isError ? 'error' : 'success');
    el.classList.remove('d-none');
    setTimeout(function () {
      el.classList.add('d-none');
    }, 3500);
  }

  function openModal(id) {
    var modal = document.getElementById(id);
    if (modal) {
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function openAddModal() {
    var f = document.getElementById('projects-add-name');
    if (f) f.value = '';
    f = document.getElementById('projects-add-address');
    if (f) f.value = '';
    f = document.getElementById('projects-add-description');
    if (f) f.value = '';
    f = document.getElementById('projects-add-start');
    if (f) f.value = '';
    f = document.getElementById('projects-add-planned-end');
    if (f) f.value = '';
    f = document.getElementById('projects-add-floors');
    if (f) f.value = '';
    var modal = document.getElementById('projects-modal-add');
    if (modal) {
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeModals() {
    var list = document.querySelectorAll('.projects-modal.is-open');
    list.forEach(function (m) {
      m.classList.remove('is-open');
      m.setAttribute('aria-hidden', 'true');
    });
  }

  function getContentEl() {
    return document.getElementById('dashboard-content');
  }

  function el(id) {
    var c = getContentEl();
    return (c && c.querySelector('#' + id)) || document.getElementById(id);
  }

  function renderProjectsList(projects) {
    var list = document.getElementById('projects-list');
    var empty = document.getElementById('projects-empty');
    if (!list) return;
    if (!projects || projects.length === 0) {
      list.innerHTML = '';
      if (empty) empty.classList.remove('d-none');
      return;
    }
    if (empty) empty.classList.add('d-none');
    var html = '';
    for (var i = 0; i < projects.length; i++) {
      var p = projects[i];
      var name = escapeHtml(p.project_name || p.name || '—');
      var startDate = formatDate(p.start_date);
      var plannedEnd = formatDate(p.planned_end_date);
      var active = p.active === true || p.active === 't';
      var statusLabel = active ? 'Active' : 'Inactive';
      var statusClass = active ? 'active' : 'inactive';
      html += '<div class="projects-card" data-id="' + p.id + '">';
      html += '<h3 class="projects-card-name">' + name + '</h3>';
      html += '<p class="projects-card-meta"><span class="projects-card-dates">' + startDate + ' – ' + plannedEnd + '</span></p>';
      html += '<p class="projects-card-meta"><span class="projects-status-badge ' + statusClass + '">' + statusLabel + '</span></p>';
      html += '<div class="projects-card-actions">';
      html += '<button type="button" class="btn-projects-view" data-action="view" data-id="' + p.id + '"><i class="bi bi-eye"></i> View</button>';
      html += '<button type="button" class="btn-projects-edit" data-action="edit" data-id="' + p.id + '"><i class="bi bi-pencil"></i> Edit</button>';
      html += '<button type="button" class="btn-projects-deactivate' + (active ? '' : ' d-none') + '" data-action="deactivate" data-id="' + p.id + '" data-name="' + name + '"><i class="bi bi-pause-circle"></i> Deactivate</button>';
      html += '<button type="button" class="btn-projects-assign" data-action="assign" data-id="' + p.id + '"><i class="bi bi-person-plus"></i> Assign Operatives/Managers</button>';
      html += '</div></div>';
    }
    list.innerHTML = html;
  }

  function loadProjects(headers, onDone) {
    var loading = document.getElementById('projects-loading');
    var listWrap = document.getElementById('projects-list-wrap');
    if (loading) loading.classList.remove('d-none');
    var emptyEl = listWrap && listWrap.querySelector('#projects-empty');
    if (emptyEl) emptyEl.classList.add('d-none');
    fetch('/api/projects/list', { headers: headers })
      .then(function (res) { return res.json().then(function (data) { return { res: res, data: data }; }); })
      .then(function (_) {
        var res = _.res;
        var data = _.data;
        if (loading) loading.classList.add('d-none');
        if (res.status === 403) {
          var denied = document.getElementById('projects-access-denied');
          if (denied) {
            denied.classList.remove('d-none');
            denied.querySelector('p').textContent = (data && data.message) || 'Access Denied. You are not authorized to view this project.';
          }
          if (listWrap) listWrap.classList.add('d-none');
          if (onDone) onDone(false);
          return;
        }
        if (listWrap) listWrap.classList.remove('d-none');
        var denied = document.getElementById('projects-access-denied');
        if (denied) denied.classList.add('d-none');
        if (data && data.success && data.projects) {
          renderProjectsList(data.projects);
        } else {
          renderProjectsList([]);
        }
        if (onDone) onDone(true);
      })
      .catch(function () {
        if (loading) loading.classList.add('d-none');
        showToast('Failed to load projects.', true);
        renderProjectsList([]);
        if (onDone) onDone(false);
      });
  }

  function openDetailsModal(projectId, headers) {
    var content = document.getElementById('projects-details-content');
    if (!content) return;
    content.innerHTML = '<p class="projects-loading">Loading…</p>';
    openModal('projects-modal-details');
    fetch('/api/projects/' + projectId, { headers: headers })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.success || !data.project) {
          content.innerHTML = '<p>' + escapeHtml((data && data.message) || 'Failed to load project.') + '</p>';
          return;
        }
        var p = data.project;
        var active = p.active === true || p.active === 't';
        var html = '<div class="projects-details-section projects-details-info">';
        html += '<h4>Project</h4>';
        html += '<p><strong>' + escapeHtml(p.project_name || p.name) + '</strong></p>';
        html += '<p>Address: ' + escapeHtml(p.address || '—') + '</p>';
        if (p.description) html += '<p>' + escapeHtml(p.description) + '</p>';
        html += '<p>Start: ' + formatDate(p.start_date) + ' &nbsp; Planned end: ' + formatDate(p.planned_end_date) + '</p>';
        html += '<p>Number of floors: ' + (p.number_of_floors != null ? escapeHtml(String(p.number_of_floors)) : '—') + '</p>';
        html += '<p>Status: ' + (active ? 'Active' : 'Inactive') + '</p>';
        if (p.project_pass_key) html += '<p>Pass key: <code>' + escapeHtml(p.project_pass_key) + '</code></p>';
        if (p.created_by_who) html += '<p>Created by: ' + escapeHtml(p.created_by_who) + '</p>';
        if (p.deactivate_by_who) html += '<p>Deactivated by: ' + escapeHtml(p.deactivate_by_who) + '</p>';
        html += '</div>';
        content.innerHTML = html;
      })
      .catch(function () {
        content.innerHTML = '<p>Failed to load project.</p>';
      });
  }

  function loadOperativesForAssign(headers, callback) {
    fetch('/api/operatives', { headers: headers })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var list = (data && data.success && data.operatives) ? data.operatives : [];
        if (callback) callback(list);
      })
      .catch(function () { if (callback) callback([]); });
  }

  function openAssignModal(projectId, headers, refreshList) {
    var projectIdEl = document.getElementById('projects-assign-project-id');
    var userSelect = document.getElementById('projects-assign-user');
    var roleDisplay = document.getElementById('projects-assign-role-display');
    var tbody = document.getElementById('projects-assign-tbody');
    var emptyEl = document.getElementById('projects-assign-empty');
    if (!projectIdEl || !userSelect || !tbody) return;
    projectIdEl.value = projectId;
    userSelect.innerHTML = '<option value="">Select operative...</option>';
    if (roleDisplay) roleDisplay.textContent = '—';
    tbody.innerHTML = '';
    if (emptyEl) emptyEl.classList.remove('d-none');

    function fillDropdown(operatives, assignedUserIds) {
      userSelect.innerHTML = '<option value="">Select operative...</option>';
      operatives.forEach(function (u) {
        if (assignedUserIds.has(u.id)) return;
        var opt = document.createElement('option');
        opt.value = u.id;
        opt.setAttribute('data-role', u.role || '');
        opt.textContent = (u.name || u.email || 'User #' + u.id);
        userSelect.appendChild(opt);
      });
    }

    loadOperativesForAssign(headers, function (operatives) {
      fetch('/api/projects/' + projectId + '/assignments', { headers: headers })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          var assignedUserIds = new Set();
          if (data && data.success && data.assignments) {
            data.assignments.forEach(function (a) {
              assignedUserIds.add(a.user_id);
              var tr = document.createElement('tr');
              tr.innerHTML = '<td>' + escapeHtml(a.user_name) + '</td><td>' + escapeHtml(a.role || '—') + '</td><td>' + formatDate(a.assigned_at) + '</td><td><button type="button" class="btn-projects-remove" data-assignment-id="' + a.id + '"><i class="bi bi-x-lg"></i> Remove</button></td>';
              tbody.appendChild(tr);
            });
            if (data.assignments.length > 0 && emptyEl) emptyEl.classList.add('d-none');
          }
          fillDropdown(operatives, assignedUserIds);
        })
        .catch(function () {
          fillDropdown(operatives, new Set());
        });
    });

    userSelect.onchange = function () {
      var opt = userSelect.options[userSelect.selectedIndex];
      var role = opt && opt.getAttribute('data-role');
      if (roleDisplay) roleDisplay.textContent = role ? role : '—';
    };

    openModal('projects-modal-assign');
  }

  function openEditModal(project) {
    var idEl = el('projects-edit-id');
    if (idEl) idEl.value = project.id;
    var nameEl = el('projects-edit-name');
    if (nameEl) nameEl.value = project.project_name || project.name || '';
    var addrEl = el('projects-edit-address');
    if (addrEl) addrEl.value = project.address || '';
    var descEl = el('projects-edit-description');
    if (descEl) descEl.value = project.description || '';
    var startEl = el('projects-edit-start');
    if (startEl) startEl.value = project.start_date ? String(project.start_date).slice(0, 10) : '';
    var endEl = el('projects-edit-planned-end');
    if (endEl) endEl.value = project.planned_end_date ? String(project.planned_end_date).slice(0, 10) : '';
    var floorsEl = el('projects-edit-floors');
    if (floorsEl) floorsEl.value = project.number_of_floors != null ? project.number_of_floors : '';
    openModal('projects-modal-edit');
  }

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('#projects-btn-add');
    if (!btn) return;
    if (!document.getElementById('projects-modal-add')) return;
    e.preventDefault();
    e.stopPropagation();
    openAddModal();
  }, true);

  window.initProjectsModule = function () {
    var session = getSession();
    var headers = getHeaders();
    var content = getContentEl();
    if (!content) return;

    var accessDenied = content.querySelector('#projects-access-denied');
    var listWrap = content.querySelector('#projects-list-wrap');
    if (!headers) {
      if (accessDenied) {
        accessDenied.classList.remove('d-none');
        var p = accessDenied.querySelector('p');
        if (p) p.textContent = 'Access Denied. You are not authorized to view this project.';
      }
      if (listWrap) listWrap.classList.add('d-none');
      return;
    }
    if (accessDenied) accessDenied.classList.add('d-none');
    if (listWrap) listWrap.classList.remove('d-none');

    function refreshList() {
      loadProjects(headers);
    }

    loadProjects(headers);

    var formAdd = el('projects-form-add');
    if (formAdd) formAdd.addEventListener('submit', function (e) {
      e.preventDefault();
      var nameEl = el('projects-add-name');
      var name = nameEl ? nameEl.value.trim() : '';
      if (!name) {
        showToast('Project name is required.', true);
        return;
      }
      var floorsEl = el('projects-add-floors');
      var floors = floorsEl ? floorsEl.value.trim() : '';
      var payload = {
        project_name: name,
        address: (el('projects-add-address') && el('projects-add-address').value.trim()) || undefined,
        description: (el('projects-add-description') && el('projects-add-description').value.trim()) || undefined,
        start_date: (el('projects-add-start') && el('projects-add-start').value) || undefined,
        planned_end_date: (el('projects-add-planned-end') && el('projects-add-planned-end').value) || undefined,
        number_of_floors: floors === '' ? undefined : parseInt(floors, 10),
      };
      fetch('/api/projects/create', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data && data.success) {
            showToast('Project created.', false);
            closeModals();
            refreshList();
          } else {
            showToast((data && data.message) || 'Failed to create.', true);
          }
        })
        .catch(function () {
          showToast('Failed to create project.', true);
        });
    });

    var formEdit = el('projects-form-edit');
    if (formEdit) formEdit.addEventListener('submit', function (e) {
      e.preventDefault();
      var idEl = el('projects-edit-id');
      var id = idEl ? idEl.value : '';
      var nameEl = el('projects-edit-name');
      var name = nameEl ? nameEl.value.trim() : '';
      if (!name) {
        showToast('Project name is required.', true);
        return;
      }
      var floorsEl = el('projects-edit-floors');
      var floors = floorsEl ? floorsEl.value.trim() : '';
      var payload = {
        project_name: name,
        address: (el('projects-edit-address') && el('projects-edit-address').value.trim()) || undefined,
        description: (el('projects-edit-description') && el('projects-edit-description').value.trim()) || undefined,
        start_date: (el('projects-edit-start') && el('projects-edit-start').value) || undefined,
        planned_end_date: (el('projects-edit-planned-end') && el('projects-edit-planned-end').value) || undefined,
        number_of_floors: floors === '' ? undefined : parseInt(floors, 10),
      };
      if (!id) return;
      fetch('/api/projects/' + id + '/update', {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify(payload),
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data && data.success) {
            showToast('Project updated.', false);
            closeModals();
            refreshList();
          } else {
            showToast((data && data.message) || 'Failed to update.', true);
          }
        })
        .catch(function () {
          showToast('Failed to update project.', true);
        });
    });

    var btnDeactivateConfirm = el('projects-btn-deactivate-confirm');
    if (btnDeactivateConfirm) btnDeactivateConfirm.addEventListener('click', function () {
      var idEl = el('projects-deactivate-id');
      var id = idEl ? idEl.value : '';
      if (!id) return;
      fetch('/api/projects/' + id + '/deactivate', {
        method: 'PUT',
        headers: headers,
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data && data.success) {
            showToast('Project deactivated.', false);
            closeModals();
            refreshList();
          } else {
            showToast((data && data.message) || 'Failed to deactivate.', true);
          }
        })
        .catch(function () {
          showToast('Failed to deactivate project.', true);
        });
    });

    content.addEventListener('click', function (e) {
      var target = e.target.closest('[data-action]');
      if (!target) return;
      var action = target.getAttribute('data-action');
      var id = target.getAttribute('data-id');
      if (action === 'view' && id) {
        openDetailsModal(id, headers);
        return;
      }
      if (action === 'edit' && id) {
        fetch('/api/projects/list', { headers: headers })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (data && data.success && data.projects) {
              var p = data.projects.find(function (x) { return String(x.id) === String(id); });
              if (p) openEditModal(p);
            }
          });
        return;
      }
      if (action === 'deactivate' && id) {
        var name = target.getAttribute('data-name') || 'this project';
        var msgEl = el('projects-deactivate-message');
        if (msgEl) msgEl.textContent = 'Are you sure you want to deactivate "' + name + '"?';
        var idEl = el('projects-deactivate-id');
        if (idEl) idEl.value = id;
        openModal('projects-modal-deactivate');
      }
      if (action === 'assign' && id) {
        openAssignModal(id, headers, refreshList);
      }
    });

    var btnAssign = document.getElementById('projects-btn-assign');
    if (btnAssign) {
      btnAssign.addEventListener('click', function () {
        var projectIdEl = document.getElementById('projects-assign-project-id');
        var projectId = projectIdEl ? projectIdEl.value : '';
        var userSelect = document.getElementById('projects-assign-user');
        var userId = userSelect ? userSelect.value : '';
        var opt = userSelect && userSelect.options[userSelect.selectedIndex];
        var role = opt && opt.getAttribute('data-role') ? opt.getAttribute('data-role') : 'Other';
        if (!projectId || !userId) {
          showToast('Select an operative.', true);
          return;
        }
        fetch('/api/projects/' + projectId + '/assign', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ user_id: parseInt(userId, 10), role: role }),
        })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (data && data.success) {
              showToast('User assigned.', false);
              openAssignModal(projectId, headers, refreshList);
              refreshList();
            } else {
              showToast((data && data.message) || 'Failed to assign.', true);
            }
          })
          .catch(function () {
            showToast('Failed to assign.', true);
          });
      });
    }

    content.addEventListener('click', function (e) {
      var removeBtn = e.target && e.target.closest && e.target.closest('.btn-projects-remove');
      if (!removeBtn) return;
      var assignmentId = removeBtn.getAttribute('data-assignment-id');
      if (!assignmentId) return;
      var projectIdEl = document.getElementById('projects-assign-project-id');
      var projectId = projectIdEl ? projectIdEl.value : '';
      e.preventDefault();
      fetch('/api/projects/assignment/' + assignmentId, { method: 'DELETE', headers: headers })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data && data.success) {
            showToast('Assignment removed.', false);
            if (projectId) openAssignModal(projectId, headers, refreshList);
            refreshList();
          } else {
            showToast((data && data.message) || 'Failed to remove.', true);
          }
        })
        .catch(function () {
          showToast('Failed to remove assignment.', true);
        });
    });
  };
})();
