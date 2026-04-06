/**
 * Operatives module – Crews tab, notifications strip, operative detail (crews card).
 */
(function () {
  'use strict';

  var addMembersCrewId = null;
  var addMembersSelected = {};
  var currentDetailCrewId = null;
  var cachedTradeList = [];

  function getHeaders() {
    if (typeof window.getManagerSessionHeaders === 'function') {
      return window.getManagerSessionHeaders();
    }
    return {};
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function rootEl() {
    return document.querySelector('#dashboard-content .operatives-module-root');
  }

  function showOperativesFeedback(msg, isError) {
    var fb = document.querySelector('#dashboard-content #operatives-feedback');
    if (!fb) return;
    fb.textContent = msg;
    fb.classList.remove('success', 'error', 'd-none');
    fb.classList.add(isError ? 'error' : 'success');
    fb.classList.remove('d-none');
  }

  function openModal(sel) {
    var m = document.querySelector('#dashboard-content ' + sel);
    if (!m) return;
    m.classList.add('is-open');
    m.setAttribute('aria-hidden', 'false');
  }

  function closeModal(el) {
    if (!el) return;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
  }

  function closeAllModals() {
    document.querySelectorAll('#dashboard-content .operatives-modal.is-open').forEach(function (m) {
      closeModal(m);
    });
  }

  function setTab(which) {
    var people = document.querySelector('#dashboard-content #operatives-tab-panel-people');
    var crews = document.querySelector('#dashboard-content #operatives-tab-panel-crews');
    var tabs = document.querySelectorAll('#dashboard-content .operatives-main-tab');
    tabs.forEach(function (t) {
      t.classList.toggle('is-active', t.getAttribute('data-operatives-tab') === which);
    });
    if (people) people.classList.toggle('d-none', which !== 'people');
    if (crews) crews.classList.toggle('d-none', which !== 'crews');
    if (which === 'crews') loadCrewsList();
  }

  function showCrewSubview(name) {
    var list = document.querySelector('#dashboard-content #crews-view-list');
    var create = document.querySelector('#dashboard-content #crews-view-create');
    var detail = document.querySelector('#dashboard-content #crews-view-detail');
    if (list) list.classList.toggle('d-none', name !== 'list');
    if (create) create.classList.toggle('d-none', name !== 'create');
    if (detail) detail.classList.toggle('d-none', name !== 'detail');
  }

  function loadManagerNotifications() {
    var strip = document.querySelector('#dashboard-content #operatives-notifications-strip');
    if (!strip) return;
    var h = getHeaders();
    if (!h['X-Manager-Id']) return;
    fetch('/api/crews/notifications?limit=12', { headers: h, credentials: 'same-origin' })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        var list = data && data.success && Array.isArray(data.notifications) ? data.notifications : [];
        if (!list.length) {
          strip.classList.add('d-none');
          strip.innerHTML = '';
          return;
        }
        strip.classList.remove('d-none');
        strip.innerHTML =
          '<ul class="operatives-notifications-list">' +
          list
            .map(function (n) {
              return (
                '<li class="operatives-notifications-item">' +
                escapeHtml(n.message || '') +
                '</li>'
              );
            })
            .join('') +
          '</ul>';
      })
      .catch(function () {
        strip.classList.add('d-none');
      });
  }

  function fillLeaderDropdown(selectEl, selectedId) {
    if (!selectEl) return;
    var h = getHeaders();
    fetch('/api/crews/available-operatives', { headers: h, credentials: 'same-origin' })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        var ops = data && data.success && Array.isArray(data.operatives) ? data.operatives : [];
        var opts = '<option value="">Select leader…</option>';
        for (var i = 0; i < ops.length; i++) {
          var o = ops[i];
          var id = String(o.id);
          var sel = selectedId != null && String(selectedId) === id ? ' selected' : '';
          opts +=
            '<option value="' +
            escapeHtml(id) +
            '"' +
            sel +
            '>' +
            escapeHtml(o.name || o.email || 'User') +
            '</option>';
        }
        selectEl.innerHTML = opts;
      })
      .catch(function () {
        selectEl.innerHTML = '<option value="">Could not load operatives</option>';
      });
  }

  function loadCrewsList() {
    var tbody = document.querySelector('#dashboard-content #crews-tbody');
    var loading = document.querySelector('#dashboard-content #crews-table-loading');
    var table = document.querySelector('#dashboard-content #crews-table');
    var empty = document.querySelector('#dashboard-content #crews-empty');
    if (!tbody) return;
    if (loading) loading.classList.remove('d-none');
    if (table) table.classList.add('d-none');
    if (empty) empty.classList.add('d-none');
    var h = getHeaders();
    fetch('/api/crews', { headers: h, credentials: 'same-origin' })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (loading) loading.classList.add('d-none');
        var crews = data && data.success && Array.isArray(data.crews) ? data.crews : [];
        if (!crews.length) {
          if (table) table.classList.add('d-none');
          if (empty) empty.classList.remove('d-none');
          tbody.innerHTML = '';
          return;
        }
        if (table) table.classList.remove('d-none');
        if (empty) empty.classList.add('d-none');
        var html = '';
        for (var i = 0; i < crews.length; i++) {
          var c = crews[i];
          var st = c.active ? 'Active' : 'Inactive';
          var stClass = c.active ? 'status-green' : 'status-red';
          var leader = escapeHtml(c.leader_name || '—');
          var mc = c.member_count != null ? String(c.member_count) : '0';
          html +=
            '<tr data-crew-id="' +
            escapeHtml(String(c.id)) +
            '">' +
            '<td>' +
            escapeHtml(c.name || '') +
            '</td>' +
            '<td>' +
            leader +
            '</td>' +
            '<td>' +
            escapeHtml(mc) +
            '</td>' +
            '<td><span class="status-badge ' +
            stClass +
            '">' +
            st +
            '</span></td>' +
            '<td class="operatives-actions-cell">' +
            '<button type="button" class="btn-operatives btn-operatives-operative" data-crew-action="open" data-id="' +
            escapeHtml(String(c.id)) +
            '">View</button> ' +
            '<button type="button" class="btn-operatives btn-operatives-supervisor" data-crew-action="open" data-id="' +
            escapeHtml(String(c.id)) +
            '">Edit</button>' +
            '</td>' +
            '</tr>';
        }
        tbody.innerHTML = html;
      })
      .catch(function () {
        if (loading) loading.classList.add('d-none');
        showOperativesFeedback('Could not load crews.', true);
      });
  }

  function loadCrewDetail(id) {
    currentDetailCrewId = id;
    var h = getHeaders();
    showCrewSubview('detail');
    return fetch('/api/crews/' + id, { headers: h, credentials: 'same-origin' })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (out) {
        if (out.status < 200 || out.status >= 300 || !out.data || !out.data.success) {
          showOperativesFeedback((out.data && out.data.message) || 'Could not load crew.', true);
          showCrewSubview('list');
          return;
        }
        var crew = out.data.crew;
        var members = out.data.members || [];
        var title = document.querySelector('#dashboard-content #crew-detail-title');
        var hid = document.querySelector('#dashboard-content #crew-detail-id');
        var meta = document.querySelector('#dashboard-content #crew-detail-meta');
        if (title) title.textContent = crew.name || 'Crew';
        if (hid) hid.value = String(crew.id);
        if (meta) {
          meta.innerHTML =
            '<div class="crew-detail-meta-grid">' +
            '<div><span class="text-muted small">Crew leader</span><br><strong class="crew-leader-name">' +
            escapeHtml(crew.leader_name || '—') +
            '</strong></div>' +
            '<div><span class="text-muted small">Subcontractor</span><br>' +
            escapeHtml(crew.subcontractor || '—') +
            '</div>' +
            '</div>' +
            (crew.description
              ? '<p class="mt-2 mb-0 small">' + escapeHtml(crew.description) + '</p>'
              : '');
        }
        renderCrewMembersTable(crew, members);
        return fetch('/api/crews/' + id + '/activity', { headers: h, credentials: 'same-origin' }).then(function (
          res
        ) {
          return res.json();
        });
      })
      .then(function (actData) {
        if (!actData || actData.summary === undefined) return;
        var sum = actData.summary || {};
        var a = document.querySelector('#dashboard-content #crew-sum-active');
        var d = document.querySelector('#dashboard-content #crew-sum-done');
        var bar = document.querySelector('#dashboard-content #crew-sum-bar');
        if (a) a.textContent = String(sum.active_tasks != null ? sum.active_tasks : 0);
        if (d) d.textContent = String(sum.completed_tasks != null ? sum.completed_tasks : 0);
        var pct = sum.progress_percent != null ? sum.progress_percent : 0;
        if (bar) bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
      })
      .catch(function () {
        showOperativesFeedback('Could not load crew activity.', true);
      });
  }

  function renderCrewMembersTable(crew, members) {
    var tbody = document.querySelector('#dashboard-content #crew-members-tbody');
    if (!tbody) return;
    var leaderId = crew.leader_user_id;
    var html = '';
    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      var isLeader = m.user_id === leaderId || (m.role_in_crew || '') === 'Leader';
      var rowClass = isLeader ? ' crew-member-row-leader' : '';
      var act = m.active ? 'Active' : 'Inactive';
      var actClass = m.active ? 'status-green' : 'status-red';
      var removeBtn =
        m.user_id === leaderId
          ? '<span class="text-muted small">—</span>'
          : '<button type="button" class="btn-operatives-icon" data-crew-action="remove-member" data-user-id="' +
            escapeHtml(String(m.user_id)) +
            '" title="Remove"><i class="bi bi-x-lg"></i></button>';
      html +=
        '<tr class="' +
        rowClass.trim() +
        '">' +
        '<td>' +
        (isLeader ? '<span class="crew-leader-badge"><i class="bi bi-star-fill"></i> </span>' : '') +
        escapeHtml(m.name || '') +
        '</td>' +
        '<td>' +
        escapeHtml(m.trade || '—') +
        '</td>' +
        '<td>' +
        escapeHtml(m.role_in_crew || 'Member') +
        '</td>' +
        '<td><span class="status-badge ' +
        actClass +
        '">' +
        act +
        '</span></td>' +
        '<td>' +
        removeBtn +
        '</td>' +
        '</tr>';
    }
    tbody.innerHTML = html || '<tr><td colspan="5" class="text-muted">No members yet.</td></tr>';
  }

  function openAddMembersModal() {
    if (!currentDetailCrewId) return;
    addMembersCrewId = currentDetailCrewId;
    addMembersSelected = {};
    var search = document.querySelector('#dashboard-content #crew-add-members-search');
    var trade = document.querySelector('#dashboard-content #crew-add-members-trade');
    if (search) search.value = '';
    if (trade) {
      trade.innerHTML = '<option value="">All trades</option>';
      cachedTradeList.forEach(function (tr) {
        trade.innerHTML += '<option value="' + escapeHtml(tr) + '">' + escapeHtml(tr) + '</option>';
      });
    }
    refreshAddMembersList();
    openModal('#modal-crew-add-members');
  }

  function refreshAddMembersList() {
    var listEl = document.querySelector('#dashboard-content #crew-add-members-list');
    if (!listEl || !addMembersCrewId) return;
    var q = (document.querySelector('#dashboard-content #crew-add-members-search') || {}).value || '';
    var trade =
      (document.querySelector('#dashboard-content #crew-add-members-trade') || {}).value || '';
    var h = getHeaders();
    var url =
      '/api/crews/available-operatives?' +
      (q ? 'q=' + encodeURIComponent(q) : '') +
      (trade ? (q ? '&' : '') + 'trade=' + encodeURIComponent(trade) : '');
    fetch(url, { headers: h, credentials: 'same-origin' })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        var ops = data && data.success && Array.isArray(data.operatives) ? data.operatives : [];
        return fetch('/api/crews/' + addMembersCrewId, { headers: h, credentials: 'same-origin' }).then(
          function (r2) {
            return r2.json().then(function (d2) {
              var memberIds = {};
              if (d2 && d2.success && d2.members) {
                d2.members.forEach(function (mm) {
                  memberIds[mm.user_id] = true;
                });
              }
              return { ops: ops, memberIds: memberIds };
            });
          }
        );
      })
      .then(function (ctx) {
        var ops = ctx.ops.filter(function (o) {
          return !ctx.memberIds[o.id];
        });
        var trades = {};
        ops.forEach(function (o) {
          if (o.trade) trades[o.trade] = true;
        });
        cachedTradeList = Object.keys(trades).sort();
        var html = '';
        for (var i = 0; i < ops.length; i++) {
          var o = ops[i];
          var checked = addMembersSelected[o.id] ? ' checked' : '';
          html +=
            '<label class="crew-add-member-row d-flex align-items-center gap-2 py-1 border-bottom">' +
            '<input type="checkbox" class="crew-add-member-cb" data-user-id="' +
            escapeHtml(String(o.id)) +
            '"' +
            checked +
            '> ' +
            '<span class="flex-grow-1">' +
            escapeHtml(o.name || o.email) +
            ' <span class="text-muted small">(' +
            escapeHtml(o.trade || '—') +
            ')</span></span>' +
            '</label>';
        }
        listEl.innerHTML = html || '<p class="text-muted small mb-0">No available operatives match.</p>';
      })
      .catch(function () {
        listEl.innerHTML = '<p class="text-danger small">Failed to load.</p>';
      });
  }

  function submitAddMembers() {
    var h = getHeaders();
    var ids = Object.keys(addMembersSelected).filter(function (k) {
      return addMembersSelected[k];
    });
    if (!ids.length || !addMembersCrewId) {
      closeAllModals();
      return;
    }
    var members = ids.map(function (id) {
      return { user_id: parseInt(id, 10), role_in_crew: 'Member' };
    });
    fetch('/api/crews/' + addMembersCrewId + '/members', {
      method: 'POST',
      headers: Object.assign({}, h, { 'Content-Type': 'application/json' }),
      credentials: 'same-origin',
      body: JSON.stringify({ members: members }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (out) {
        if (out.status >= 200 && out.status < 300 && out.data && out.data.success) {
          loadManagerNotifications();
          closeAllModals();
          loadCrewDetail(addMembersCrewId);
        } else {
          showOperativesFeedback((out.data && out.data.message) || 'Could not add members.', true);
        }
      })
      .catch(function () {
        showOperativesFeedback('Request failed.', true);
      });
  }

  function removeMember(userId) {
    if (!currentDetailCrewId) return;
    var h = getHeaders();
    fetch('/api/crews/' + currentDetailCrewId + '/members/' + userId, {
      method: 'DELETE',
      headers: h,
      credentials: 'same-origin',
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (out) {
        if (out.status >= 200 && out.status < 300 && out.data && out.data.success) {
          loadManagerNotifications();
          loadCrewDetail(currentDetailCrewId);
        } else {
          showOperativesFeedback((out.data && out.data.message) || 'Could not remove member.', true);
        }
      })
      .catch(function () {
        showOperativesFeedback('Request failed.', true);
      });
  }

  function openEditCrewModal() {
    var id = currentDetailCrewId;
    if (!id) return;
    var h = getHeaders();
    fetch('/api/crews/' + id, { headers: h, credentials: 'same-origin' })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.success || !data.crew) return;
        var c = data.crew;
        var nameEl = document.querySelector('#dashboard-content #crew-edit-name');
        var subEl = document.querySelector('#dashboard-content #crew-edit-sub');
        var descEl = document.querySelector('#dashboard-content #crew-edit-desc');
        var idEl = document.querySelector('#dashboard-content #crew-edit-id');
        var leaderEl = document.querySelector('#dashboard-content #crew-edit-leader');
        if (idEl) idEl.value = String(c.id);
        if (nameEl) nameEl.value = c.name || '';
        if (subEl) subEl.value = c.subcontractor || '';
        if (descEl) descEl.value = c.description || '';
        if (leaderEl) {
          fillLeaderDropdown(leaderEl, c.leader_user_id);
        }
        openModal('#modal-crew-edit');
      });
  }

  function submitEditCrew(e) {
    e.preventDefault();
    var idEl = document.querySelector('#dashboard-content #crew-edit-id');
    var id = idEl ? parseInt(idEl.value, 10) : 0;
    if (!id) return;
    var body = {
      name: (document.querySelector('#dashboard-content #crew-edit-name') || {}).value,
      leader_user_id: parseInt(
        (document.querySelector('#dashboard-content #crew-edit-leader') || {}).value,
        10
      ),
      subcontractor: (document.querySelector('#dashboard-content #crew-edit-sub') || {}).value,
      description: (document.querySelector('#dashboard-content #crew-edit-desc') || {}).value,
    };
    var h = getHeaders();
    fetch('/api/crews/' + id, {
      method: 'PATCH',
      headers: Object.assign({}, h, { 'Content-Type': 'application/json' }),
      credentials: 'same-origin',
      body: JSON.stringify(body),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (out) {
        if (out.status >= 200 && out.status < 300 && out.data && out.data.success) {
          loadManagerNotifications();
          closeAllModals();
          loadCrewDetail(id);
        } else {
          showOperativesFeedback((out.data && out.data.message) || 'Update failed.', true);
        }
      })
      .catch(function () {
        showOperativesFeedback('Request failed.', true);
      });
  }

  function openOperativeDetail(userId) {
    var h = getHeaders();
    var modal = document.querySelector('#dashboard-content #modal-operative-detail');
    var body = document.querySelector('#dashboard-content #modal-operative-detail-body');
    if (!body) return;
    body.innerHTML = '<p class="text-muted">Loading…</p>';
    openModal('#modal-operative-detail');
    Promise.all([
      fetch('/api/operatives', { headers: h, credentials: 'same-origin' }).then(function (r) {
        return r.json();
      }),
      fetch('/api/crews/for-user/' + userId, { headers: h, credentials: 'same-origin' }).then(function (r) {
        return r.json();
      }),
    ])
      .then(function (results) {
        var opData = results[0];
        var crewData = results[1];
        var op = null;
        if (opData && opData.success && Array.isArray(opData.operatives)) {
          for (var i = 0; i < opData.operatives.length; i++) {
            if (String(opData.operatives[i].id) === String(userId)) {
              op = opData.operatives[i];
              break;
            }
          }
        }
        var crews = crewData && crewData.success && Array.isArray(crewData.crews) ? crewData.crews : [];
        var name = op ? op.name || '—' : '—';
        var title = document.querySelector('#dashboard-content #modal-operative-detail-title');
        if (title) title.textContent = name;
        var crewRows = crews
          .map(function (c) {
            return (
              '<tr><td>' +
              escapeHtml(c.name || '') +
              '</td><td>' +
              escapeHtml(c.role_in_crew || '—') +
              (c.is_leader ? ' <span class="status-badge status-green">Leader</span>' : '') +
              '</td></tr>'
            );
          })
          .join('');
        body.innerHTML =
          '<div class="operative-detail-grid">' +
          '<div><span class="text-muted small">Email</span><br>' +
          escapeHtml((op && op.email) || '—') +
          '</div>' +
          '<div><span class="text-muted small">Role / trade</span><br>' +
          escapeHtml((op && op.role) || '—') +
          '</div>' +
          '<div><span class="text-muted small">Status</span><br>' +
          (op && op.active
            ? '<span class="status-badge status-green">Active</span>'
            : '<span class="status-badge status-red">Inactive</span>') +
          '</div></div>' +
          '<div class="dashboard-card mt-3 p-3">' +
          '<h4 class="h6 mb-2">Crews</h4>' +
          (crewRows
            ? '<table class="operatives-table"><thead><tr><th>Crew name</th><th>Role in crew</th></tr></thead><tbody>' +
              crewRows +
              '</tbody></table>'
            : '<p class="text-muted small mb-0">Not assigned to any crew.</p>') +
          '</div>';
      })
      .catch(function () {
        body.innerHTML = '<p class="text-danger">Could not load operative.</p>';
      });
  }

  function onRootClick(e) {
    var tab = e.target.closest('.operatives-main-tab');
    if (tab) {
      e.preventDefault();
      setTab(tab.getAttribute('data-operatives-tab') || 'people');
      return;
    }

    if (e.target.closest('#crews-btn-create')) {
      e.preventDefault();
      showCrewSubview('create');
      var leader = document.querySelector('#dashboard-content #crew-leader');
      fillLeaderDropdown(leader, null);
      var form = document.querySelector('#dashboard-content #form-create-crew');
      if (form) form.reset();
      return;
    }

    if (e.target.closest('#crews-create-back') || e.target.closest('#crews-create-cancel')) {
      e.preventDefault();
      showCrewSubview('list');
      return;
    }

    if (e.target.closest('#crew-detail-back')) {
      e.preventDefault();
      showCrewSubview('list');
      loadCrewsList();
      return;
    }

    var crewBtn = e.target.closest('[data-crew-action="open"]');
    if (crewBtn) {
      e.preventDefault();
      var cid = crewBtn.getAttribute('data-id');
      if (cid) loadCrewDetail(parseInt(cid, 10));
      return;
    }

    if (e.target.closest('#crew-btn-add-members')) {
      e.preventDefault();
      openAddMembersModal();
      return;
    }

    if (e.target.closest('#crew-btn-edit-info')) {
      e.preventDefault();
      openEditCrewModal();
      return;
    }

    var rm = e.target.closest('[data-crew-action="remove-member"]');
    if (rm) {
      e.preventDefault();
      var uid = rm.getAttribute('data-user-id');
      if (uid) removeMember(parseInt(uid, 10));
      return;
    }

    var ov = e.target.closest('[data-action="operative-view"]');
    if (ov) {
      e.preventDefault();
      var oid = ov.getAttribute('data-id');
      if (oid) openOperativeDetail(parseInt(oid, 10));
      return;
    }
  }

  function onRootChange(e) {
    var t = e.target;
    if (t && t.id === 'crew-add-members-trade') {
      refreshAddMembersList();
    }
  }

  function onRootInput(e) {
    if (e.target && e.target.id === 'crew-add-members-search') {
      window.clearTimeout(window._crewAddSearchT);
      window._crewAddSearchT = window.setTimeout(refreshAddMembersList, 250);
    }
  }

  function onDocumentSubmit(e) {
    var form = e.target;
    if (form && form.id === 'form-create-crew') {
      e.preventDefault();
      var name = (document.querySelector('#dashboard-content #crew-name') || {}).value;
      var leader = (document.querySelector('#dashboard-content #crew-leader') || {}).value;
      var sub = (document.querySelector('#dashboard-content #crew-subcontractor') || {}).value;
      var desc = (document.querySelector('#dashboard-content #crew-description') || {}).value;
      var h = getHeaders();
      fetch('/api/crews', {
        method: 'POST',
        headers: Object.assign({}, h, { 'Content-Type': 'application/json' }),
        credentials: 'same-origin',
        body: JSON.stringify({
          name: (name || '').trim(),
          leader_user_id: parseInt(leader, 10),
          subcontractor: (sub || '').trim() || null,
          description: (desc || '').trim() || null,
        }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { status: res.status, data: data };
          });
        })
        .then(function (out) {
          if (out.status >= 200 && out.status < 300 && out.data && out.data.success && out.data.crew && out.data.crew.id != null) {
            loadManagerNotifications();
            loadCrewDetail(out.data.crew.id);
          } else {
            showOperativesFeedback((out.data && out.data.message) || 'Could not create crew.', true);
          }
        })
        .catch(function () {
          showOperativesFeedback('Request failed.', true);
        });
      return;
    }
    if (form && form.id === 'form-crew-edit') {
      submitEditCrew(e);
    }
  }

  function onDocumentChange(e) {
    var cb = e.target && e.target.closest && e.target.closest('.crew-add-member-cb');
    if (!cb || !document.querySelector('#dashboard-content #modal-crew-add-members.is-open')) return;
    var uid = cb.getAttribute('data-user-id');
    if (uid) addMembersSelected[uid] = cb.checked;
  }

  window.initOperativesCrewsModule = function () {
    loadManagerNotifications();
    var root = rootEl();
    if (!root) return;
    if (root.dataset.crewsInit === '1') return;
    root.dataset.crewsInit = '1';
    root.addEventListener('click', onRootClick);
    root.addEventListener('change', onRootChange);
    root.addEventListener('input', onRootInput);

    if (!window.__operativesCrewsDocBound) {
      window.__operativesCrewsDocBound = true;
      document.addEventListener('submit', onDocumentSubmit);
      document.addEventListener('change', onDocumentChange);
    }

    var confirmAdd = document.querySelector('#dashboard-content #crew-add-members-confirm');
    if (confirmAdd && !confirmAdd.dataset.crewBound) {
      confirmAdd.dataset.crewBound = '1';
      confirmAdd.addEventListener('click', function (e) {
        e.preventDefault();
        submitAddMembers();
      });
    }
  };
})();

