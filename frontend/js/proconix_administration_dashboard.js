/**
 * Proconix platform administration console – validates session with GET /api/platform-admin/me.
 */
(function () {
  'use strict';

  var SESSION_KEY = 'proconix_platform_admin_session';
  var LOGIN_URL = 'proconix_administration_login.html';

  function readSessionRaw() {
    try {
      return sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    } catch (e) {
      return null;
    }
  }

  function parseSession(raw) {
    if (!raw) return null;
    try {
      var o = JSON.parse(raw);
      if (!o || typeof o.email !== 'string' || o.id == null) return null;
      var id = parseInt(o.id, 10);
      if (!Number.isInteger(id) || id < 1) return null;
      o.id = id;
      return o;
    } catch (e) {
      return null;
    }
  }

  function clearSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  function sessionHeaders(session) {
    return {
      'X-Platform-Admin-Id': String(session.id),
      'X-Platform-Admin-Email': session.email,
    };
  }

  function escapeHtmlText(s) {
    if (s == null || s === '') return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function cellText(s) {
    if (s == null || s === '') return '—';
    return escapeHtmlText(s);
  }

  function formatDateTime(val) {
    if (!val) return '—';
    try {
      var d = new Date(val);
      if (isNaN(d.getTime())) return escapeHtmlText(String(val));
      return escapeHtmlText(d.toLocaleString());
    } catch (e) {
      return escapeHtmlText(String(val));
    }
  }

  function loadCompaniesPanel(sess) {
    var loading = document.getElementById('pxAdminCompaniesLoading');
    var wrap = document.getElementById('pxAdminCompaniesTableWrap');
    var empty = document.getElementById('pxAdminCompaniesEmpty');
    var alertEl = document.getElementById('pxAdminCompaniesAlert');
    var tbody = document.getElementById('pxAdminCompaniesBody');
    if (!tbody || !sess) return;

    if (alertEl) {
      alertEl.classList.add('d-none');
      alertEl.textContent = '';
    }
    if (empty) empty.classList.add('d-none');
    if (wrap) wrap.classList.add('d-none');
    tbody.innerHTML = '';
    if (loading) loading.classList.remove('d-none');

    fetch('/api/platform-admin/companies', {
      method: 'GET',
      headers: sessionHeaders(sess),
      credentials: 'same-origin',
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (out) {
        if (loading) loading.classList.add('d-none');
        if (out.status === 401) {
          clearSession();
          window.location.replace(LOGIN_URL);
          return;
        }
        if (out.status !== 200 || !out.data || !out.data.success) {
          if (alertEl) {
            alertEl.textContent =
              (out.data && out.data.message) || 'Could not load companies.';
            alertEl.classList.remove('d-none');
          }
          return;
        }
        var list = out.data.companies || [];
        if (list.length === 0) {
          if (empty) empty.classList.remove('d-none');
          return;
        }
        list.forEach(function (c) {
          var tr = document.createElement('tr');
          tr.className = 'px-admin-company-row';
          tr.setAttribute('data-company-id', String(c.id));
          tr.setAttribute('role', 'button');
          tr.tabIndex = 0;
          tr.innerHTML =
            '<td>' +
            cellText(c.id) +
            '</td><td>' +
            cellText(c.name) +
            '</td><td>' +
            cellText(c.head_manager_name) +
            '</td><td>' +
            cellText(c.head_manager_email) +
            '</td>';
          tbody.appendChild(tr);
        });
        if (wrap) wrap.classList.remove('d-none');
      })
      .catch(function () {
        if (loading) loading.classList.add('d-none');
        if (alertEl) {
          alertEl.textContent = 'Network error while loading companies.';
          alertEl.classList.remove('d-none');
        }
      });
  }

  /** YYYY-MM-DD for &lt;input type="date"&gt; (UTC calendar day from stored instant). */
  function toDateInputValue(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var y = d.getUTCFullYear();
    var m = String(d.getUTCMonth() + 1).padStart(2, '0');
    var day = String(d.getUTCDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  var BILLING_PAYMENT_OPTIONS = [
    ['registration', 'Registration (self-serve)'],
    ['card', 'Card'],
    ['invoice', 'Invoice'],
    ['bank_transfer', 'Bank transfer'],
    ['cash', 'Cash'],
    ['free', 'Free'],
    ['manual', 'Manual / admin'],
    ['other', 'Other'],
  ];

  var BILLING_STATUS_OPTIONS = [
    ['paid_active', 'Paid / Active'],
    ['unpaid_suspended', 'Unpaid / Suspended'],
    ['unpaid_active', 'Unpaid / Active'],
  ];

  function billingAppendSelectOptions(sel, pairs, current) {
    var seen = false;
    pairs.forEach(function (pair) {
      var o = document.createElement('option');
      o.value = pair[0];
      o.textContent = pair[1];
      if (pair[0] === current) {
        o.selected = true;
        seen = true;
      }
      sel.appendChild(o);
    });
    if (current && !seen) {
      var o2 = document.createElement('option');
      o2.value = current;
      o2.textContent = current;
      o2.selected = true;
      sel.appendChild(o2);
    }
  }

  function buildBillingTableRow(row) {
    var tr = document.createElement('tr');
    tr.setAttribute('data-company-id', String(row.id));

    var tdId = document.createElement('td');
    tdId.textContent = String(row.id);
    tr.appendChild(tdId);

    var tdName = document.createElement('td');
    tdName.textContent = row.name != null ? String(row.name) : '';
    tr.appendChild(tdName);

    var tdPlan = document.createElement('td');
    tdPlan.textContent = row.subscription_plan != null ? String(row.subscription_plan) : '—';
    tr.appendChild(tdPlan);

    var tdPurch = document.createElement('td');
    var purchased = row.plan_purchased_at || row.created_at;
    tdPurch.innerHTML = formatDateTime(purchased);
    tr.appendChild(tdPurch);

    var tdExp = document.createElement('td');
    var dateInp = document.createElement('input');
    dateInp.type = 'date';
    dateInp.className = 'form-control form-control-sm bg-dark text-white border-secondary px-billing-expires';
    dateInp.value = toDateInputValue(row.plan_expires_at);
    tdExp.appendChild(dateInp);
    if (row.calendar_expired) {
      var hint = document.createElement('div');
      hint.className = 'small text-warning mt-1';
      hint.textContent = 'Expiry date passed (calendar)';
      tdExp.appendChild(hint);
    }
    tr.appendChild(tdExp);

    var tdPay = document.createElement('td');
    var paySel = document.createElement('select');
    paySel.className =
      'form-select form-select-sm bg-dark text-white border-secondary px-billing-payment';
    billingAppendSelectOptions(
      paySel,
      BILLING_PAYMENT_OPTIONS,
      row.payment_method || 'registration'
    );
    tdPay.appendChild(paySel);
    tr.appendChild(tdPay);

    var tdSt = document.createElement('td');
    var stSel = document.createElement('select');
    stSel.className =
      'form-select form-select-sm bg-dark text-white border-secondary px-billing-status';
    billingAppendSelectOptions(
      stSel,
      BILLING_STATUS_OPTIONS,
      row.billing_status || 'unpaid_active'
    );
    tdSt.appendChild(stSel);
    tr.appendChild(tdSt);

    var tdAct = document.createElement('td');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm btn-primary px-admin-billing-save';
    btn.textContent = 'Save';
    tdAct.appendChild(btn);
    tr.appendChild(tdAct);

    return tr;
  }

  function loadBillingPanel(sess) {
    var loading = document.getElementById('pxAdminBillingLoading');
    var wrap = document.getElementById('pxAdminBillingTableWrap');
    var empty = document.getElementById('pxAdminBillingEmpty');
    var alertEl = document.getElementById('pxAdminBillingAlert');
    var tbody = document.getElementById('pxAdminBillingBody');
    if (!tbody || !sess) return;

    if (alertEl) {
      alertEl.classList.add('d-none');
      alertEl.textContent = '';
      alertEl.classList.remove('alert-danger', 'alert-success');
    }
    if (empty) empty.classList.add('d-none');
    if (wrap) wrap.classList.add('d-none');
    tbody.innerHTML = '';
    if (loading) loading.classList.remove('d-none');

    fetch('/api/platform-admin/billing-subscriptions', {
      method: 'GET',
      headers: sessionHeaders(sess),
      credentials: 'same-origin',
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (out) {
        if (loading) loading.classList.add('d-none');
        if (out.status === 401) {
          clearSession();
          window.location.replace(LOGIN_URL);
          return;
        }
        if (out.status !== 200 || !out.data || !out.data.success) {
          if (alertEl) {
            alertEl.textContent =
              (out.data && out.data.message) || 'Could not load billing data.';
            alertEl.classList.add('alert-danger');
            alertEl.classList.remove('d-none');
          }
          return;
        }
        var list = out.data.subscriptions || [];
        if (list.length === 0) {
          if (empty) empty.classList.remove('d-none');
          return;
        }
        list.forEach(function (row) {
          tbody.appendChild(buildBillingTableRow(row));
        });
        if (wrap) wrap.classList.remove('d-none');
      })
      .catch(function () {
        if (loading) loading.classList.add('d-none');
        if (alertEl) {
          alertEl.textContent = 'Network error while loading billing.';
          alertEl.classList.add('alert-danger');
          alertEl.classList.remove('d-none');
        }
      });
  }

  var sysPollTimer = null;
  var serverLogAbort = null;

  function stopServerLogStream() {
    if (serverLogAbort) {
      serverLogAbort.abort();
      serverLogAbort = null;
    }
  }

  function scrollLiveLogToBottom() {
    var pre = document.getElementById('pxAdminAuditLiveLog');
    if (!pre) return;
    pre.scrollTop = pre.scrollHeight;
  }

  function startServerLogStream(sess) {
    stopServerLogStream();
    var pre = document.getElementById('pxAdminAuditLiveLog');
    if (!pre || !sess) return;
    pre.textContent = 'Connecting to live log stream…';
    serverLogAbort = new AbortController();
    var signal = serverLogAbort.signal;
    fetch('/api/platform-admin/server-log-stream', {
      method: 'GET',
      headers: sessionHeaders(sess),
      credentials: 'same-origin',
      signal: signal,
    })
      .then(function (res) {
        if (!res.ok) {
          pre.textContent =
            'Could not open live log stream (HTTP ' + res.status + '). Check platform admin session.';
          return null;
        }
        if (!res.body || !res.body.getReader) {
          pre.textContent = 'Streaming not supported in this browser.';
          return null;
        }
        return res.body.getReader();
      })
      .then(function (reader) {
        if (!reader) return;
        var decoder = new TextDecoder();
        var carry = '';
        function pump() {
          return reader.read().then(function (out) {
            if (out.done) return;
            carry += decoder.decode(out.value, { stream: true });
            var parts = carry.split('\n');
            carry = parts.pop() || '';
            parts.forEach(function (line) {
              if (!line.trim()) return;
              try {
                var obj = JSON.parse(line);
                if (obj.type === 'snapshot' && Array.isArray(obj.lines)) {
                  pre.textContent = obj.lines.length
                    ? obj.lines.join('\n') + '\n'
                    : '(No process output yet.)\n';
                  scrollLiveLogToBottom();
                } else if (obj.type === 'line' && obj.text != null) {
                  if (pre.textContent.indexOf('Connecting to live log stream') === 0) {
                    pre.textContent = '';
                  }
                  pre.textContent += obj.text + '\n';
                  scrollLiveLogToBottom();
                }
              } catch (_) {}
            });
            return pump();
          });
        }
        return pump();
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') return;
        if (pre) {
          pre.textContent +=
            (pre.textContent ? '\n' : '') +
            '[Live log stream error: ' +
            (err && err.message ? err.message : String(err)) +
            ']';
        }
      });
  }

  function clearSysPoll() {
    stopServerLogStream();
    if (sysPollTimer) {
      clearInterval(sysPollTimer);
      sysPollTimer = null;
    }
  }
  function scheduleSysPoll(sess) {
    if (sysPollTimer) {
      clearInterval(sysPollTimer);
      sysPollTimer = null;
    }
    sysPollTimer = setInterval(function () {
      var sys = document.querySelector('[data-px-admin-panel="system"]');
      var aud = document.querySelector('[data-px-admin-panel="audit"]');
      var sysVis = sys && !sys.classList.contains('d-none');
      var audVis = aud && !aud.classList.contains('d-none');
      if (sysVis || audVis) {
        loadSystemHealthPanel(sess);
      }
    }, 30000);
  }

  function drawSystemHealthChart(buckets) {
    var canvas = document.getElementById('pxAdminSysChart');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!buckets || buckets.length === 0) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('No /api traffic recorded yet — use the app to populate per-minute stats.', 12, h / 2);
      return;
    }
    var pad = { l: 44, r: 12, t: 14, b: 22 };
    var plotW = w - pad.l - pad.r;
    var plotH = h - pad.t - pad.b;
    var maxMs = 1;
    var maxErr = 0.1;
    buckets.forEach(function (b) {
      if (b.avg_response_ms > maxMs) maxMs = b.avg_response_ms;
      var er = b.error_rate_any_pct != null ? b.error_rate_any_pct : 0;
      if (er > maxErr) maxErr = er;
    });
    if (maxErr < 1) maxErr = 1;
    var n = buckets.length;
    function xAt(i) {
      return pad.l + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    }
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g += 1) {
      var gy = pad.t + (plotH * g) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.l, gy);
      ctx.lineTo(pad.l + plotW, gy);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    buckets.forEach(function (b, i) {
      var x = xAt(i);
      var y = pad.t + plotH - (b.avg_response_ms / maxMs) * plotH * 0.92;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 2;
    buckets.forEach(function (b, i) {
      var er = b.error_rate_any_pct != null ? b.error_rate_any_pct : 0;
      var x = xAt(i);
      var y = pad.t + plotH - (er / maxErr) * plotH * 0.92;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('0', 4, pad.t + plotH + 4);
    ctx.fillText(String(Math.round(maxMs)) + ' ms', 4, pad.t + 10);
    ctx.textAlign = 'right';
    ctx.fillText(String(maxErr.toFixed(1)) + '% max err', w - 4, pad.t + 10);
    ctx.textAlign = 'left';
  }

  function loadSystemHealthPanel(sess) {
    var loading = document.getElementById('pxAdminSysLoading');
    var auditLoading = document.getElementById('pxAdminAuditLoading');
    var content = document.getElementById('pxAdminSysContent');
    var auditContent = document.getElementById('pxAdminAuditContent');
    var alertEl = document.getElementById('pxAdminSysAlert');
    var auditAlert = document.getElementById('pxAdminAuditAlert');
    if (!sess) return;
    if (alertEl) {
      alertEl.classList.add('d-none');
      alertEl.textContent = '';
    }
    if (auditAlert) {
      auditAlert.classList.add('d-none');
      auditAlert.textContent = '';
    }
    if (loading) loading.classList.remove('d-none');
    if (auditLoading) auditLoading.classList.remove('d-none');
    if (content) content.classList.add('d-none');
    if (auditContent) auditContent.classList.add('d-none');

    fetch('/api/platform-admin/system-health', {
      method: 'GET',
      headers: sessionHeaders(sess),
      credentials: 'same-origin',
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (out) {
        if (loading) loading.classList.add('d-none');
        if (auditLoading) auditLoading.classList.add('d-none');
        if (out.status === 401) {
          clearSession();
          window.location.replace(LOGIN_URL);
          return;
        }
        if (out.status !== 200 || !out.data || !out.data.success) {
          var errMsg =
            (out.data && out.data.message) || 'Could not load system health.';
          if (alertEl) {
            alertEl.textContent = errMsg;
            alertEl.classList.remove('d-none');
          }
          if (auditAlert) {
            auditAlert.textContent = errMsg;
            auditAlert.classList.remove('d-none');
          }
          if (content) content.classList.remove('d-none');
          if (auditContent) auditContent.classList.remove('d-none');
          return;
        }
        var d = out.data;
        var consolePre = document.getElementById('pxAdminAuditConsole');
        if (consolePre) {
          if (d.console_banner && d.console_banner.lines && d.console_banner.lines.length) {
            consolePre.textContent = d.console_banner.lines.join('\n');
          } else {
            consolePre.textContent = '';
          }
        }
        var apiEl = document.getElementById('pxAdminSysApiStatus');
        if (apiEl) {
          apiEl.textContent = d.api && d.api.ok ? 'OK' : '—';
          apiEl.className =
            'px-admin-stat-value ' + (d.api && d.api.ok ? 'text-success' : 'text-warning');
        }
        var dbEl = document.getElementById('pxAdminSysDbStatus');
        var dbLat = document.getElementById('pxAdminSysDbLatency');
        if (dbEl) {
          dbEl.textContent = d.database && d.database.ok ? 'OK' : 'Down';
          dbEl.className =
            'px-admin-stat-value ' + (d.database && d.database.ok ? 'text-success' : 'text-danger');
        }
        if (dbLat) {
          dbLat.textContent =
            d.database && d.database.latency_ms != null
              ? 'Ping ~' + String(d.database.latency_ms) + ' ms'
              : 'Ping latency';
        }
        var up = document.getElementById('pxAdminSysUptime');
        if (up && d.uptime_seconds != null) {
          var s = d.uptime_seconds;
          var h = Math.floor(s / 3600);
          var m = Math.floor((s % 3600) / 60);
          var sec = s % 60;
          up.textContent = h + 'h ' + m + 'm ' + sec + 's';
        }
        var qd = document.getElementById('pxAdminSysQueue');
        var qn = document.getElementById('pxAdminSysQueueNote');
        if (qd) qd.textContent = d.queue && d.queue.depth != null ? String(d.queue.depth) : '—';
        if (qn) qn.textContent = (d.queue && d.queue.note) || 'Background jobs';

        var host = d.host || {};
        var np = d.node_process || {};
        var hostNoteEl = document.getElementById('pxAdminSysHostNote');
        if (hostNoteEl && d.host_metrics_note) hostNoteEl.textContent = d.host_metrics_note;

        var hl = document.getElementById('pxAdminSysHostLoad');
        var hls = document.getElementById('pxAdminSysHostLoadSub');
        if (hl) {
          var la = host.loadavg;
          if (la && la.length >= 3) {
            if (host.platform === 'win32' && la[0] === 0 && la[1] === 0 && la[2] === 0) {
              hl.textContent = 'N/A';
              if (hls) hls.textContent = 'Load average not available on Windows';
            } else {
              hl.textContent =
                la[0].toFixed(2) + ' · ' + la[1].toFixed(2) + ' · ' + la[2].toFixed(2);
              if (hls) {
                hls.textContent =
                  (host.cpu_count != null ? String(host.cpu_count) + ' CPUs · ' : '') + '1 / 5 / 15 min';
              }
            }
          }
        }

        var hr = document.getElementById('pxAdminSysHostRam');
        var hrs = document.getElementById('pxAdminSysHostRamSub');
        if (hr && host.mem_used_pct != null && host.mem_total_mb != null) {
          hr.textContent = host.mem_used_pct + '% used';
          if (hrs) {
            hrs.textContent =
              (host.mem_free_mb != null ? String(host.mem_free_mb) + ' MB free · ' : '') +
              String(host.mem_total_mb) +
              ' MB total';
          }
        } else if (hr) {
          hr.textContent = '—';
        }

        var nm = document.getElementById('pxAdminSysNodeMem');
        var nms = document.getElementById('pxAdminSysNodeMemSub');
        if (nm && np.rss_mb != null) {
          nm.textContent = np.rss_mb + ' MB RSS';
          if (nms && np.heap_used_mb != null && np.heap_total_mb != null) {
            nms.textContent = 'Heap ' + np.heap_used_mb + ' / ' + np.heap_total_mb + ' MB';
          }
        } else if (nm) {
          nm.textContent = '—';
        }

        var nc = document.getElementById('pxAdminSysNodeCpu');
        var ncs = document.getElementById('pxAdminSysNodeCpuSub');
        if (nc) {
          if (np.cpu_percent_since_last != null && np.cpu_percent_since_last !== undefined) {
            nc.textContent = String(np.cpu_percent_since_last) + '%';
            nc.className =
              'px-admin-stat-value ' +
              (Number(np.cpu_percent_since_last) > 85 ? 'text-warning' : 'text-info');
          } else {
            nc.textContent = '—';
            nc.className = 'px-admin-stat-value text-white-50';
            if (ncs) ncs.textContent = 'Second refresh (or auto-refresh) shows %';
          }
        }

        var projDisk = d.project_disk;
        var diskTotal = document.getElementById('pxAdminAuditDiskTotal');
        var diskMeta = document.getElementById('pxAdminAuditDiskMeta');
        var diskBody = document.getElementById('pxAdminAuditDiskBody');
        var diskImages = document.getElementById('pxAdminAuditDiskImages');
        var diskDocuments = document.getElementById('pxAdminAuditDiskDocuments');
        var diskOthers = document.getElementById('pxAdminAuditDiskOthers');
        function formatSizeMb(mbValue) {
          var mb = Number(mbValue || 0);
          return mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : mb.toFixed(1) + ' MB';
        }
        var diskMissingApi =
          projDisk === undefined && !Object.prototype.hasOwnProperty.call(d, 'project_disk');
        if (diskMissingApi) {
          projDisk = null;
        } else if (projDisk == null) {
          projDisk = {};
        }
        if (diskTotal) {
          if (diskMissingApi) {
            diskTotal.textContent = '—';
            diskTotal.className = 'px-admin-stat-value text-warning';
            if (diskMeta) {
              diskMeta.textContent =
                'Disk metrics need a recent API: restart Node after git pull so GET /api/platform-admin/system-health includes project_disk.';
            }
            if (diskImages) diskImages.textContent = '—';
            if (diskDocuments) diskDocuments.textContent = '—';
            if (diskOthers) diskOthers.textContent = '—';
          } else if (projDisk && projDisk.error) {
            diskTotal.textContent = '—';
            diskTotal.className = 'px-admin-stat-value text-warning';
            if (diskMeta) diskMeta.textContent = projDisk.error;
            if (diskImages) diskImages.textContent = '—';
            if (diskDocuments) diskDocuments.textContent = '—';
            if (diskOthers) diskOthers.textContent = '—';
          } else if (projDisk && (projDisk.total_mb != null || projDisk.total_bytes != null)) {
            var tmb =
              projDisk.total_mb != null
                ? Number(projDisk.total_mb)
                : Number(projDisk.total_bytes) / (1024 * 1024);
            diskTotal.textContent = formatSizeMb(tmb);
            diskTotal.className = 'px-admin-stat-value text-info';
            if (diskMeta) {
              var metaD = [];
              if (projDisk.root_path) metaD.push(projDisk.root_path);
              if (projDisk.scanned_at) metaD.push('scanned ' + projDisk.scanned_at);
              if (projDisk.from_cache) metaD.push('cached result');
              diskMeta.textContent = metaD.length ? metaD.join(' · ') : '—';
            }
            var categories = projDisk.categories || {};
            var imagesMb =
              categories.images_mb != null
                ? Number(categories.images_mb)
                : Number(categories.images_bytes || 0) / (1024 * 1024);
            var documentsMb =
              categories.documents_mb != null
                ? Number(categories.documents_mb)
                : Number(categories.documents_bytes || 0) / (1024 * 1024);
            var othersMb =
              categories.others_mb != null
                ? Number(categories.others_mb)
                : Number(categories.others_bytes || 0) / (1024 * 1024);
            if (diskImages) diskImages.textContent = formatSizeMb(imagesMb);
            if (diskDocuments) diskDocuments.textContent = formatSizeMb(documentsMb);
            if (diskOthers) diskOthers.textContent = formatSizeMb(othersMb);
          } else if (diskMeta && !diskMissingApi) {
            diskMeta.textContent = '—';
            if (diskImages) diskImages.textContent = '—';
            if (diskDocuments) diskDocuments.textContent = '—';
            if (diskOthers) diskOthers.textContent = '—';
          }
        }
        if (diskBody) {
          diskBody.innerHTML = '';
          if (diskMissingApi) {
            var trM = document.createElement('tr');
            trM.innerHTML =
              '<td colspan="2" class="text-white-50">Update and restart the backend server, then refresh this page.</td>';
            diskBody.appendChild(trM);
          } else {
            var rows = (projDisk && projDisk.entries) || [];
            if (projDisk && projDisk.error) {
              var trE = document.createElement('tr');
              trE.innerHTML =
                '<td colspan="2" class="text-white-50">Could not scan project directory.</td>';
              diskBody.appendChild(trE);
            } else if (rows.length === 0) {
              var tr0 = document.createElement('tr');
              tr0.innerHTML =
                '<td colspan="2" class="text-white-50">No top-level entries (empty project root or no read access).</td>';
              diskBody.appendChild(tr0);
            } else {
              rows.forEach(function (row) {
                var tr = document.createElement('tr');
                var mb = row.mb != null ? Number(row.mb) : 0;
                var sz = formatSizeMb(mb);
                tr.innerHTML =
                  '<td class="font-monospace small">' +
                  cellText(row.name) +
                  '</td><td class="text-end text-nowrap">' +
                  cellText(sz) +
                  '</td>';
                diskBody.appendChild(tr);
              });
            }
          }
        }

        var desc = document.getElementById('pxAdminSysMetricsDesc');
        if (desc && d.metrics && d.metrics.description) desc.textContent = d.metrics.description;

        drawSystemHealthChart((d.metrics && d.metrics.buckets) || []);

        var poolUl = document.getElementById('pxAdminSysPool');
        if (poolUl) {
          poolUl.innerHTML = '';
          var p = d.pool || {};
          function li(t) {
            var li0 = document.createElement('li');
            li0.className = 'mb-1';
            li0.textContent = t;
            poolUl.appendChild(li0);
          }
          if (p.totalCount != null) li('Total clients: ' + p.totalCount);
          if (p.idleCount != null) li('Idle: ' + p.idleCount);
          if (p.waitingCount != null) li('Waiting (queued for connection): ' + p.waitingCount);
          if (poolUl.children.length === 0) li('Pool stats unavailable.');
        }
        var pgUl = document.getElementById('pxAdminSysPgConn');
        if (pgUl) {
          pgUl.innerHTML = '';
          var pc = d.pg_connections || {};
          function li2(t) {
            var li0 = document.createElement('li');
            li0.className = 'mb-1';
            li0.textContent = t;
            pgUl.appendChild(li0);
          }
          if (pc.active != null) li2('Sessions to this database: ' + pc.active);
          if (pc.max != null) li2('max_connections (server): ' + pc.max);
          if (pc.error) li2('Note: ' + pc.error);
          if (pgUl.children.length === 0) li2('—');
        }

        var slowNote = document.getElementById('pxAdminAuditSlowNote');
        if (slowNote && d.slow_queries_meta) {
          slowNote.textContent =
            (d.slow_queries_meta.note || '') +
            (d.slow_queries_meta.source ? ' · source: ' + d.slow_queries_meta.source : '');
        }
        var slowBody = document.getElementById('pxAdminAuditSlowBody');
        if (slowBody) {
          slowBody.innerHTML = '';
          var sq = d.slow_queries || [];
          if (sq.length === 0) {
            var tr0 = document.createElement('tr');
            tr0.innerHTML =
              '<td colspan="3" class="text-white-50">No slow-query rows returned.</td>';
            slowBody.appendChild(tr0);
          } else {
            sq.forEach(function (row) {
              var tr = document.createElement('tr');
              var mean =
                row.mean_ms != null
                  ? String(row.mean_ms)
                  : row.running_sec != null
                    ? '~' + String(row.running_sec) + 's'
                    : '—';
              tr.innerHTML =
                '<td class="small font-monospace">' +
                cellText(row.query || '—') +
                '</td><td>' +
                cellText(row.calls != null ? row.calls : '—') +
                '</td><td>' +
                cellText(mean) +
                '</td>';
              slowBody.appendChild(tr);
            });
          }
        }

        var flagsBody = document.getElementById('pxAdminAuditFlagsBody');
        var flagsEmpty = document.getElementById('pxAdminAuditFlagsEmpty');
        if (flagsBody) {
          flagsBody.innerHTML = '';
          var flags = d.feature_flags || [];
          if (flags.length === 0) {
            if (flagsEmpty) flagsEmpty.classList.remove('d-none');
          } else {
            if (flagsEmpty) flagsEmpty.classList.add('d-none');
            flags.forEach(function (f) {
              var tr = document.createElement('tr');
              tr.innerHTML =
                '<td class="font-monospace small">' +
                cellText(f.key) +
                '</td><td class="small">' +
                cellText(f.value) +
                '</td><td>' +
                (f.enabled
                  ? '<span class="badge bg-success">yes</span>'
                  : '<span class="badge bg-secondary">no</span>') +
                '</td><td class="small text-white-50">' +
                cellText(f.source || '—') +
                '</td>';
              flagsBody.appendChild(tr);
            });
          }
        }

        if (content) content.classList.remove('d-none');
        if (auditContent) auditContent.classList.remove('d-none');
      })
      .catch(function () {
        if (loading) loading.classList.add('d-none');
        if (auditLoading) auditLoading.classList.add('d-none');
        if (alertEl) {
          alertEl.textContent = 'Network error while loading system health.';
          alertEl.classList.remove('d-none');
        }
        if (auditAlert) {
          auditAlert.textContent = 'Network error while loading system health.';
          auditAlert.classList.remove('d-none');
        }
        if (content) content.classList.remove('d-none');
        if (auditContent) auditContent.classList.remove('d-none');
      });
  }

  var session = parseSession(readSessionRaw());
  if (!session) {
    clearSession();
    window.location.replace(LOGIN_URL);
    return;
  }

  var emailEl = document.getElementById('pxAdminUserEmail');
  if (emailEl) emailEl.textContent = session.email;

  var replyHintEl = document.getElementById('pxContentReplyHint');
  if (replyHintEl && session.email) replyHintEl.textContent = session.email;

  var nameEl = document.getElementById('pxAdminUserName');
  if (nameEl && session.full_name) {
    nameEl.textContent = session.full_name;
    nameEl.classList.remove('d-none', 'd-md-inline');
    nameEl.classList.add('d-inline');
  }

  fetch('/api/platform-admin/me', {
    method: 'GET',
    headers: sessionHeaders(session),
    credentials: 'same-origin',
  })
    .then(function (res) {
      return res.json().then(function (data) {
        return { status: res.status, data: data };
      });
    })
    .then(function (out) {
      if (out.status !== 200 || !out.data || !out.data.success || !out.data.platform_admin) {
        clearSession();
        window.location.replace(LOGIN_URL);
        return;
      }
      var pa = out.data.platform_admin;
      if (emailEl) emailEl.textContent = pa.email || session.email;
      if (replyHintEl) replyHintEl.textContent = pa.email || session.email || '—';
      if (nameEl && pa.full_name) nameEl.textContent = pa.full_name;

      var banner = document.getElementById('pxAdminDevBanner');
      if (banner) {
        banner.className = 'alert alert-success px-admin-dev-banner d-flex align-items-start gap-2';
        banner.textContent = '';
        var okIcon = document.createElement('i');
        okIcon.className = 'bi bi-check-circle flex-shrink-0 mt-1';
        okIcon.setAttribute('aria-hidden', 'true');
        var wrap = document.createElement('div');
        var strong = document.createElement('strong');
        strong.textContent = 'Session active. ';
        wrap.appendChild(strong);
        wrap.appendChild(document.createTextNode('Signed in as '));
        var span = document.createElement('span');
        span.className = 'font-monospace';
        span.textContent = pa.email || session.email || '';
        wrap.appendChild(span);
        banner.appendChild(okIcon);
        banner.appendChild(wrap);
      }
    })
    .catch(function () {
      clearSession();
      window.location.replace(LOGIN_URL);
    });

  var btnOut = document.getElementById('pxAdminSignOut');
  if (btnOut) {
    btnOut.addEventListener('click', function () {
      clearSession();
      window.location.href = LOGIN_URL;
    });
  }

  function showContentEmailAlert(text, kind) {
    var el = document.getElementById('pxAdminContentEmailAlert');
    if (!el) return;
    el.textContent = text;
    el.className = 'alert ' + (kind === 'success' ? 'alert-success' : 'alert-danger');
    el.classList.remove('d-none');
  }

  function hideContentEmailAlert() {
    var el = document.getElementById('pxAdminContentEmailAlert');
    if (el) {
      el.classList.add('d-none');
      el.textContent = '';
    }
  }

  var contentEmailForm = document.getElementById('pxContentClientEmailForm');
  var contentEmailBtn = document.getElementById('pxContentEmailSendBtn');
  var contentEmailClear = document.getElementById('pxContentEmailClearBtn');
  if (contentEmailForm) {
    contentEmailForm.addEventListener('submit', function (e) {
      e.preventDefault();
      hideContentEmailAlert();
      var toEl = document.getElementById('pxContentEmailTo');
      var subjEl = document.getElementById('pxContentEmailSubject');
      var bodyEl = document.getElementById('pxContentEmailBody');
      if (!toEl || !subjEl || !bodyEl) return;
      var payload = {
        to: toEl.value.trim(),
        subject: subjEl.value.trim(),
        body: bodyEl.value,
      };
      if (contentEmailBtn) contentEmailBtn.disabled = true;
      fetch('/api/platform-admin/send-client-email', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, sessionHeaders(session)),
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { status: res.status, data: data };
          });
        })
        .then(function (out) {
          if (contentEmailBtn) contentEmailBtn.disabled = false;
          if (out.status === 401) {
            clearSession();
            window.location.replace(LOGIN_URL);
            return;
          }
          if (out.status === 200 && out.data && out.data.success) {
            showContentEmailAlert(out.data.message || 'Email sent.', 'success');
            contentEmailForm.reset();
            return;
          }
          showContentEmailAlert((out.data && out.data.message) || 'Send failed.', 'error');
        })
        .catch(function () {
          if (contentEmailBtn) contentEmailBtn.disabled = false;
          showContentEmailAlert('Network error.', 'error');
        });
    });
  }
  if (contentEmailClear) {
    contentEmailClear.addEventListener('click', function () {
      hideContentEmailAlert();
      if (contentEmailForm) contentEmailForm.reset();
    });
  }

  var navDesktop = document.getElementById('pxAdminSideNav');
  var navMobile = document.getElementById('pxAdminSideNavMobile');
  var navs = [navDesktop, navMobile].filter(Boolean);
  var panels = document.querySelectorAll('[data-px-admin-panel]');
  var offcanvasEl = document.getElementById('pxAdminSidebar');

  function setActiveSection(id) {
    navs.forEach(function (nav) {
      nav.querySelectorAll('[data-px-admin-section]').forEach(function (a) {
        a.classList.toggle('active', a.getAttribute('data-px-admin-section') === id);
      });
    });
  }

  function showPanel(id, titleText) {
    panels.forEach(function (p) {
      p.classList.toggle('d-none', p.getAttribute('data-px-admin-panel') !== id);
    });
    var title = document.getElementById('pxAdminPageTitle');
    if (title) title.textContent = titleText || 'Overview';
  }

  navs.forEach(function (nav) {
    nav.addEventListener('click', function (e) {
      var link = e.target.closest('[data-px-admin-section]');
      if (!link) return;
      e.preventDefault();
      var id = link.getAttribute('data-px-admin-section');
      var titleText = link.getAttribute('data-px-admin-title');
      clearSysPoll();
      setActiveSection(id);
      showPanel(id, titleText);
      if (id === 'companies') {
        loadCompaniesPanel(session);
      }
      if (id === 'users') {
        loadPlatformUsersPanel(session);
      }
      if (id === 'billing') {
        loadBillingPanel(session);
      }
      if (id === 'system') {
        loadSystemHealthPanel(session);
        scheduleSysPoll(session);
      }
      if (id === 'audit') {
        loadSystemHealthPanel(session);
        scheduleSysPoll(session);
        startServerLogStream(session);
      }
      if (offcanvasEl && window.bootstrap) {
        var inst = window.bootstrap.Offcanvas.getInstance(offcanvasEl);
        if (inst) inst.hide();
      }
    });
  });

  var btnCompaniesRefresh = document.getElementById('pxAdminCompaniesRefresh');
  if (btnCompaniesRefresh) {
    btnCompaniesRefresh.addEventListener('click', function () {
      loadCompaniesPanel(session);
    });
  }

  var btnSysRefresh = document.getElementById('pxAdminSysRefresh');
  if (btnSysRefresh) {
    btnSysRefresh.addEventListener('click', function () {
      loadSystemHealthPanel(session);
    });
  }

  var btnAuditRefresh = document.getElementById('pxAdminAuditRefresh');
  if (btnAuditRefresh) {
    btnAuditRefresh.addEventListener('click', function () {
      loadSystemHealthPanel(session);
    });
  }

  var btnAuditLogTest = document.getElementById('pxAdminAuditLogTest');
  if (btnAuditLogTest) {
    btnAuditLogTest.addEventListener('click', function () {
      btnAuditLogTest.disabled = true;
      fetch('/api/platform-admin/log-test', {
        method: 'POST',
        headers: sessionHeaders(session),
        credentials: 'same-origin',
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { status: res.status, data: data };
          });
        })
        .then(function (out) {
          btnAuditLogTest.disabled = false;
          if (out.status === 401) {
            clearSession();
            window.location.replace(LOGIN_URL);
            return;
          }
          if (out.status === 200 && out.data && out.data.success) {
            alert(out.data.message || 'Test lines logged.');
          } else {
            alert((out.data && out.data.message) || 'Could not run log test.');
          }
        })
        .catch(function () {
          btnAuditLogTest.disabled = false;
          alert('Network error while sending test log.');
        });
    });
  }

  var btnBillingRefresh = document.getElementById('pxAdminBillingRefresh');
  if (btnBillingRefresh) {
    btnBillingRefresh.addEventListener('click', function () {
      loadBillingPanel(session);
    });
  }

  var billingTbodyEl = document.getElementById('pxAdminBillingBody');
  if (billingTbodyEl) {
    billingTbodyEl.addEventListener('click', function (e) {
      var btn = e.target.closest('.px-admin-billing-save');
      if (!btn) return;
      var tr = btn.closest('tr[data-company-id]');
      if (!tr) return;
      var cid = tr.getAttribute('data-company-id');
      var statusSel = tr.querySelector('.px-billing-status');
      var paySel = tr.querySelector('.px-billing-payment');
      var dateInp = tr.querySelector('.px-billing-expires');
      if (!statusSel || !paySel || !dateInp) return;
      var payload = {
        billing_status: statusSel.value,
        payment_method: paySel.value,
        plan_expires_at: dateInp.value ? dateInp.value : null,
      };
      btn.disabled = true;
      fetch('/api/platform-admin/billing-subscriptions/' + encodeURIComponent(cid), {
        method: 'PATCH',
        headers: Object.assign({ 'Content-Type': 'application/json' }, sessionHeaders(session)),
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { status: res.status, data: data };
          });
        })
        .then(function (out) {
          btn.disabled = false;
          var billAlert = document.getElementById('pxAdminBillingAlert');
          if (out.status === 401) {
            clearSession();
            window.location.replace(LOGIN_URL);
            return;
          }
          if (out.status !== 200 || !out.data || !out.data.success) {
            if (billAlert) {
              billAlert.textContent = (out.data && out.data.message) || 'Save failed.';
              billAlert.className = 'alert alert-danger';
              billAlert.classList.remove('d-none');
            }
            return;
          }
          if (billAlert) {
            billAlert.textContent = 'Saved.';
            billAlert.className = 'alert alert-success';
            billAlert.classList.remove('d-none');
            window.setTimeout(function () {
              billAlert.classList.add('d-none');
            }, 2500);
          }
          loadBillingPanel(session);
        })
        .catch(function () {
          btn.disabled = false;
          var billAlert = document.getElementById('pxAdminBillingAlert');
          if (billAlert) {
            billAlert.textContent = 'Network error.';
            billAlert.className = 'alert alert-danger';
            billAlert.classList.remove('d-none');
          }
        });
    });
  }

  /* —— Platform users (managers + users) —— */
  var currentPuKind = null;
  var currentPuId = null;
  var platformUsersCache = [];

  function puDisplayName(row) {
    if (row.kind === 'manager') {
      return [row.name, row.surname].filter(Boolean).join(' ').trim();
    }
    return row.name || '';
  }

  function puRoleLabel(row) {
    return row.kind === 'manager' ? row.is_head_manager || '—' : row.role || '—';
  }

  function appendPlatformUserRow(tbody, row) {
    var tr = document.createElement('tr');
    tr.className = 'px-admin-pu-row';
    tr.setAttribute('data-pu-kind', String(row.kind || ''));
    tr.setAttribute('data-pu-id', String(row.id));
    tr.setAttribute('role', 'button');
    tr.tabIndex = 0;
    var typeLabel = row.kind === 'manager' ? 'Manager' : 'User';
    var displayName = puDisplayName(row);
    var roleLabel = puRoleLabel(row);
    var activeStr = row.active === true || row.active === 'true' || row.active === 't' ? 'Yes' : 'No';
    var pwdStr = row.password_set ? 'Yes' : 'No';
    tr.innerHTML =
      '<td>' +
      cellText(typeLabel) +
      '</td><td>' +
      cellText(row.id) +
      '</td><td>' +
      cellText(row.company_name) +
      '</td><td>' +
      cellText(displayName) +
      '</td><td>' +
      cellText(row.email) +
      '</td><td>' +
      cellText(roleLabel) +
      '</td><td>' +
      cellText(activeStr) +
      '</td><td>' +
      cellText(pwdStr) +
      '</td>';
    tbody.appendChild(tr);
  }

  function fillPuCompanySelect(list) {
    var sel = document.getElementById('pxAdminPuFilterCompany');
    if (!sel) return;
    var prev = sel.value;
    while (sel.options.length > 1) {
      sel.remove(1);
    }
    var byId = {};
    list.forEach(function (row) {
      var cid = row.company_id;
      if (cid == null || cid === '') return;
      var key = String(cid);
      if (byId[key]) return;
      var label =
        (row.company_name && String(row.company_name).trim()) || 'Company #' + key;
      byId[key] = label;
    });
    var keys = Object.keys(byId).sort(function (a, b) {
      return byId[a].localeCompare(byId[b], undefined, { sensitivity: 'base' });
    });
    keys.forEach(function (key) {
      var o = document.createElement('option');
      o.value = key;
      o.textContent = byId[key];
      sel.appendChild(o);
    });
    if (prev && Array.prototype.some.call(sel.options, function (opt) { return opt.value === prev; })) {
      sel.value = prev;
    } else {
      sel.value = '';
    }
  }

  function filterPlatformUsersList(list) {
    var companySel = document.getElementById('pxAdminPuFilterCompany');
    var typeSel = document.getElementById('pxAdminPuFilterType');
    var searchInp = document.getElementById('pxAdminPuSearch');
    var companyId = companySel ? companySel.value : '';
    var typeV = typeSel ? typeSel.value : '';
    var q = searchInp && searchInp.value ? String(searchInp.value).toLowerCase().trim() : '';

    return list.filter(function (row) {
      if (companyId !== '' && String(row.company_id) !== companyId) return false;
      if (typeV && String(row.kind) !== typeV) return false;
      if (!q) return true;
      var typeLabel = row.kind === 'manager' ? 'manager' : 'user';
      var displayName = puDisplayName(row);
      var roleLabel = puRoleLabel(row);
      var hay = [
        typeLabel,
        String(row.id),
        row.company_id != null ? String(row.company_id) : '',
        row.company_name,
        displayName,
        row.email,
        roleLabel,
        row.name,
        row.surname,
      ]
        .filter(function (x) {
          return x != null && x !== '';
        })
        .join(' ')
        .toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  function applyPlatformUsersFilters() {
    var tbody = document.getElementById('pxAdminPuBody');
    var wrap = document.getElementById('pxAdminPuTableWrap');
    var empty = document.getElementById('pxAdminPuEmpty');
    var noRes = document.getElementById('pxAdminPuNoResults');
    var toolbar = document.getElementById('pxAdminPuToolbar');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (platformUsersCache.length === 0) {
      if (toolbar) toolbar.classList.add('d-none');
      if (wrap) wrap.classList.add('d-none');
      if (empty) empty.classList.remove('d-none');
      if (noRes) noRes.classList.add('d-none');
      return;
    }

    if (toolbar) toolbar.classList.remove('d-none');
    if (empty) empty.classList.add('d-none');

    var filtered = filterPlatformUsersList(platformUsersCache);
    if (filtered.length === 0) {
      if (wrap) wrap.classList.add('d-none');
      if (noRes) noRes.classList.remove('d-none');
      return;
    }

    if (noRes) noRes.classList.add('d-none');
    filtered.forEach(function (row) {
      appendPlatformUserRow(tbody, row);
    });
    if (wrap) wrap.classList.remove('d-none');
  }

  function loadPlatformUsersPanel(sess) {
    var loading = document.getElementById('pxAdminPuLoading');
    var wrap = document.getElementById('pxAdminPuTableWrap');
    var empty = document.getElementById('pxAdminPuEmpty');
    var noRes = document.getElementById('pxAdminPuNoResults');
    var alertEl = document.getElementById('pxAdminPuAlert');
    var toolbar = document.getElementById('pxAdminPuToolbar');
    var tbody = document.getElementById('pxAdminPuBody');
    if (!tbody || !sess) return;

    if (alertEl) {
      alertEl.classList.add('d-none');
      alertEl.textContent = '';
    }
    if (empty) empty.classList.add('d-none');
    if (noRes) noRes.classList.add('d-none');
    if (wrap) wrap.classList.add('d-none');
    if (toolbar) toolbar.classList.add('d-none');
    tbody.innerHTML = '';
    if (loading) loading.classList.remove('d-none');

    fetch('/api/platform-admin/platform-users', {
      method: 'GET',
      headers: sessionHeaders(sess),
      credentials: 'same-origin',
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (out) {
        if (loading) loading.classList.add('d-none');
        if (out.status === 401) {
          clearSession();
          window.location.replace(LOGIN_URL);
          return;
        }
        if (out.status !== 200 || !out.data || !out.data.success) {
          platformUsersCache = [];
          if (alertEl) {
            alertEl.textContent =
              (out.data && out.data.message) || 'Could not load platform users.';
            alertEl.classList.remove('d-none');
          }
          applyPlatformUsersFilters();
          return;
        }
        platformUsersCache = out.data.items || [];
        fillPuCompanySelect(platformUsersCache);
        applyPlatformUsersFilters();
      })
      .catch(function () {
        if (loading) loading.classList.add('d-none');
        platformUsersCache = [];
        applyPlatformUsersFilters();
        if (alertEl) {
          alertEl.textContent = 'Network error while loading platform users.';
          alertEl.classList.remove('d-none');
        }
      });
  }

  var btnPuRefresh = document.getElementById('pxAdminPuRefresh');
  if (btnPuRefresh) {
    btnPuRefresh.addEventListener('click', function () {
      loadPlatformUsersPanel(session);
    });
  }

  var puFilterCompany = document.getElementById('pxAdminPuFilterCompany');
  var puFilterType = document.getElementById('pxAdminPuFilterType');
  var puSearch = document.getElementById('pxAdminPuSearch');
  var puClearFilters = document.getElementById('pxAdminPuClearFilters');
  if (puFilterCompany) {
    puFilterCompany.addEventListener('change', applyPlatformUsersFilters);
  }
  if (puFilterType) {
    puFilterType.addEventListener('change', applyPlatformUsersFilters);
  }
  if (puSearch) {
    puSearch.addEventListener('input', applyPlatformUsersFilters);
  }
  if (puClearFilters) {
    puClearFilters.addEventListener('click', function () {
      if (puFilterCompany) puFilterCompany.value = '';
      if (puFilterType) puFilterType.value = '';
      if (puSearch) puSearch.value = '';
      applyPlatformUsersFilters();
    });
  }

  var puModalEl = document.getElementById('pxAdminPuModal');
  var puModalLoading = document.getElementById('pxAdminPuModalLoading');
  var puModalForm = document.getElementById('pxAdminPuModalForm');
  var puModalFeedback = document.getElementById('pxAdminPuModalFeedback');
  var puBlockM = document.getElementById('pxPu_block_manager');
  var puBlockU = document.getElementById('pxPu_block_user');

  function getPuModal() {
    if (!puModalEl || !window.bootstrap) return null;
    return window.bootstrap.Modal.getOrCreateInstance(puModalEl);
  }

  function hidePuModalFeedback() {
    if (!puModalFeedback) return;
    puModalFeedback.classList.add('d-none');
    puModalFeedback.textContent = '';
  }

  function showPuModalFeedback(text, kind) {
    if (!puModalFeedback) return;
    puModalFeedback.textContent = text;
    puModalFeedback.className = 'alert ' + (kind === 'success' ? 'alert-success' : 'alert-danger');
    puModalFeedback.classList.remove('d-none');
  }

  function boolFromRow(v) {
    return v === true || v === 'true' || v === 't' || v === 1;
  }

  function timeForInput(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'string') {
      var s = v.trim();
      if (s.length >= 8) return s.slice(0, 8);
      if (s.length === 5) return s + ':00';
      return s;
    }
    try {
      if (v instanceof Date && !isNaN(v.getTime())) {
        var h = v.getHours();
        var m = v.getMinutes();
        var sec = v.getSeconds();
        return (
          String(h).padStart(2, '0') +
          ':' +
          String(m).padStart(2, '0') +
          ':' +
          String(sec).padStart(2, '0')
        );
      }
    } catch (e) {}
    return '';
  }

  function setCreatedAtInput(elId, val) {
    var el = document.getElementById(elId);
    if (!el) return;
    if (!val) {
      el.value = '';
      return;
    }
    try {
      var d0 = new Date(val);
      el.value = isNaN(d0.getTime()) ? String(val) : d0.toLocaleString();
    } catch (e1) {
      el.value = String(val);
    }
  }

  function fillPuModal(record) {
    if (!record) return;
    if (puBlockM) puBlockM.classList.add('d-none');
    if (puBlockU) puBlockU.classList.add('d-none');
    if (record.kind === 'manager' && puBlockM) {
      puBlockM.classList.remove('d-none');
      setVal('pxPu_m_id', record.id);
      setVal('pxPu_m_company_id', record.company_id);
      setVal('pxPu_m_company_name', record.company_name);
      setVal('pxPu_m_name', record.name);
      setVal('pxPu_m_surname', record.surname);
      setVal('pxPu_m_email', record.email);
      setVal('pxPu_m_is_head_manager', record.is_head_manager);
      setVal('pxPu_m_project_onboard_name', record.project_onboard_name);
      var tm = document.getElementById('pxPu_m_dezactivation_date');
      if (tm) tm.value = timeForInput(record.dezactivation_date);
      setCreatedAtInput('pxPu_m_created_at', record.created_at);
      var a1 = document.getElementById('pxPu_m_active');
      if (a1) a1.checked = boolFromRow(record.active);
      var a2 = document.getElementById('pxPu_m_active_status');
      if (a2) a2.checked = record.active_status === true || record.active_status === 'true';
      setVal('pxPu_m_new_password', '');
    } else if (record.kind === 'user' && puBlockU) {
      puBlockU.classList.remove('d-none');
      setVal('pxPu_u_id', record.id);
      setVal('pxPu_u_company_id', record.company_id);
      setVal('pxPu_u_company_name', record.company_name);
      setVal('pxPu_u_project_id', record.project_id != null ? record.project_id : '');
      setVal('pxPu_u_role', record.role);
      setVal('pxPu_u_name', record.name);
      setVal('pxPu_u_email', record.email);
      setVal('pxPu_u_onboarding', record.onboarding);
      setCreatedAtInput('pxPu_u_created_at', record.created_at);
      var ua = document.getElementById('pxPu_u_active');
      if (ua) ua.checked = boolFromRow(record.active);
      var uas = document.getElementById('pxPu_u_active_status');
      if (uas) uas.checked = boolFromRow(record.active_status);
      var uob = document.getElementById('pxPu_u_onboarded');
      if (uob) uob.checked = boolFromRow(record.onboarded);
      setVal('pxPu_u_new_password', '');
    }
    var title = document.getElementById('pxAdminPuModalLabel');
    if (title) {
      title.textContent =
        (record.kind === 'manager' ? 'Manager' : 'User') + ' · ID ' + String(record.id);
    }
  }

  function openPuModal(kind, id) {
    currentPuKind = kind;
    currentPuId = id;
    hidePuModalFeedback();
    if (puModalLoading) puModalLoading.classList.remove('d-none');
    if (puModalForm) puModalForm.classList.add('d-none');
    var m = getPuModal();
    if (m) m.show();

    fetch(
      '/api/platform-admin/platform-users/' + encodeURIComponent(kind) + '/' + encodeURIComponent(id),
      {
        method: 'GET',
        headers: sessionHeaders(session),
        credentials: 'same-origin',
      }
    )
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (out) {
        if (puModalLoading) puModalLoading.classList.add('d-none');
        if (out.status === 401) {
          clearSession();
          window.location.replace(LOGIN_URL);
          return;
        }
        if (out.status !== 200 || !out.data || !out.data.success || !out.data.record) {
          showPuModalFeedback((out.data && out.data.message) || 'Could not load record.', 'error');
          if (puModalForm) puModalForm.classList.remove('d-none');
          return;
        }
        fillPuModal(out.data.record);
        if (puModalForm) puModalForm.classList.remove('d-none');
      })
      .catch(function () {
        if (puModalLoading) puModalLoading.classList.add('d-none');
        if (puModalForm) puModalForm.classList.remove('d-none');
        showPuModalFeedback('Network error.', 'error');
      });
  }

  var tbodyPu = document.getElementById('pxAdminPuBody');
  if (tbodyPu) {
    tbodyPu.addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-pu-kind]');
      if (!tr) return;
      var k = tr.getAttribute('data-pu-kind');
      var pid = tr.getAttribute('data-pu-id');
      if (k && pid) openPuModal(k, pid);
    });
    tbodyPu.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var tr = e.target.closest('tr[data-pu-kind]');
      if (!tr) return;
      e.preventDefault();
      var k = tr.getAttribute('data-pu-kind');
      var pid = tr.getAttribute('data-pu-id');
      if (k && pid) openPuModal(k, pid);
    });
  }

  var btnPuSave = document.getElementById('pxAdminPuSaveBtn');
  if (btnPuSave) {
    btnPuSave.addEventListener('click', function () {
      if (!currentPuKind || currentPuId == null) return;
      hidePuModalFeedback();
      var payload = {};
      if (currentPuKind === 'manager') {
        var cidm = parseInt(
          document.getElementById('pxPu_m_company_id') && document.getElementById('pxPu_m_company_id').value,
          10
        );
        if (!Number.isInteger(cidm) || cidm < 1) {
          showPuModalFeedback('Valid company ID is required.', 'error');
          return;
        }
        payload.company_id = cidm;
        payload.name = document.getElementById('pxPu_m_name') && document.getElementById('pxPu_m_name').value;
        payload.surname = document.getElementById('pxPu_m_surname') && document.getElementById('pxPu_m_surname').value;
        payload.email = document.getElementById('pxPu_m_email') && document.getElementById('pxPu_m_email').value;
        payload.is_head_manager =
          document.getElementById('pxPu_m_is_head_manager') &&
          document.getElementById('pxPu_m_is_head_manager').value;
        payload.project_onboard_name =
          document.getElementById('pxPu_m_project_onboard_name') &&
          document.getElementById('pxPu_m_project_onboard_name').value;
        var dzt =
          document.getElementById('pxPu_m_dezactivation_date') &&
          document.getElementById('pxPu_m_dezactivation_date').value;
        payload.dezactivation_date = dzt && dzt.length ? dzt : null;
        payload.active = !!(document.getElementById('pxPu_m_active') && document.getElementById('pxPu_m_active').checked);
        payload.active_status = !!(
          document.getElementById('pxPu_m_active_status') && document.getElementById('pxPu_m_active_status').checked
        );
        var npm =
          document.getElementById('pxPu_m_new_password') && document.getElementById('pxPu_m_new_password').value;
        if (npm && npm.length) payload.new_password = npm;
      } else if (currentPuKind === 'user') {
        var cidu = parseInt(
          document.getElementById('pxPu_u_company_id') && document.getElementById('pxPu_u_company_id').value,
          10
        );
        if (!Number.isInteger(cidu) || cidu < 1) {
          showPuModalFeedback('Valid company ID is required.', 'error');
          return;
        }
        payload.company_id = cidu;
        var pjid =
          document.getElementById('pxPu_u_project_id') && document.getElementById('pxPu_u_project_id').value;
        if (pjid && String(pjid).trim()) {
          var pn = parseInt(pjid, 10);
          if (!Number.isInteger(pn) || pn < 1) {
            showPuModalFeedback('Invalid project ID.', 'error');
            return;
          }
          payload.project_id = pn;
        } else {
          payload.project_id = null;
        }
        payload.role = document.getElementById('pxPu_u_role') && document.getElementById('pxPu_u_role').value;
        payload.name = document.getElementById('pxPu_u_name') && document.getElementById('pxPu_u_name').value;
        payload.email = document.getElementById('pxPu_u_email') && document.getElementById('pxPu_u_email').value;
        if (!payload.email || !String(payload.email).trim()) {
          showPuModalFeedback('Email is required for users.', 'error');
          return;
        }
        payload.onboarding =
          document.getElementById('pxPu_u_onboarding') && document.getElementById('pxPu_u_onboarding').value;
        payload.onboarded = !!(
          document.getElementById('pxPu_u_onboarded') && document.getElementById('pxPu_u_onboarded').checked
        );
        payload.active = !!(document.getElementById('pxPu_u_active') && document.getElementById('pxPu_u_active').checked);
        payload.active_status = !!(
          document.getElementById('pxPu_u_active_status') && document.getElementById('pxPu_u_active_status').checked
        );
        var npu =
          document.getElementById('pxPu_u_new_password') && document.getElementById('pxPu_u_new_password').value;
        if (npu && npu.length) payload.new_password = npu;
      }

      btnPuSave.disabled = true;
      fetch(
        '/api/platform-admin/platform-users/' +
          encodeURIComponent(currentPuKind) +
          '/' +
          encodeURIComponent(currentPuId),
        {
          method: 'PATCH',
          headers: Object.assign({ 'Content-Type': 'application/json' }, sessionHeaders(session)),
          credentials: 'same-origin',
          body: JSON.stringify(payload),
        }
      )
        .then(function (res) {
          return res.json().then(function (data) {
            return { status: res.status, data: data };
          });
        })
        .then(function (out) {
          btnPuSave.disabled = false;
          if (out.status === 401) {
            clearSession();
            window.location.replace(LOGIN_URL);
            return;
          }
          if (out.status !== 200 || !out.data || !out.data.success) {
            showPuModalFeedback((out.data && out.data.message) || 'Save failed.', 'error');
            return;
          }
          showPuModalFeedback('Saved successfully.', 'success');
          if (out.data.record) fillPuModal(out.data.record);
          loadPlatformUsersPanel(session);
        })
        .catch(function () {
          btnPuSave.disabled = false;
          showPuModalFeedback('Network error.', 'error');
        });
    });
  }

  var btnPuDel = document.getElementById('pxAdminPuDeleteBtn');
  if (btnPuDel) {
    btnPuDel.addEventListener('click', function () {
      if (!currentPuKind || currentPuId == null) return;
      var msg =
        'Delete ' +
        (currentPuKind === 'manager' ? 'manager' : 'user') +
        ' #' +
        currentPuId +
        '? This cannot be undone.';
      if (!window.confirm(msg)) return;
      btnPuDel.disabled = true;
      fetch(
        '/api/platform-admin/platform-users/' +
          encodeURIComponent(currentPuKind) +
          '/' +
          encodeURIComponent(currentPuId),
        {
          method: 'DELETE',
          headers: sessionHeaders(session),
          credentials: 'same-origin',
        }
      )
        .then(function (res) {
          return res.json().then(function (data) {
            return { status: res.status, data: data };
          });
        })
        .then(function (out) {
          btnPuDel.disabled = false;
          if (out.status === 401) {
            clearSession();
            window.location.replace(LOGIN_URL);
            return;
          }
          if (out.status !== 200 || !out.data || !out.data.success) {
            window.alert((out.data && out.data.message) || 'Delete failed.');
            return;
          }
          var m = getPuModal();
          if (m) m.hide();
          currentPuKind = null;
          currentPuId = null;
          loadPlatformUsersPanel(session);
        })
        .catch(function () {
          btnPuDel.disabled = false;
          window.alert('Network error.');
        });
    });
  }

  /* —— Company modal —— */
  var modalEl = document.getElementById('pxAdminCompanyModal');
  var modalLoading = document.getElementById('pxAdminCompanyModalLoading');
  var modalForm = document.getElementById('pxAdminCompanyModalForm');
  var modalFeedback = document.getElementById('pxAdminCompanyModalFeedback');
  var currentCompanyId = null;

  function getModal() {
    if (!modalEl || !window.bootstrap) return null;
    return window.bootstrap.Modal.getOrCreateInstance(modalEl);
  }

  function hideModalFeedback() {
    if (!modalFeedback) return;
    modalFeedback.classList.add('d-none');
    modalFeedback.textContent = '';
  }

  function showModalFeedback(text, kind) {
    if (!modalFeedback) return;
    modalFeedback.textContent = text;
    modalFeedback.className = 'alert ' + (kind === 'success' ? 'alert-success' : 'alert-danger');
    modalFeedback.classList.remove('d-none');
  }

  function setVal(id, v) {
    var el = document.getElementById(id);
    if (el) el.value = v == null || v === '' ? '' : String(v);
  }

  /** manager.active from API (Postgres boolean / JSON). */
  function managerRowIsActive(hm) {
    if (!hm) return false;
    var a = hm.active;
    return a === true || a === 'true' || a === 't' || a === 1;
  }

  function updateHmAccountStatusUI() {
    var chk = document.getElementById('pxHm_active');
    var badge = document.getElementById('pxHm_status_badge');
    var ba = document.getElementById('pxHm_btn_activate');
    var bd = document.getElementById('pxHm_btn_deactivate');
    if (!chk || !badge) return;
    var off = chk.disabled;
    if (ba) ba.disabled = off;
    if (bd) bd.disabled = off;
    if (off) {
      badge.textContent = '—';
      badge.className = 'badge bg-secondary';
      return;
    }
    if (chk.checked) {
      badge.textContent = 'Active';
      badge.className = 'badge bg-success';
    } else {
      badge.textContent = 'Inactive';
      badge.className = 'badge bg-secondary';
    }
  }

  function fillCompanyModal(company, hm, userCount) {
    if (!company) return;
    var count = userCount != null && userCount !== '' ? parseInt(String(userCount), 10) : NaN;
    if (!Number.isInteger(count) || count < 0) count = 0;

    setVal('pxCo_id', company.id);
    setVal('pxCo_name', company.name);
    setVal('pxCo_industry_type', company.industry_type);
    setVal('pxCo_subscription_plan', company.subscription_plan);
    setVal('pxCo_active', company.active);
    setVal('pxCo_created_by', company.created_by);
    setVal('pxCo_office_address', company.office_address);
    setVal('pxCo_security_question1', company.security_question1);
    setVal('pxCo_security_token1', company.security_token1);

    var limRaw = company.user_limit;
    var lim =
      limRaw != null && limRaw !== ''
        ? parseInt(String(limRaw), 10)
        : NaN;
    var limEl = document.getElementById('pxCo_user_limit');
    if (limEl) {
      limEl.value = Number.isInteger(lim) && lim >= 1 ? String(lim) : '';
    }
    var disp = document.getElementById('pxCo_user_count_display');
    if (disp) {
      disp.value =
        Number.isInteger(lim) && lim >= 1 ? String(count) + ' of ' + String(lim) : String(count);
    }
    var warn = document.getElementById('pxCo_user_limit_warning');
    if (warn) {
      var over = Number.isInteger(lim) && lim >= 1 && count > lim;
      warn.classList.toggle('d-none', !over);
    }
    var cat = document.getElementById('pxCo_created_at');
    if (cat) {
      if (company.created_at) {
        try {
          var d0 = new Date(company.created_at);
          cat.value = isNaN(d0.getTime()) ? String(company.created_at) : d0.toLocaleString();
        } catch (e0) {
          cat.value = String(company.created_at);
        }
      } else {
        cat.value = '';
      }
    }

    var hasHm = !!(hm && hm.id);
    var note = document.getElementById('pxHm_missing_note');
    var fields = document.getElementById('pxHm_fields');
    if (note) note.classList.toggle('d-none', hasHm);
    if (fields) {
      fields.querySelectorAll('input').forEach(function (inp) {
        inp.disabled = !hasHm;
      });
    }
    var hid = document.getElementById('pxHm_id');
    if (hid) hid.value = hasHm ? String(hm.id) : '';
    setVal('pxHm_name', hasHm ? hm.name : '');
    setVal('pxHm_surname', hasHm ? hm.surname : '');
    setVal('pxHm_email', hasHm ? hm.email : '');
    var chk = document.getElementById('pxHm_active');
    if (chk) chk.checked = hasHm && managerRowIsActive(hm);
    setVal('pxHm_new_password', '');
    updateHmAccountStatusUI();
  }

  function openCompanyModal(companyId) {
    currentCompanyId = companyId;
    hideModalFeedback();
    if (modalLoading) modalLoading.classList.remove('d-none');
    if (modalForm) modalForm.classList.add('d-none');
    var m = getModal();
    if (m) m.show();

    fetch('/api/platform-admin/companies/' + encodeURIComponent(companyId), {
      method: 'GET',
      headers: sessionHeaders(session),
      credentials: 'same-origin',
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (out) {
        if (modalLoading) modalLoading.classList.add('d-none');
        if (out.status === 401) {
          clearSession();
          window.location.replace(LOGIN_URL);
          return;
        }
        if (out.status !== 200 || !out.data || !out.data.success) {
          showModalFeedback((out.data && out.data.message) || 'Could not load company.', 'error');
          if (modalForm) modalForm.classList.remove('d-none');
          return;
        }
        fillCompanyModal(out.data.company, out.data.head_manager, out.data.user_count);
        if (modalForm) modalForm.classList.remove('d-none');
      })
      .catch(function () {
        if (modalLoading) modalLoading.classList.add('d-none');
        if (modalForm) modalForm.classList.remove('d-none');
        showModalFeedback('Network error.', 'error');
      });
  }

  var tbodyCompanies = document.getElementById('pxAdminCompaniesBody');
  if (tbodyCompanies) {
    tbodyCompanies.addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-company-id]');
      if (!tr) return;
      var cid = tr.getAttribute('data-company-id');
      if (cid) openCompanyModal(cid);
    });
    tbodyCompanies.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var tr = e.target.closest('tr[data-company-id]');
      if (!tr) return;
      e.preventDefault();
      var cid = tr.getAttribute('data-company-id');
      if (cid) openCompanyModal(cid);
    });
  }

  var btnSaveCo = document.getElementById('pxAdminCompanySaveBtn');
  if (btnSaveCo) {
    btnSaveCo.addEventListener('click', function () {
      if (currentCompanyId == null) return;
      hideModalFeedback();
      var limInp = document.getElementById('pxCo_user_limit');
      var limStr = limInp && limInp.value != null ? String(limInp.value).trim() : '';
      var userLimitPayload = null;
      if (limStr === '') {
        userLimitPayload = null;
      } else {
        var ln = parseInt(limStr, 10);
        if (!Number.isInteger(ln) || ln < 1) {
          showModalFeedback('User limit must be a positive integer or empty for no limit.', 'error');
          return;
        }
        userLimitPayload = ln;
      }
      var companyPayload = {
        name: document.getElementById('pxCo_name') && document.getElementById('pxCo_name').value,
        industry_type: document.getElementById('pxCo_industry_type') && document.getElementById('pxCo_industry_type').value,
        subscription_plan: document.getElementById('pxCo_subscription_plan') && document.getElementById('pxCo_subscription_plan').value,
        active: document.getElementById('pxCo_active') && document.getElementById('pxCo_active').value,
        created_by: document.getElementById('pxCo_created_by') && document.getElementById('pxCo_created_by').value,
        office_address: document.getElementById('pxCo_office_address') && document.getElementById('pxCo_office_address').value,
        security_question1: document.getElementById('pxCo_security_question1') && document.getElementById('pxCo_security_question1').value,
        security_token1: document.getElementById('pxCo_security_token1') && document.getElementById('pxCo_security_token1').value,
        user_limit: userLimitPayload,
      };
      var hmIdEl = document.getElementById('pxHm_id');
      var hmPayload = {};
      if (hmIdEl && hmIdEl.value) {
        hmPayload.name = document.getElementById('pxHm_name') && document.getElementById('pxHm_name').value;
        hmPayload.surname = document.getElementById('pxHm_surname') && document.getElementById('pxHm_surname').value;
        hmPayload.email = document.getElementById('pxHm_email') && document.getElementById('pxHm_email').value;
        hmPayload.active = !!(document.getElementById('pxHm_active') && document.getElementById('pxHm_active').checked);
        var np = document.getElementById('pxHm_new_password') && document.getElementById('pxHm_new_password').value;
        if (np && np.length) hmPayload.new_password = np;
      }

      btnSaveCo.disabled = true;
      fetch('/api/platform-admin/companies/' + encodeURIComponent(currentCompanyId), {
        method: 'PATCH',
        headers: Object.assign({ 'Content-Type': 'application/json' }, sessionHeaders(session)),
        credentials: 'same-origin',
        body: JSON.stringify({ company: companyPayload, head_manager: hmPayload }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { status: res.status, data: data };
          });
        })
        .then(function (out) {
          btnSaveCo.disabled = false;
          if (out.status === 401) {
            clearSession();
            window.location.replace(LOGIN_URL);
            return;
          }
          if (out.status !== 200 || !out.data || !out.data.success) {
            showModalFeedback((out.data && out.data.message) || 'Save failed.', 'error');
            return;
          }
          showModalFeedback('Saved successfully.', 'success');
          fillCompanyModal(out.data.company, out.data.head_manager, out.data.user_count);
          loadCompaniesPanel(session);
        })
        .catch(function () {
          btnSaveCo.disabled = false;
          showModalFeedback('Network error.', 'error');
        });
    });
  }

  var btnDelCo = document.getElementById('pxAdminCompanyDeleteBtn');
  if (btnDelCo) {
    btnDelCo.addEventListener('click', function () {
      if (currentCompanyId == null) return;
      var coName = document.getElementById('pxCo_name') && document.getElementById('pxCo_name').value;
      var msg =
        'Delete company #' +
        currentCompanyId +
        (coName ? ' (' + coName + ')' : '') +
        ' and related data? This cannot be undone.';
      if (!window.confirm(msg)) return;
      btnDelCo.disabled = true;
      fetch('/api/platform-admin/companies/' + encodeURIComponent(currentCompanyId), {
        method: 'DELETE',
        headers: sessionHeaders(session),
        credentials: 'same-origin',
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { status: res.status, data: data };
          });
        })
        .then(function (out) {
          btnDelCo.disabled = false;
          if (out.status === 401) {
            clearSession();
            window.location.replace(LOGIN_URL);
            return;
          }
          if (out.status !== 200 || !out.data || !out.data.success) {
            window.alert((out.data && out.data.message) || 'Delete failed.');
            return;
          }
          var m = getModal();
          if (m) m.hide();
          currentCompanyId = null;
          loadCompaniesPanel(session);
        })
        .catch(function () {
          btnDelCo.disabled = false;
          window.alert('Network error.');
        });
    });
  }

  var pxHmActiveEl = document.getElementById('pxHm_active');
  if (pxHmActiveEl) {
    pxHmActiveEl.addEventListener('change', updateHmAccountStatusUI);
  }
  var pxHmBtnAct = document.getElementById('pxHm_btn_activate');
  if (pxHmBtnAct) {
    pxHmBtnAct.addEventListener('click', function () {
      var c = document.getElementById('pxHm_active');
      if (c && !c.disabled) {
        c.checked = true;
        updateHmAccountStatusUI();
      }
    });
  }
  var pxHmBtnDeact = document.getElementById('pxHm_btn_deactivate');
  if (pxHmBtnDeact) {
    pxHmBtnDeact.addEventListener('click', function () {
      var c = document.getElementById('pxHm_active');
      if (c && !c.disabled) {
        c.checked = false;
        updateHmAccountStatusUI();
      }
    });
  }
})();
