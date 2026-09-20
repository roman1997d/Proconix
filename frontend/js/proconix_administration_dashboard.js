/**
 * Proconix platform administration console – validates session with GET /api/platform-admin/me.
 */
(function () {
  'use strict';

  var SESSION_KEY = 'proconix_platform_admin_session';
  var LOGIN_URL = 'proconix_administration_login.html';
  var pendingLoaderOps = 0;
  var dataSystemUnlocked = false;

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

  function formatStorageBytes(n) {
    var x = Number(n);
    if (!isFinite(x) || x < 0) {
      return '0 B';
    }
    if (x === 0) {
      return '0 B';
    }
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = 0;
    while (x >= 1024 && i < units.length - 1) {
      x /= 1024;
      i++;
    }
    var num = i === 0 ? String(Math.round(x)) : x >= 10 || i === 1 ? x.toFixed(1) : x.toFixed(2);
    return num.replace(/\.0$/, '') + ' ' + units[i];
  }

  function showGlobalLoader(text) {
    var overlay = document.getElementById('pxAdminOverlayLoader');
    var txt = document.getElementById('pxAdminOverlayLoaderText');
    pendingLoaderOps += 1;
    if (txt) txt.textContent = text || 'Processing...';
    if (overlay) overlay.classList.remove('d-none');
  }

  function hideGlobalLoader() {
    pendingLoaderOps = Math.max(0, pendingLoaderOps - 1);
    if (pendingLoaderOps > 0) return;
    var overlay = document.getElementById('pxAdminOverlayLoader');
    if (overlay) overlay.classList.add('d-none');
  }

  function showBottomToast(message, kind) {
    var host = document.getElementById('pxAdminToastHost');
    if (!host || !message) return;
    var el = document.createElement('div');
    var cls = 'px-admin-toast px-admin-toast--info';
    if (kind === 'success') cls = 'px-admin-toast px-admin-toast--success';
    if (kind === 'error') cls = 'px-admin-toast px-admin-toast--error';
    el.className = cls;
    el.textContent = String(message);
    host.appendChild(el);
    window.setTimeout(function () {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }, 4200);
  }

  function verifyDataSystemAccess() {
    return new Promise(function (resolve) {
      if (dataSystemUnlocked) {
        resolve(true);
        return;
      }
      var pass = window.prompt('Data&System access: enter admin password');
      if (!pass) {
        resolve(false);
        return;
      }
      showGlobalLoader('Verifying Data&System access...');
      fetch('/api/platform-admin/verify-password', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, sessionHeaders(session)),
        credentials: 'same-origin',
        body: JSON.stringify({ password: pass }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { status: res.status, data: data };
          }).catch(function () {
            return { status: res.status, data: null };
          });
        })
        .then(function (out) {
          hideGlobalLoader();
          if (out.status === 401) {
            clearSession();
            window.location.replace(LOGIN_URL);
            resolve(false);
            return;
          }
          if (out.status === 200 && out.data && out.data.success) {
            var otp = window.prompt('Enter temporary code sent to info@proconix.uk');
            if (!otp) {
              showBottomToast('OTP is required for Data&System access.', 'error');
              resolve(false);
              return;
            }
            showGlobalLoader('Verifying temporary code...');
            fetch('/api/platform-admin/verify-otp', {
              method: 'POST',
              headers: Object.assign({ 'Content-Type': 'application/json' }, sessionHeaders(session)),
              credentials: 'same-origin',
              body: JSON.stringify({ otp: otp }),
            })
              .then(function (res2) {
                return res2.json().then(function (data2) {
                  return { status: res2.status, data: data2 };
                }).catch(function () {
                  return { status: res2.status, data: null };
                });
              })
              .then(function (out2) {
                hideGlobalLoader();
                if (out2.status === 401) {
                  clearSession();
                  window.location.replace(LOGIN_URL);
                  resolve(false);
                  return;
                }
                if (out2.status === 200 && out2.data && out2.data.success) {
                  dataSystemUnlocked = true;
                  showBottomToast('Data&System access granted.', 'success');
                  resolve(true);
                  return;
                }
                showBottomToast((out2.data && out2.data.message) || 'Invalid OTP code.', 'error');
                resolve(false);
              })
              .catch(function () {
                hideGlobalLoader();
                showBottomToast('Network error while verifying OTP.', 'error');
                resolve(false);
              });
            return;
          }
          showBottomToast((out.data && out.data.message) || 'Invalid password.', 'error');
          resolve(false);
        })
        .catch(function () {
          hideGlobalLoader();
          showBottomToast('Network error while verifying password.', 'error');
          resolve(false);
        });
    });
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
    if (loading) {
      loading.classList.remove('d-none');
      loading.textContent = 'Loading companies and cloud storage…';
    }

    var headers = sessionHeaders(sess);

    Promise.all([
      fetch('/api/platform-admin/companies', {
        method: 'GET',
        headers: headers,
        credentials: 'same-origin',
      }).then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      }),
      fetch('/api/platform-admin/companies/storage-summary', {
        method: 'GET',
        headers: headers,
        credentials: 'same-origin',
      }).then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      }),
    ])
      .then(function (results) {
        if (loading) loading.classList.add('d-none');
        var out = results[0];
        var stOut = results[1];

        if (out.status === 401) {
          clearSession();
          window.location.replace(LOGIN_URL);
          return;
        }
        if (out.status !== 200 || !out.data || !out.data.success) {
          if (alertEl) {
            alertEl.className = 'alert alert-danger mb-3';
            alertEl.textContent =
              (out.data && out.data.message) || 'Could not load companies.';
            alertEl.classList.remove('d-none');
          }
          return;
        }

        var storageById = {};
        if (stOut.status === 200 && stOut.data && stOut.data.success && Array.isArray(stOut.data.companies)) {
          stOut.data.companies.forEach(function (s) {
            if (s && s.company_id != null) {
              storageById[s.company_id] = s;
            }
          });
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
          var tdStorage = document.createElement('td');
          tdStorage.className = 'text-end align-middle';
          var tdUsage = document.createElement('td');
          tdUsage.className = 'text-center align-middle';
          var st = storageById[c.id];
          if (st && typeof st.storage_bytes === 'number') {
            var strong = document.createElement('strong');
            strong.textContent = formatStorageBytes(st.storage_bytes);
            tdStorage.appendChild(strong);
            var sub = document.createElement('div');
            sub.className = 'text-white-50 small';
            var fc = st.file_count != null ? Number(st.file_count) : 0;
            sub.textContent = fc + ' file' + (fc === 1 ? '' : 's');
            tdStorage.appendChild(sub);
            if (st.missing_references > 0) {
              var miss = document.createElement('div');
              miss.className = 'text-warning small';
              miss.textContent =
                String(st.missing_references) + ' DB path' + (st.missing_references === 1 ? '' : 's') + ' missing on disk';
              tdStorage.appendChild(miss);
            }
            var usagePct = Number(st.storage_usage_percent) || 0;
            var roundedPct = usagePct.toFixed(1) + '%';
            var badge = document.createElement('span');
            if (usagePct >= 85) {
              badge.className = 'badge bg-danger';
              badge.textContent = 'High ' + roundedPct;
            } else if (usagePct >= 60) {
              badge.className = 'badge bg-warning text-dark';
              badge.textContent = 'Medium ' + roundedPct;
            } else {
              badge.className = 'badge bg-success';
              badge.textContent = 'Healthy ' + roundedPct;
            }
            tdUsage.appendChild(badge);
            var lim = document.createElement('div');
            lim.className = 'text-white-50 small mt-1';
            lim.textContent =
              formatStorageBytes(st.storage_bytes) +
              ' / ' +
              formatStorageBytes(st.storage_limit_bytes || ((st.storage_limit_mb || 500) * 1024 * 1024));
            tdUsage.appendChild(lim);
          } else {
            tdStorage.textContent = '—';
            tdUsage.textContent = '—';
            if (stOut.status !== 200 || !stOut.data || !stOut.data.success) {
              tdStorage.title = 'Could not load storage summary';
              tdUsage.title = 'Could not load storage summary';
            }
          }
          tr.appendChild(tdStorage);
          tr.appendChild(tdUsage);
          tbody.appendChild(tr);
        });
        if (wrap) wrap.classList.remove('d-none');
        if (stOut.status !== 200 || !stOut.data || !stOut.data.success) {
          if (alertEl && list.length > 0) {
            alertEl.className = 'alert alert-warning mb-3';
            alertEl.textContent =
              (stOut.data && stOut.data.message) ||
              'Companies loaded, but cloud storage could not be computed. Try Refresh.';
            alertEl.classList.remove('d-none');
          }
        }
      })
      .catch(function () {
        if (loading) loading.classList.add('d-none');
        if (alertEl) {
          alertEl.className = 'alert alert-danger mb-3';
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
  /** When true, the 30s system/audit/server-memory poll is not scheduled. */
  var sysPollPaused = false;
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

  function clearSysPollTimer() {
    if (sysPollTimer) {
      clearInterval(sysPollTimer);
      sysPollTimer = null;
    }
  }

  function clearSysPoll() {
    stopServerLogStream();
    clearSysPollTimer();
  }

  function updateSysPollToggleUi() {
    document.querySelectorAll('.px-admin-auto-refresh-toggle').forEach(function (btn) {
      var paused = sysPollPaused;
      btn.setAttribute('aria-pressed', paused ? 'true' : 'false');
      var icon = btn.querySelector('.px-admin-auto-refresh-icon');
      var label = btn.querySelector('.px-admin-auto-refresh-label');
      if (icon) {
        icon.className = 'bi px-admin-auto-refresh-icon ' + (paused ? 'bi-play-fill' : 'bi-pause-fill');
        icon.setAttribute('aria-hidden', 'true');
      }
      if (label) {
        label.textContent = paused ? 'Resume auto' : 'Pause auto';
      }
      btn.title = paused
        ? 'Resume automatic refresh every 30 seconds (System, Audit, Server Memory)'
        : 'Pause automatic refresh; use Refresh to update manually';
    });
  }

  function scheduleSysPoll(sess) {
    clearSysPollTimer();
    if (sysPollPaused) {
      return;
    }
    sysPollTimer = setInterval(function () {
      var sys = document.querySelector('[data-px-admin-panel="system"]');
      var aud = document.querySelector('[data-px-admin-panel="audit"]');
      var mem = document.querySelector('[data-px-admin-panel="server-memory"]');
      var sysVis = sys && !sys.classList.contains('d-none');
      var audVis = aud && !aud.classList.contains('d-none');
      var memVis = mem && !mem.classList.contains('d-none');
      if (sysVis || audVis || memVis) {
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

  function uploadsPublicHrefForAdmin(relPath) {
    var p = String(relPath || '').replace(/^\/+/, '');
    if (!p) return '/uploads/';
    return '/uploads/' + p.split('/').map(function (seg) { return encodeURIComponent(seg); }).join('/');
  }

  var orphanScanLastTotal = 0;
  var orphanScanEverDone = false;

  function renderUploadOrphanTable(sess, payload) {
    var body = document.getElementById('pxAdminOrphanBody');
    var meta = document.getElementById('pxAdminOrphanMeta');
    var purgeBtn = document.getElementById('pxAdminOrphanPurgeAllBtn');
    if (!body) return;
    if (!payload || !payload.success) {
      orphanScanLastTotal = 0;
      orphanScanEverDone = false;
      if (purgeBtn) {
        purgeBtn.disabled = true;
        purgeBtn.classList.add('d-none');
      }
      body.innerHTML =
        '<tr><td colspan="3" class="text-warning">' +
        cellText((payload && payload.message) || 'Scan failed.') +
        '</td></tr>';
      if (meta) meta.textContent = payload && payload.message ? String(payload.message) : '—';
      return;
    }
    orphanScanLastTotal = Number(payload.total_orphans) || 0;
    orphanScanEverDone = true;
    if (purgeBtn) {
      purgeBtn.classList.remove('d-none');
      purgeBtn.disabled = orphanScanLastTotal < 1;
    }
    var files = Array.isArray(payload.orphans) ? payload.orphans : [];
    var shown = files.length;
    var totalOr = orphanScanLastTotal;
    if (meta) {
      var noteSnippet = '';
      if (payload.note) {
        var ns = String(payload.note);
        noteSnippet =
          ns.length > 280 ? ' · ' + ns.slice(0, 280) + '…' : ' · ' + ns;
      }
      meta.textContent =
        'Scanned files: ' +
        String(payload.total_scanned_files != null ? payload.total_scanned_files : '—') +
        ' · DB/index references: ~' +
        String(payload.referenced_unique_paths != null ? payload.referenced_unique_paths : '—') +
        ' · Orphans found: ' +
        String(totalOr) +
        (payload.truncated && totalOr > shown ? ' · showing first ' + String(shown) + ' rows' : '') +
        noteSnippet;
    }
    body.innerHTML = '';
    if (!files.length && totalOr < 1) {
      body.innerHTML = '<tr><td colspan="3" class="text-white-50">No unreferenced files found.</td></tr>';
      return;
    }
    if (!files.length && totalOr > 0) {
      body.innerHTML =
        '<tr><td colspan="3" class="text-warning">Many orphans (> list cap). Use “Delete ALL unreferenced” or raise PLATFORM_UPLOADS_ORPHAN_SCAN_MAX.</td></tr>';
      return;
    }
    files.forEach(function (f) {
      var pathStr = String(f.path || '');
      var disp = cellText(pathStr || '—');
      var href = uploadsPublicHrefForAdmin(pathStr);
      var pathCell =
        pathStr ?
          '<a class="link-info link-underline-opacity-50 text-break" href="' +
          href +
          '" target="_blank" rel="noopener noreferrer">' +
          disp +
          '</a>'
          : disp;
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="font-monospace small">' +
        pathCell +
        '</td><td class="text-end text-nowrap">' +
        cellText(formatStorageBytes(Number(f.size_bytes) || 0)) +
        '</td><td class="text-end">' +
        '<button type="button" class="btn btn-sm btn-outline-danger px-admin-orphan-delete" data-orphan-path="' +
        encodeURIComponent(pathStr) +
        '">Delete</button>' +
        '</td>';
      body.appendChild(tr);
    });
  }

  function runUploadOrphanScan(sessForReq, scanBtn) {
    var body = document.getElementById('pxAdminOrphanBody');
    var meta = document.getElementById('pxAdminOrphanMeta');
    if (scanBtn) scanBtn.disabled = true;
    if (body) body.innerHTML = '<tr><td colspan="3" class="text-white-50">Scanning…</td></tr>';
    if (meta) meta.textContent = 'Scanning uploads vs database snapshot…';
    fetch('/api/platform-admin/uploads-orphans-scan', {
      method: 'GET',
      headers: sessionHeaders(sessForReq),
      credentials: 'same-origin',
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (out) {
        if (scanBtn) scanBtn.disabled = false;
        var ok = out.status === 200 && out.data && out.data.success;
        renderUploadOrphanTable(sessForReq, ok ? out.data : { success: false, message: (out.data && out.data.message) || 'Could not scan.' });
      })
      .catch(function () {
        if (scanBtn) scanBtn.disabled = false;
        renderUploadOrphanTable(sessForReq, { success: false, message: 'Network error while scanning.' });
      });
  }

  function deleteUploadOrphanFile(sessForReq, relPath) {
    if (!relPath) return;
    if (!window.confirm('Delete this unreferenced file from backend/uploads?\n\n' + relPath)) return;
    fetch('/api/platform-admin/uploads-orphans', {
      method: 'DELETE',
      headers: Object.assign({ 'Content-Type': 'application/json' }, sessionHeaders(sessForReq)),
      credentials: 'same-origin',
      body: JSON.stringify({ path: relPath }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (out) {
        if (out.status !== 200 || !out.data || !out.data.success) {
          var errMsg = (out.data && out.data.message) || 'Could not delete file.';
          if (window.pxAdminShowToast) window.pxAdminShowToast(errMsg, 'danger');
          else window.alert(errMsg);
          return;
        }
        runUploadOrphanScan(sessForReq);
        loadSystemHealthPanel(sessForReq);
      })
      .catch(function () {
        if (window.pxAdminShowToast) window.pxAdminShowToast('Network error.', 'danger');
        else window.alert('Network error.');
      });
  }

  function purgeAllUploadOrphans(sessForReq, purgeBtn) {
    if (!orphanScanEverDone) {
      if (
        !window.confirm(
          'You have not completed a successful scan in this session. The server will still delete every file under backend/uploads that is not matched by the heuristic (fresh DB snapshot). Continue?'
        )
      ) {
        return;
      }
    }
    var n = orphanScanLastTotal;
    var msg =
      'This will DELETE every file under backend/uploads that is NOT matched by the orphan scan (fresh DB snapshot).\n\n' +
      'My Drawings PDFs, wall-type images, and logos are excluded.\n\n' +
      'Last scan reported approximately ' +
      String(n) +
      ' orphan file(s). The server will delete all current orphans — not only the rows in the table.\n\n' +
      'Type the phrase DELETE ORPHANS in the next prompt to confirm.';
    if (!window.confirm(msg)) return;
    var typed = window.prompt('Type DELETE ORPHANS to confirm:', '');
    if (String(typed || '').trim() !== 'DELETE ORPHANS') {
      if (window.pxAdminShowToast) window.pxAdminShowToast('Cancelled.', 'secondary');
      return;
    }
    if (purgeBtn) purgeBtn.disabled = true;
    fetch('/api/platform-admin/uploads-orphans/purge-all', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, sessionHeaders(sessForReq)),
      credentials: 'same-origin',
      body: JSON.stringify({ confirm: 'DELETE ORPHANS' }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (out) {
        if (purgeBtn) purgeBtn.disabled = false;
        if (out.status !== 200 || !out.data || !out.data.success) {
          var errMsg = (out.data && out.data.message) || 'Purge failed.';
          if (window.pxAdminShowToast) window.pxAdminShowToast(errMsg, 'danger');
          else window.alert(errMsg);
          return;
        }
        runUploadOrphanScan(sessForReq);
        loadSystemHealthPanel(sessForReq);
        var rm = String(out.data.deleted_files || 0);
        var fail = String(out.data.failed_unlinks || 0);
        var successMsg =
          out.data.message ||
          ('Deleted unreferenced files: ' + rm + (fail !== '0' ? ' · failed: ' + fail : ''));
        if (window.pxAdminShowToast) window.pxAdminShowToast(successMsg, 'success');
        else window.alert(successMsg);
      })
      .catch(function () {
        if (purgeBtn) purgeBtn.disabled = false;
        if (window.pxAdminShowToast) window.pxAdminShowToast('Network error during purge.', 'danger');
        else window.alert('Network error during purge.');
      });
  }

  function healthStatusLabel(status) {
    if (status === 'ok') return 'OK';
    if (status === 'degraded') return 'Degraded';
    if (status === 'error') return 'Error';
    return '—';
  }

  function setHealthPill(el, status) {
    if (!el) return;
    el.textContent = healthStatusLabel(status);
    el.setAttribute('data-status', status || 'unknown');
  }

  function setHealthCard(cardId, status) {
    var card = document.getElementById(cardId);
    if (card) card.setAttribute('data-status', status || 'unknown');
  }

  function formatHealthBytes(n) {
    var b = Number(n || 0);
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function drawingRowHtml(label, route, probe) {
    var p = probe || {};
    var status = p.status || 'error';
    var http = p.http_status != null ? String(p.http_status) : '—';
    var body = '—';
    if (p.pdf) body = 'PDF · ' + formatHealthBytes(p.bytes);
    else if (p.jpeg) body = 'JPEG · ' + formatHealthBytes(p.bytes);
    else if (p.code) body = String(p.code);
    else if (p.bytes != null) body = formatHealthBytes(p.bytes);
    var lat = p.latency_ms != null ? String(p.latency_ms) + ' ms' : '—';
    var tone = status === 'ok' ? 'text-success' : status === 'degraded' ? 'text-warning' : 'text-danger';
    return (
      '<tr>' +
      '<td><span class="px-admin-health-pill px-admin-health-pill-sm" data-status="' +
      cellText(status) +
      '">' +
      cellText(healthStatusLabel(status)) +
      '</span> <span class="ms-1">' +
      cellText(label) +
      '</span></td>' +
      '<td class="font-monospace small">' +
      cellText(route) +
      '</td>' +
      '<td class="' +
      tone +
      '">' +
      cellText(http) +
      '</td>' +
      '<td class="small">' +
      cellText(body) +
      '</td>' +
      '<td class="text-nowrap small text-white-50">' +
      cellText(lat) +
      '</td>' +
      '</tr>'
    );
  }

  function renderLiveHealth(d) {
    var health = d && d.live_health;
    var banner = document.getElementById('pxAdminHealthBanner');
    var title = document.getElementById('pxAdminHealthBannerTitle');
    var sub = document.getElementById('pxAdminHealthBannerSub');
    var pill = document.getElementById('pxAdminHealthBannerPill');
    var checkedEl = document.getElementById('pxAdminHealthCheckedAt');
    var httpHint = document.getElementById('pxAdminHealthHttpHint');
    if (!health) {
      if (banner) banner.setAttribute('data-status', 'degraded');
      if (title) title.textContent = 'Live probes unavailable';
      if (sub) {
        sub.textContent = 'Restart Node after git pull so this panel can run /api/health checks.';
      }
      setHealthPill(pill, 'degraded');
      return;
    }
    var overall = health.status || 'error';
    if (banner) banner.setAttribute('data-status', overall);
    if (title) {
      title.textContent =
        overall === 'ok'
          ? 'All systems operational'
          : overall === 'degraded'
            ? 'Degraded — still serving, with warnings'
            : 'Incident — a critical component is down';
    }
    if (sub) {
      sub.textContent =
        overall === 'ok'
          ? 'API, database, storage, My Drawings downloads, memory and disk all passed.'
          : 'Open the cards below to see which probe failed. Users cannot view drawings if Drawings is Error.';
    }
    setHealthPill(pill, overall);
    if (checkedEl && health.checked_at) {
      var when = new Date(health.checked_at);
      checkedEl.textContent = Number.isNaN(when.getTime())
        ? String(health.checked_at)
        : 'Checked ' + when.toLocaleString();
    }
    if (httpHint) {
      httpHint.textContent =
        'Public /api/health would return HTTP ' + String(health.http_status || (overall === 'error' ? 503 : 200));
    }

    var checks = health.checks || {};
    var details = health.details || {};
    var api = details.api || {};
    var database = details.database || {};
    var storage = details.storage || {};
    var drawings = details.drawings || {};
    var memory = details.memory || {};
    var disk = details.disk || {};

    function fillCard(cardId, pillId, valueId, detailId, status, value, detail) {
      setHealthCard(cardId, status);
      setHealthPill(document.getElementById(pillId), status);
      var v = document.getElementById(valueId);
      var dtl = document.getElementById(detailId);
      if (v) v.textContent = value;
      if (dtl) dtl.textContent = detail;
    }

    var moduleFails = [];
    var mods = api.modules || {};
    Object.keys(mods).forEach(function (k) {
      if (mods[k] && mods[k] !== 'ok') moduleFails.push(k);
    });
    fillCard(
      'pxAdminHealthCardApi',
      'pxAdminHealthApiPill',
      'pxAdminHealthApiValue',
      'pxAdminHealthApiDetail',
      checks.api,
      healthStatusLabel(checks.api),
      moduleFails.length ? 'Modules: ' + moduleFails.join(', ') : 'Express + loaded modules'
    );
    fillCard(
      'pxAdminHealthCardDatabase',
      'pxAdminHealthDbPill',
      'pxAdminHealthDbValue',
      'pxAdminHealthDbDetail',
      checks.database,
      healthStatusLabel(checks.database),
      database.latency_ms != null
        ? 'SELECT 1 · ' + String(database.latency_ms) + ' ms'
        : database.code
          ? String(database.code)
          : 'PostgreSQL'
    );
    fillCard(
      'pxAdminHealthCardStorage',
      'pxAdminHealthStoragePill',
      'pxAdminHealthStorageValue',
      'pxAdminHealthStorageDetail',
      checks.storage,
      healthStatusLabel(checks.storage),
      storage.writable
        ? 'uploads readable and writable'
        : storage.readable
          ? 'readable, write failed'
          : storage.code
            ? String(storage.code)
            : 'uploads probe'
    );
    fillCard(
      'pxAdminHealthCardDrawings',
      'pxAdminHealthDrawingsPill',
      'pxAdminHealthDrawingsValue',
      'pxAdminHealthDrawingsDetail',
      checks.drawings,
      healthStatusLabel(checks.drawings),
      checks.drawings === 'ok'
        ? 'PWA + app PDF and wall-type images'
        : 'Download route failed — users cannot open files'
    );
    var memLine = 'Node RSS';
    if (memory.rss_mb != null && memory.limit_mb != null) {
      memLine = String(memory.rss_mb) + ' / ' + String(memory.limit_mb) + ' MB';
      if (memory.rss_pct_of_limit != null) memLine += ' (' + String(memory.rss_pct_of_limit) + '%)';
    }
    fillCard(
      'pxAdminHealthCardMemory',
      'pxAdminHealthMemoryPill',
      'pxAdminHealthMemoryValue',
      'pxAdminHealthMemoryDetail',
      checks.memory,
      healthStatusLabel(checks.memory),
      memLine
    );
    var diskLine = 'uploads volume';
    if (disk.percent_used != null) {
      diskLine = String(disk.percent_used) + '% used';
      if (disk.free_mb != null) diskLine += ' · ' + String(disk.free_mb) + ' MB free';
    } else if (disk.code) diskLine = String(disk.code);
    fillCard(
      'pxAdminHealthCardDisk',
      'pxAdminHealthDiskPill',
      'pxAdminHealthDiskValue',
      'pxAdminHealthDiskDetail',
      checks.disk,
      healthStatusLabel(checks.disk),
      diskLine
    );

    var dBody = document.getElementById('pxAdminHealthDrawingsBody');
    if (dBody) {
      dBody.innerHTML =
        drawingRowHtml('Web PDF', '/api/my-drawings/drawings/:id/file', drawings.web) +
        drawingRowHtml('Mobile PDF', '/api/drawings/:id/file', drawings.mobile) +
        drawingRowHtml('Web wall-type image', '/api/my-drawings/wall-types/:id/image', drawings.image) +
        drawingRowHtml('Mobile wall-type image', '/api/wall-types/:id/image', drawings.image_mobile);
    }

    var mBody = document.getElementById('pxAdminHealthMonitorsBody');
    if (mBody) {
      mBody.innerHTML = '';
      var monitors = health.monitors || [];
      var origin = window.location.origin || 'https://proconix.uk';
      monitors.forEach(function (mon) {
        var tr = document.createElement('tr');
        var fullUrl = origin + String(mon.path || '');
        tr.innerHTML =
          '<td class="text-nowrap">' +
          cellText(mon.name || '—') +
          '</td>' +
          '<td class="font-monospace small"><a class="link-info" href="' +
          cellText(fullUrl) +
          '" target="_blank" rel="noopener noreferrer">' +
          cellText(fullUrl) +
          '</a></td>' +
          '<td class="text-nowrap small">HTTP ' +
          cellText(mon.ok_http) +
          ' / ' +
          cellText(mon.fail_http) +
          '</td>' +
          '<td class="small text-white-50">' +
          cellText(mon.checks || '') +
          '</td>' +
          '<td class="text-end"><button type="button" class="btn btn-sm btn-outline-info px-admin-health-copy" data-health-url="' +
          encodeURIComponent(fullUrl) +
          '">Copy</button></td>';
        mBody.appendChild(tr);
      });
      if (!mBody.__pxBoundCopy) {
        mBody.__pxBoundCopy = true;
        mBody.addEventListener('click', function (ev) {
          var btn = ev.target.closest('.px-admin-health-copy');
          if (!btn) return;
          var url = decodeURIComponent(btn.getAttribute('data-health-url') || '');
          if (!url) return;
          var done = function () {
            if (window.pxAdminShowToast) window.pxAdminShowToast('Copied ' + url, 'success');
          };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(done).catch(function () {
              window.prompt('Copy this URL', url);
            });
          } else {
            window.prompt('Copy this URL', url);
          }
        });
      }
    }
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

    var memoryProjectTotalBytes = 0;
    var memoryBusinessBytes = 0;
    var MAX_SERVER_MEMORY_BYTES = 9 * 1024 * 1024 * 1024;

    function formatBytesSmart(n) {
      var b = Number(n || 0);
      if (b < 1024) return b + ' B';
      if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
      if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' MB';
      return (b / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }

    function renderMemoryBars() {
      var sysBar = document.getElementById('pxAdminMemorySystemBar');
      var busBar = document.getElementById('pxAdminMemoryBusinessBar');
      var sysText = document.getElementById('pxAdminMemorySystemText');
      var busText = document.getElementById('pxAdminMemoryBusinessText');
      if (!sysBar || !busBar || !sysText || !busText) return;
      var total = Number(memoryProjectTotalBytes || 0);
      var business = Number(memoryBusinessBytes || 0);
      if (business < 0) business = 0;
      var system = total - business;
      if (system < 0) system = 0;
      var denom = total > 0 ? total : (business > 0 ? business : 1);
      var sysPct = Math.max(0, Math.min(100, (system / denom) * 100));
      var busPct = Math.max(0, Math.min(100, (business / denom) * 100));
      sysBar.style.width = sysPct.toFixed(1) + '%';
      busBar.style.width = busPct.toFixed(1) + '%';
      sysText.textContent = formatBytesSmart(system) + ' (' + sysPct.toFixed(1) + '%)';
      busText.textContent = formatBytesSmart(business) + ' (' + busPct.toFixed(1) + '%)';
    }

    function renderMemoryDonut() {
      var canvas = document.getElementById('pxAdminMemoryDonut');
      var txt = document.getElementById('pxAdminMemoryDonutText');
      var pctEl = document.getElementById('pxAdminMemoryDonutPct');
      if (!canvas || !canvas.getContext) return;
      var ctx = canvas.getContext('2d');
      var w = canvas.width;
      var h = canvas.height;
      var cx = w / 2;
      var cy = h / 2;
      var r = Math.min(w, h) / 2 - 12;
      var used = Math.max(0, Number(memoryProjectTotalBytes || 0));
      var pct = Math.max(0, Math.min(100, (used / MAX_SERVER_MEMORY_BYTES) * 100));
      var end = -Math.PI / 2 + (Math.PI * 2 * pct) / 100;

      ctx.clearRect(0, 0, w, h);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
      ctx.lineWidth = 16;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, end);
      ctx.strokeStyle = pct > 85 ? '#ef4444' : '#0ea5e9';
      ctx.lineCap = 'round';
      ctx.lineWidth = 16;
      ctx.stroke();

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '600 20px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pct.toFixed(1) + '%', cx, cy);

      if (txt) txt.textContent = 'Used: ' + formatBytesSmart(used) + ' / 9GB';
      if (pctEl) pctEl.textContent = pct.toFixed(1) + '%';
    }

    function uploadsPublicHref(relPath) {
      var p = String(relPath || '').replace(/^\/+/, '');
      if (!p) return '/uploads/';
      return '/uploads/' + p.split('/').map(function (seg) { return encodeURIComponent(seg); }).join('/');
    }

    function renderUploadsAudit(sessForReq) {
      var body = document.getElementById('pxAdminAuditUploadsBody');
      var meta = document.getElementById('pxAdminAuditUploadsMeta');
      if (!body) return;
      body.innerHTML = '<tr><td colspan="4" class="text-white-50">Loading backend/uploads files…</td></tr>';
      fetch('/api/platform-admin/uploads-files', {
        method: 'GET',
        headers: sessionHeaders(sessForReq),
        credentials: 'same-origin',
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { status: res.status, data: data };
          });
        })
        .then(function (out) {
          body.innerHTML = '';
          if (out.status !== 200 || !out.data || !out.data.success) {
            var trE = document.createElement('tr');
            trE.innerHTML = '<td colspan="4" class="text-warning">Could not load backend/uploads listing.</td>';
            body.appendChild(trE);
            if (meta) meta.textContent = (out.data && out.data.message) || '—';
            return;
          }
          var files = Array.isArray(out.data.files) ? out.data.files : [];
          if (meta) {
            var m = out.data.root_path || 'backend/uploads';
            m += ' · ' + String(out.data.total_files || files.length) + ' file(s)';
            if (out.data.truncated) m += ' · truncated at ' + String(out.data.max_files || files.length);
            meta.textContent = m;
          }
          memoryBusinessBytes = files.reduce(function (sum, f) {
            return sum + (Number(f && f.size_bytes) || 0);
          }, 0);
          renderMemoryBars();
          renderMemoryDonut();
          if (!files.length) {
            var tr0 = document.createElement('tr');
            tr0.innerHTML = '<td colspan="4" class="text-white-50">No files found.</td>';
            body.appendChild(tr0);
            return;
          }
          files.forEach(function (f) {
            var pathStr = String(f.path || '');
            var disp = cellText(pathStr || '—');
            var pathCell =
              pathStr ?
                '<a class="link-info link-underline-opacity-50 link-underline-opacity-50-hover text-break" href="' +
                  uploadsPublicHref(pathStr) +
                  '" target="_blank" rel="noopener noreferrer">' +
                  disp +
                  '</a>'
                : disp;
            var tr = document.createElement('tr');
            tr.innerHTML =
              '<td class="font-monospace small">' +
              pathCell +
              '</td><td class="text-end text-nowrap">' +
              cellText(formatBytesSmart(f.size_bytes)) +
              '</td><td class="small text-white-50">' +
              cellText(f.modified_at ? new Date(f.modified_at).toLocaleString() : '—') +
              '</td><td class="text-end">' +
              '<button type="button" class="btn btn-sm btn-outline-danger px-admin-upload-delete" data-upload-path="' +
              encodeURIComponent(String(f.path || '')) +
              '">Delete</button>' +
              '</td>';
            body.appendChild(tr);
          });
        })
        .catch(function () {
          body.innerHTML = '<tr><td colspan="4" class="text-warning">Network error while loading backend/uploads files.</td></tr>';
          if (meta) meta.textContent = '—';
          memoryBusinessBytes = 0;
          renderMemoryBars();
          renderMemoryDonut();
        });
    }

    function deleteUploadsAuditFile(sessForReq, relPath) {
      if (!relPath) return;
      if (!window.confirm('Delete this file from backend/uploads?\n\n' + relPath)) return;
      fetch('/api/platform-admin/uploads-files', {
        method: 'DELETE',
        headers: Object.assign({ 'Content-Type': 'application/json' }, sessionHeaders(sessForReq)),
        credentials: 'same-origin',
        body: JSON.stringify({ path: relPath }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { status: res.status, data: data };
          });
        })
        .then(function (out) {
          if (out.status !== 200 || !out.data || !out.data.success) {
            var errMsg = (out.data && out.data.message) || 'Could not delete file.';
            if (window.pxAdminShowToast) window.pxAdminShowToast(errMsg, 'danger');
            else window.alert(errMsg);
            return;
          }
          renderUploadsAudit(sessForReq);
        })
        .catch(function () {
          var msg = 'Network error while deleting file.';
          if (window.pxAdminShowToast) window.pxAdminShowToast(msg, 'danger');
          else window.alert(msg);
        });
    }

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
        renderLiveHealth(d);
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
        var dbSz = document.getElementById('pxAdminSysDbSize');
        var srvMemDb = document.getElementById('pxAdminServerMemoryDbSize');
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
        if (dbSz) {
          var dbmeta = (d.database && d.database.name) ? String(d.database.name) : '';
          var szPretty = (d.database && d.database.size_pretty) ? String(d.database.size_pretty) : '';
          if (d.database && d.database.ok && szPretty) {
            dbSz.textContent = szPretty + (dbmeta ? ' · ' + dbmeta : '');
            dbSz.className = 'small text-info mt-1';
          } else if (d.database && d.database.ok && d.database.size_bytes != null) {
            dbSz.textContent = formatStorageBytes(Number(d.database.size_bytes)) + (dbmeta ? ' · ' + dbmeta : '');
            dbSz.className = 'small text-info mt-1';
          } else if (d.database && d.database.ok) {
            dbSz.textContent = 'Size unavailable';
            dbSz.className = 'small text-white-50 mt-1';
          } else {
            dbSz.textContent = 'Database size —';
            dbSz.className = 'small text-white-50 mt-1';
          }
        }
        if (srvMemDb) {
          if (d.database && d.database.ok && d.database.size_pretty) {
            srvMemDb.textContent =
              String(d.database.size_pretty) +
              (d.database.name ? ' (' + String(d.database.name) + ')' : '');
          } else if (d.database && d.database.ok && d.database.size_bytes != null) {
            srvMemDb.textContent =
              formatStorageBytes(Number(d.database.size_bytes)) +
              (d.database.name ? ' (' + String(d.database.name) + ')' : '');
          } else {
            srvMemDb.textContent = d.database && d.database.ok ? '—' : 'DB unreachable';
          }
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
            memoryProjectTotalBytes =
              projDisk.total_bytes != null
                ? Number(projDisk.total_bytes || 0)
                : Math.max(0, tmb) * 1024 * 1024;
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
            memoryProjectTotalBytes = 0;
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
        renderMemoryBars();
        renderMemoryDonut();
        renderUploadsAudit(sess);
        var uploadsBody = document.getElementById('pxAdminAuditUploadsBody');
        if (uploadsBody && !uploadsBody.__pxBoundDelete) {
          uploadsBody.__pxBoundDelete = true;
          uploadsBody.addEventListener('click', function (ev) {
            var btn = ev.target.closest('.px-admin-upload-delete');
            if (!btn) return;
            deleteUploadsAuditFile(sess, decodeURIComponent(btn.getAttribute('data-upload-path') || ''));
          });
        }
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

  var backupCreateBtn = document.getElementById('pxBackupCreateBtn');
  var backupRefreshBtn = document.getElementById('pxBackupRefreshBtn');
  var backupStatusText = document.getElementById('pxBackupStatusText');
  var backupDownloadBtn = document.getElementById('pxBackupDownloadBtn');
  var backupAlert = document.getElementById('pxBackupAlert');
  var backupTableBody = document.getElementById('pxBackupTableBody');
  var backupTableEmpty = document.getElementById('pxBackupTableEmpty');
  var backupObjectUrl = null;

  function resetBackupDownloadUrl() {
    if (backupObjectUrl) {
      try {
        URL.revokeObjectURL(backupObjectUrl);
      } catch (e) {}
      backupObjectUrl = null;
    }
    if (backupDownloadBtn) {
      backupDownloadBtn.classList.add('d-none');
      backupDownloadBtn.removeAttribute('href');
      backupDownloadBtn.removeAttribute('download');
    }
  }

  function setBackupStatus(text) {
    if (backupStatusText) backupStatusText.textContent = text || 'Idle';
  }

  function showBackupAlert(text, kind) {
    if (!backupAlert) return;
    backupAlert.textContent = text || '';
    backupAlert.classList.remove('d-none', 'alert-success', 'alert-danger', 'alert-warning', 'alert-info');
    if (kind === 'success') backupAlert.classList.add('alert-success');
    else if (kind === 'warning') backupAlert.classList.add('alert-warning');
    else if (kind === 'info') backupAlert.classList.add('alert-info');
    else backupAlert.classList.add('alert-danger');
  }

  function hideBackupAlert() {
    if (!backupAlert) return;
    backupAlert.classList.add('d-none');
    backupAlert.textContent = '';
  }

  function formatBackupBytes(n) {
    var x = Number(n || 0);
    if (!isFinite(x) || x <= 0) return '0 B';
    var u = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = 0;
    while (x >= 1024 && i < u.length - 1) { x /= 1024; i += 1; }
    return (i === 0 ? Math.round(x) : x.toFixed(1)).toString().replace(/\.0$/, '') + ' ' + u[i];
  }

  function renderBackupRows(items) {
    if (!backupTableBody) return;
    backupTableBody.innerHTML = '';
    if (!items || !items.length) {
      if (backupTableEmpty) backupTableEmpty.classList.remove('d-none');
      return;
    }
    if (backupTableEmpty) backupTableEmpty.classList.add('d-none');
    items.forEach(function (b) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="font-monospace small">' + escapeHtmlText(b.file_name || '') + '</td>' +
        '<td class="small">' + escapeHtmlText(formatDateTime(b.created_at || '')) + '</td>' +
        '<td class="small">' + escapeHtmlText(formatBackupBytes(b.size_bytes)) + '</td>' +
        '<td class="small">' + escapeHtmlText((b.actor_type || 'admin') + (b.actor_email ? ' · ' + b.actor_email : '')) + '</td>' +
        '<td class="text-end"><button type="button" class="btn btn-sm btn-outline-danger px-backup-delete" data-file="' + escapeHtmlText(b.file_name || '') + '">Delete</button></td>';
      backupTableBody.appendChild(tr);
    });
  }

  function fillRestoreServerSelect(items) {
    var sel = document.getElementById('pxRestoreServerSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select backup from server —</option>';
    (items || []).forEach(function (b) {
      var opt = document.createElement('option');
      opt.value = b.file_name;
      opt.textContent = b.file_name + ' · ' + formatDateTime(b.created_at || '');
      sel.appendChild(opt);
    });
  }

  function refreshBackupList() {
    fetch('/api/platform-admin/backups', {
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
        if (out.status === 401) {
          clearSession();
          window.location.replace(LOGIN_URL);
          return;
        }
        if (out.status !== 200 || !out.data || !out.data.success) {
          renderBackupRows([]);
          fillRestoreServerSelect([]);
          return;
        }
        renderBackupRows(out.data.backups || []);
        fillRestoreServerSelect(out.data.backups || []);
      })
      .catch(function () {
        renderBackupRows([]);
        fillRestoreServerSelect([]);
      });
  }

  if (backupCreateBtn) {
    backupCreateBtn.addEventListener('click', function () {
      hideBackupAlert();
      resetBackupDownloadUrl();
      setBackupStatus('Generating backup (database + files + Site Cloud + My Drawings)… please wait');
      backupCreateBtn.disabled = true;
      showGlobalLoader('Generating backup package (Site Cloud and My Drawings)...');

      fetch('/api/admin/backup', {
        method: 'POST',
        headers: sessionHeaders(session),
        credentials: 'same-origin',
      })
        .then(function (res) {
          var ctype = (res.headers.get('content-type') || '').toLowerCase();
          if (!res.ok) {
            if (ctype.indexOf('application/json') !== -1) {
              return res.json().then(function (data) {
                var msg = (data && data.message) || 'Backup failed.';
                if (data && data.step) msg += ' [step: ' + data.step + ']';
                if (data && data.detail) msg += ' ' + data.detail;
                return { status: res.status, error: msg };
              });
            }
            return { status: res.status, error: 'Backup failed.' };
          }
          return res.blob().then(function (blob) {
            var dispo = res.headers.get('content-disposition') || '';
            var match = dispo.match(/filename="?([^";]+)"?/i);
            var fileName = (match && match[1]) || 'proconix_backup.zip';
            return { status: res.status, blob: blob, fileName: fileName };
          });
        })
        .then(function (out) {
          backupCreateBtn.disabled = false;
          hideGlobalLoader();
          if (!out || out.status == null) {
            setBackupStatus('Failed');
            showBackupAlert('Unexpected response while creating backup.', 'error');
            showBottomToast('Backup failed: unexpected response.', 'error');
            return;
          }
          if (out.status === 401) {
            clearSession();
            window.location.replace(LOGIN_URL);
            return;
          }
          if (out.status === 429) {
            setBackupStatus('Rate limited');
            showBackupAlert(out.error || 'Backup rate limit active. Try again later.', 'warning');
            showBottomToast(out.error || 'Backup is rate limited.', 'error');
            return;
          }
          if (out.status < 200 || out.status >= 300 || !out.blob) {
            setBackupStatus('Failed');
            showBackupAlert(out.error || 'Backup generation failed.', 'error');
            showBottomToast(out.error || 'Backup generation failed.', 'error');
            return;
          }
          backupObjectUrl = URL.createObjectURL(out.blob);
          if (backupDownloadBtn) {
            backupDownloadBtn.href = backupObjectUrl;
            backupDownloadBtn.download = out.fileName || 'proconix_backup.zip';
            backupDownloadBtn.classList.remove('d-none');
          }
          setBackupStatus('Backup ready');
          showBackupAlert('Backup generated successfully (Site Cloud and My Drawings included). Click Download backup.', 'success');
          showBottomToast('Backup generated successfully.', 'success');
          refreshBackupList();
        })
        .catch(function () {
          backupCreateBtn.disabled = false;
          hideGlobalLoader();
          setBackupStatus('Failed');
          showBackupAlert('Network error while creating backup.', 'error');
          showBottomToast('Network error while creating backup.', 'error');
        });
    });
  }
  if (backupRefreshBtn) {
    backupRefreshBtn.addEventListener('click', refreshBackupList);
  }

  if (backupTableBody) {
    backupTableBody.addEventListener('click', function (e) {
      var btn = e.target.closest('.px-backup-delete');
      if (!btn) return;
      var fileName = btn.getAttribute('data-file') || '';
      if (!fileName) return;
      var pass = window.prompt('Enter admin password to delete backup:');
      if (!pass) return;
      btn.disabled = true;
      fetch('/api/platform-admin/backups/' + encodeURIComponent(fileName), {
        method: 'DELETE',
        headers: Object.assign({ 'Content-Type': 'application/json' }, sessionHeaders(session)),
        credentials: 'same-origin',
        body: JSON.stringify({ password: pass }),
      })
        .then(function (res) {
          return res.json().then(function (data) { return { status: res.status, data: data }; });
        })
        .then(function (out) {
          btn.disabled = false;
          if (out.status === 401) {
            clearSession();
            window.location.replace(LOGIN_URL);
            return;
          }
          if (out.status !== 200 || !out.data || !out.data.success) {
            showBackupAlert((out.data && out.data.message) || 'Delete failed.', 'error');
            showBottomToast((out.data && out.data.message) || 'Delete failed.', 'error');
            return;
          }
          showBackupAlert('Backup deleted.', 'success');
          showBottomToast('Backup deleted from server.', 'success');
          refreshBackupList();
        })
        .catch(function () {
          btn.disabled = false;
          showBackupAlert('Network error while deleting backup.', 'error');
          showBottomToast('Network error while deleting backup.', 'error');
        });
    });
  }

  window.addEventListener('beforeunload', function () {
    resetBackupDownloadUrl();
  });

  var restoreBtn = document.getElementById('pxRestoreBtn');
  var restoreServerBtn = document.getElementById('pxRestoreServerBtn');
  var restoreServerSelect = document.getElementById('pxRestoreServerSelect');
  var restoreFileInput = document.getElementById('pxRestoreFile');
  var restoreStatusText = document.getElementById('pxRestoreStatusText');
  var restoreAlert = document.getElementById('pxRestoreAlert');

  function setRestoreStatus(text) {
    if (restoreStatusText) restoreStatusText.textContent = text || 'Idle';
  }

  function hideRestoreAlert() {
    if (!restoreAlert) return;
    restoreAlert.classList.add('d-none');
    restoreAlert.textContent = '';
  }

  function showRestoreAlert(text, kind) {
    if (!restoreAlert) return;
    restoreAlert.textContent = text || '';
    restoreAlert.classList.remove('d-none', 'alert-success', 'alert-danger', 'alert-warning', 'alert-info');
    if (kind === 'success') restoreAlert.classList.add('alert-success');
    else if (kind === 'warning') restoreAlert.classList.add('alert-warning');
    else if (kind === 'info') restoreAlert.classList.add('alert-info');
    else restoreAlert.classList.add('alert-danger');
  }

  if (restoreBtn) {
    restoreBtn.addEventListener('click', function () {
      hideRestoreAlert();
      var f = restoreFileInput && restoreFileInput.files && restoreFileInput.files[0];
      if (!f) {
        showRestoreAlert('Select a .zip backup package first.', 'warning');
        return;
      }
      var ok = window.confirm(
        'Restore will overwrite current database and files. Continue?'
      );
      if (!ok) return;

      setRestoreStatus('Restoring... please wait');
      restoreBtn.disabled = true;
      showGlobalLoader('Restoring uploaded backup...');
      var form = new FormData();
      form.append('backup', f);

      fetch('/api/admin/restore', {
        method: 'POST',
        headers: sessionHeaders(session),
        credentials: 'same-origin',
        body: form,
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { status: res.status, data: data };
          }).catch(function () {
            return { status: res.status, data: null };
          });
        })
        .then(function (out) {
          restoreBtn.disabled = false;
          hideGlobalLoader();
          if (out.status === 401) {
            clearSession();
            window.location.replace(LOGIN_URL);
            return;
          }
          if (out.status === 429) {
            setRestoreStatus('Rate limited');
            showRestoreAlert((out.data && out.data.message) || 'Restore rate limit active. Try again later.', 'warning');
            showBottomToast((out.data && out.data.message) || 'Restore is rate limited.', 'error');
            return;
          }
          if (out.status !== 200 || !out.data || !out.data.success) {
            var errMsg = (out.data && out.data.message) || 'Restore failed.';
            if (out.data && out.data.step) errMsg += ' [step: ' + out.data.step + ']';
            if (out.data && out.data.detail) errMsg += ' ' + out.data.detail;
            setRestoreStatus('Failed');
            showRestoreAlert(errMsg, 'error');
            showBottomToast(errMsg, 'error');
            return;
          }
          setRestoreStatus('Restore completed');
          showRestoreAlert(out.data.message || 'Restore completed successfully.', 'success');
          showBottomToast(out.data.message || 'Restore completed successfully.', 'success');
          if (restoreFileInput) restoreFileInput.value = '';
        })
        .catch(function () {
          restoreBtn.disabled = false;
          hideGlobalLoader();
          setRestoreStatus('Failed');
          showRestoreAlert('Network error while restoring backup.', 'error');
          showBottomToast('Network error while restoring backup.', 'error');
        });
    });
  }

  if (restoreServerBtn) {
    restoreServerBtn.addEventListener('click', function () {
      hideRestoreAlert();
      var filename = restoreServerSelect && restoreServerSelect.value ? restoreServerSelect.value : '';
      if (!filename) {
        showRestoreAlert('Select a server backup first.', 'warning');
        return;
      }
      var ok = window.confirm('Restore selected server backup and overwrite current data?');
      if (!ok) return;
      setRestoreStatus('Restoring selected server backup...');
      restoreServerBtn.disabled = true;
      showGlobalLoader('Restoring selected server backup...');
      fetch('/api/admin/restore-from-server', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, sessionHeaders(session)),
        credentials: 'same-origin',
        body: JSON.stringify({ filename: filename }),
      })
        .then(function (res) {
          return res.json().then(function (data) { return { status: res.status, data: data }; });
        })
        .then(function (out) {
          restoreServerBtn.disabled = false;
          hideGlobalLoader();
          if (out.status === 401) {
            clearSession();
            window.location.replace(LOGIN_URL);
            return;
          }
          if (out.status !== 200 || !out.data || !out.data.success) {
            var msg = (out.data && out.data.message) || 'Restore from server failed.';
            if (out.data && out.data.step) msg += ' [step: ' + out.data.step + ']';
            if (out.data && out.data.detail) msg += ' ' + out.data.detail;
            setRestoreStatus('Failed');
            showRestoreAlert(msg, 'error');
            showBottomToast(msg, 'error');
            return;
          }
          setRestoreStatus('Restore completed');
          showRestoreAlert(out.data.message || 'Restore completed successfully.', 'success');
          showBottomToast(out.data.message || 'Restore completed successfully.', 'success');
        })
        .catch(function () {
          restoreServerBtn.disabled = false;
          hideGlobalLoader();
          setRestoreStatus('Failed');
          showRestoreAlert('Network error while restoring from server.', 'error');
          showBottomToast('Network error while restoring from server.', 'error');
        });
    });
  }

  refreshBackupList();

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

  var mdOutreachForm = document.getElementById('pxMdOutreachForm');
  var mdOutreachBtn = document.getElementById('pxMdOutreachSendBtn');
  var mdOutreachWhen = document.getElementById('pxMdOutreachWhen');
  if (mdOutreachWhen && !mdOutreachWhen.value) {
    var now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    mdOutreachWhen.value = now.toISOString().slice(0, 16);
  }
  if (mdOutreachForm) {
    mdOutreachForm.addEventListener('submit', function (e) {
      e.preventDefault();
      hideContentEmailAlert();
      var toEl = document.getElementById('pxMdOutreachTo');
      var firstEl = document.getElementById('pxMdOutreachFirst');
      var lastEl = document.getElementById('pxMdOutreachLast');
      var tplEl = mdOutreachForm.querySelector('input[name="pxMdOutreachTemplate"]:checked');
      if (!toEl || !mdOutreachWhen) return;
      var whenLocal = mdOutreachWhen.value;
      if (!whenLocal) {
        showContentEmailAlert('Choose a date and time.', 'error');
        return;
      }
      var template = tplEl && tplEl.value === 'familiar' ? 'familiar' : 'problem';
      var firstName = firstEl ? firstEl.value.trim() : '';
      var lastName = lastEl ? lastEl.value.trim() : '';
      if (template === 'familiar' && (!firstName || !lastName)) {
        showContentEmailAlert('Template 2 needs first name and last name.', 'error');
        return;
      }
      var sendAt = new Date(whenLocal).toISOString();
      if (mdOutreachBtn) mdOutreachBtn.disabled = true;
      fetch('/api/platform-admin/send-mydrawings-outreach', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, sessionHeaders(session)),
        credentials: 'same-origin',
        body: JSON.stringify({
          to: toEl.value.trim(),
          sendAt: sendAt,
          template: template,
          firstName: firstName,
          lastName: lastName,
        }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { status: res.status, data: data };
          });
        })
        .then(function (out) {
          if (mdOutreachBtn) mdOutreachBtn.disabled = false;
          if (out.status === 401) {
            clearSession();
            window.location.replace(LOGIN_URL);
            return;
          }
          if (out.status === 200 && out.data && out.data.success) {
            showContentEmailAlert(out.data.message || 'Email sent.', 'success');
            mdOutreachForm.reset();
            var again = new Date();
            again.setMinutes(again.getMinutes() - again.getTimezoneOffset());
            mdOutreachWhen.value = again.toISOString().slice(0, 16);
            var problemRadio = mdOutreachForm.querySelector('input[name="pxMdOutreachTemplate"][value="problem"]');
            if (problemRadio) problemRadio.checked = true;
            loadEmailHistory();
            return;
          }
          showContentEmailAlert((out.data && out.data.message) || 'Send failed.', 'error');
        })
        .catch(function () {
          if (mdOutreachBtn) mdOutreachBtn.disabled = false;
          showContentEmailAlert('Network error.', 'error');
        });
    });
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
            loadEmailHistory();
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

  var emailHistoryFilter = 'all';
  var emailHistorySearchTimer = null;
  var emailHistoryItems = [];
  var contactNoteEmail = '';
  var contactNoteModal = null;
  var contactDeleteEmail = '';
  var contactDeleteModal = null;

  function fmtEmailWhen(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function emailTemplateLabel(item) {
    if (item.template === 'familiar') return '2 · Familiar';
    if (item.template === 'custom') {
      return item.subject ? 'Custom · ' + item.subject : 'Custom';
    }
    return '1 · Problem';
  }

  function makeChip(kind, text) {
    var span = document.createElement('span');
    span.className = 'px-email-chip px-email-chip--' + kind;
    span.textContent = text;
    return span;
  }

  function showEmailHistoryAlert(text, kind) {
    var el = document.getElementById('pxEmailHistoryAlert');
    if (!el) return;
    el.textContent = text || '';
    el.classList.remove('d-none', 'alert-success', 'alert-danger', 'alert-warning');
    if (!text) {
      el.classList.add('d-none');
      return;
    }
    el.classList.add(kind === 'success' ? 'alert-success' : kind === 'error' ? 'alert-danger' : 'alert-warning');
  }

  function renderEmailHistoryStats(counts) {
    var host = document.getElementById('pxEmailHistoryStats');
    if (!host) return;
    host.textContent = '';
    var cards = [
      { key: 'total', label: 'All' },
      { key: 'pending', label: 'Scheduled' },
      { key: 'sent', label: 'Sent' },
      { key: 'awaiting', label: 'Awaiting' },
      { key: 'positive', label: 'Positive' },
      { key: 'negative', label: 'Negative' },
    ];
    cards.forEach(function (card) {
      var box = document.createElement('div');
      box.className = 'px-email-history-stat';
      var strong = document.createElement('strong');
      strong.textContent = counts && counts[card.key] != null ? String(counts[card.key]) : '0';
      var label = document.createElement('span');
      label.textContent = card.label;
      box.appendChild(strong);
      box.appendChild(label);
      host.appendChild(box);
    });
  }

  function renderEmailHistoryRows(items) {
    var body = document.getElementById('pxEmailHistoryBody');
    if (!body) return;
    body.textContent = '';
    if (!items || !items.length) {
      var empty = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 6;
      td.className = 'text-white-50';
      td.textContent = 'No emails in this view yet.';
      empty.appendChild(td);
      body.appendChild(empty);
      return;
    }
    items.forEach(function (item) {
      var tr = document.createElement('tr');

      var contactTd = document.createElement('td');
      if (item.name) {
        var nameEl = document.createElement('div');
        nameEl.className = 'text-white';
        nameEl.textContent = item.name;
        contactTd.appendChild(nameEl);
      }
      var mailEl = document.createElement('div');
      mailEl.className = 'font-monospace small text-white-50';
      mailEl.textContent = item.to || '';
      contactTd.appendChild(mailEl);
      var contactActions = document.createElement('div');
      contactActions.className = 'px-email-contact-actions';
      var notesBtn = document.createElement('button');
      notesBtn.type = 'button';
      notesBtn.className = 'btn btn-outline-light btn-sm';
      notesBtn.textContent = 'Notes';
      notesBtn.addEventListener('click', function () {
        openContactNotes(item);
      });
      var deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-outline-danger btn-sm';
      deleteBtn.setAttribute('aria-label', 'Delete contact');
      deleteBtn.title = 'Delete contact';
      var deleteIcon = document.createElement('i');
      deleteIcon.className = 'bi bi-trash3';
      deleteIcon.setAttribute('aria-hidden', 'true');
      deleteBtn.appendChild(deleteIcon);
      deleteBtn.addEventListener('click', function () {
        openDeleteContact(item);
      });
      contactActions.appendChild(notesBtn);
      contactActions.appendChild(deleteBtn);
      contactTd.appendChild(contactActions);
      if (item.contactNote) {
        var notePreview = document.createElement('span');
        notePreview.className = 'px-email-note';
        notePreview.textContent = item.contactNote.length > 90
          ? item.contactNote.slice(0, 90) + '…'
          : item.contactNote;
        contactTd.appendChild(notePreview);
      }
      tr.appendChild(contactTd);

      var tplTd = document.createElement('td');
      tplTd.textContent = emailTemplateLabel(item);
      tr.appendChild(tplTd);

      var whenTd = document.createElement('td');
      var whenMain = document.createElement('div');
      whenMain.textContent = item.status === 'sent' ? fmtEmailWhen(item.sentAt || item.sendAt) : fmtEmailWhen(item.sendAt);
      whenTd.appendChild(whenMain);
      if (item.status === 'pending') {
        var due = document.createElement('div');
        due.className = 'small text-white-50';
        due.textContent = 'Scheduled';
        whenTd.appendChild(due);
      } else if (item.status === 'sent' && item.sendAt && item.sentAt) {
        var planned = document.createElement('div');
        planned.className = 'small text-white-50';
        planned.textContent = 'Planned ' + fmtEmailWhen(item.sendAt);
        whenTd.appendChild(planned);
      }
      tr.appendChild(whenTd);

      var sendTd = document.createElement('td');
      if (item.status === 'pending') sendTd.appendChild(makeChip('pending', 'Scheduled'));
      else if (item.status === 'sent') sendTd.appendChild(makeChip('sent', 'Sent'));
      else if (item.status === 'failed') sendTd.appendChild(makeChip('failed', 'Failed'));
      else sendTd.appendChild(makeChip('cancelled', 'Cancelled'));
      if (item.error) {
        var errEl = document.createElement('div');
        errEl.className = 'small text-danger mt-1';
        errEl.textContent = item.error;
        sendTd.appendChild(errEl);
      }
      tr.appendChild(sendTd);

      var replyTd = document.createElement('td');
      if (item.replyStatus === 'positive') replyTd.appendChild(makeChip('positive', 'Positive'));
      else if (item.replyStatus === 'negative') replyTd.appendChild(makeChip('negative', 'Negative'));
      else if (item.status === 'sent') replyTd.appendChild(makeChip('awaiting', 'Awaiting reply'));
      else {
        var dash = document.createElement('span');
        dash.className = 'text-white-50';
        dash.textContent = '—';
        replyTd.appendChild(dash);
      }
      tr.appendChild(replyTd);

      var actTd = document.createElement('td');
      actTd.className = 'text-end';
      var wrap = document.createElement('div');
      wrap.className = 'd-inline-flex flex-wrap justify-content-end gap-1';
      var againBtn = document.createElement('button');
      againBtn.type = 'button';
      againBtn.className = 'btn btn-outline-info btn-sm';
      againBtn.textContent = 'Send another email';
      againBtn.addEventListener('click', function () {
        fillAnotherEmail(item);
      });
      wrap.appendChild(againBtn);
      if (item.status === 'sent') {
        var posBtn = document.createElement('button');
        posBtn.type = 'button';
        posBtn.className = 'btn btn-outline-success btn-sm';
        posBtn.textContent = 'Positive';
        posBtn.addEventListener('click', function () {
          patchEmailHistoryRow(item.id, 'positive', item.replyNote);
        });
        var negBtn = document.createElement('button');
        negBtn.type = 'button';
        negBtn.className = 'btn btn-outline-danger btn-sm';
        negBtn.textContent = 'Negative';
        negBtn.addEventListener('click', function () {
          patchEmailHistoryRow(item.id, 'negative', item.replyNote);
        });
        wrap.appendChild(posBtn);
        wrap.appendChild(negBtn);
        if (item.replyStatus !== 'none') {
          var clearBtn = document.createElement('button');
          clearBtn.type = 'button';
          clearBtn.className = 'btn btn-outline-secondary btn-sm';
          clearBtn.textContent = 'Clear';
          clearBtn.addEventListener('click', function () {
            patchEmailHistoryRow(item.id, 'none', '');
          });
          wrap.appendChild(clearBtn);
        }
      } else if (item.status === 'pending') {
        var cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn btn-outline-warning btn-sm';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', function () {
          if (!window.confirm('Cancel this scheduled email?')) return;
          cancelEmailHistoryRow(item.id);
        });
        wrap.appendChild(cancelBtn);
      }
      actTd.appendChild(wrap);
      tr.appendChild(actTd);
      body.appendChild(tr);
    });
  }

  function getContactNoteModal() {
    var el = document.getElementById('pxEmailContactNoteModal');
    if (!el || !window.bootstrap || !window.bootstrap.Modal) return null;
    if (!contactNoteModal) contactNoteModal = window.bootstrap.Modal.getOrCreateInstance(el);
    return contactNoteModal;
  }

  function openContactNotes(item) {
    if (!item || !item.to) return;
    contactNoteEmail = item.to;
    var who = document.getElementById('pxEmailContactNoteWho');
    var text = document.getElementById('pxEmailContactNoteText');
    if (who) who.textContent = (item.name ? item.name + ' · ' : '') + item.to;
    if (text) text.value = item.contactNote || '';
    var modal = getContactNoteModal();
    if (modal) modal.show();
    else if (text) text.focus();
  }

  function saveContactNotes() {
    var text = document.getElementById('pxEmailContactNoteText');
    if (!contactNoteEmail) return;
    fetch('/api/platform-admin/email-history/contact-note', {
      method: 'PATCH',
      headers: Object.assign({ 'Content-Type': 'application/json' }, sessionHeaders(session)),
      credentials: 'same-origin',
      body: JSON.stringify({
        to: contactNoteEmail,
        note: text ? text.value : '',
      }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (out) {
        if (out.status === 401) {
          clearSession();
          window.location.replace(LOGIN_URL);
          return;
        }
        if (out.status !== 200 || !out.data || !out.data.success) {
          showEmailHistoryAlert((out.data && out.data.message) || 'Could not save notes.', 'error');
          return;
        }
        var modal = getContactNoteModal();
        if (modal) modal.hide();
        loadEmailHistory();
      })
      .catch(function () {
        showEmailHistoryAlert('Network error while saving notes.', 'error');
      });
  }

  var contactNoteSave = document.getElementById('pxEmailContactNoteSave');
  if (contactNoteSave) {
    contactNoteSave.addEventListener('click', saveContactNotes);
  }

  function getContactDeleteModal() {
    var el = document.getElementById('pxEmailContactDeleteModal');
    if (!el || !window.bootstrap || !window.bootstrap.Modal) return null;
    if (!contactDeleteModal) contactDeleteModal = window.bootstrap.Modal.getOrCreateInstance(el);
    return contactDeleteModal;
  }

  function openDeleteContact(item) {
    if (!item || !item.to) return;
    contactDeleteEmail = item.to;
    var who = document.getElementById('pxEmailContactDeleteWho');
    if (who) who.textContent = (item.name ? item.name + ' · ' : '') + item.to;
    var modal = getContactDeleteModal();
    if (modal) modal.show();
  }

  function confirmDeleteContact() {
    if (!contactDeleteEmail) return;
    var btn = document.getElementById('pxEmailContactDeleteConfirm');
    if (btn) btn.disabled = true;
    fetch('/api/platform-admin/email-history/contact', {
      method: 'DELETE',
      headers: Object.assign({ 'Content-Type': 'application/json' }, sessionHeaders(session)),
      credentials: 'same-origin',
      body: JSON.stringify({ to: contactDeleteEmail }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (out) {
        if (btn) btn.disabled = false;
        if (out.status === 401) {
          clearSession();
          window.location.replace(LOGIN_URL);
          return;
        }
        if (out.status !== 200 || !out.data || !out.data.success) {
          showEmailHistoryAlert((out.data && out.data.message) || 'Could not delete contact.', 'error');
          return;
        }
        contactDeleteEmail = '';
        var modal = getContactDeleteModal();
        if (modal) modal.hide();
        loadEmailHistory();
      })
      .catch(function () {
        if (btn) btn.disabled = false;
        showEmailHistoryAlert('Network error while deleting contact.', 'error');
      });
  }

  var contactDeleteConfirm = document.getElementById('pxEmailContactDeleteConfirm');
  if (contactDeleteConfirm) {
    contactDeleteConfirm.addEventListener('click', confirmDeleteContact);
  }

  function fillAnotherEmail(item) {
    hideContentEmailAlert();
    if (!item || !item.to) return;
    if (item.template === 'custom') {
      var customTo = document.getElementById('pxContentEmailTo');
      var customSubj = document.getElementById('pxContentEmailSubject');
      var customBody = document.getElementById('pxContentEmailBody');
      if (customTo) customTo.value = item.to;
      if (customSubj) {
        var subject = item.subject || '';
        customSubj.value = subject && !/^re:\s/i.test(subject) ? 'Re: ' + subject : subject;
      }
      var customForm = document.getElementById('pxContentClientEmailForm');
      if (customForm && customForm.scrollIntoView) {
        customForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (customBody) customBody.focus();
      showContentEmailAlert('Form filled for a follow-up. Write the message and send.', 'success');
      return;
    }
    var firstEl = document.getElementById('pxMdOutreachFirst');
    var lastEl = document.getElementById('pxMdOutreachLast');
    var toEl = document.getElementById('pxMdOutreachTo');
    var whenEl = document.getElementById('pxMdOutreachWhen');
    var form = document.getElementById('pxMdOutreachForm');
    if (firstEl) firstEl.value = item.firstName || '';
    if (lastEl) lastEl.value = item.lastName || '';
    if (toEl) toEl.value = item.to;
    var tplValue = item.template === 'familiar' ? 'familiar' : 'problem';
    var radio = form && form.querySelector('input[name="pxMdOutreachTemplate"][value="' + tplValue + '"]');
    if (radio) radio.checked = true;
    if (whenEl) {
      var now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      whenEl.value = now.toISOString().slice(0, 16);
    }
    if (form && form.scrollIntoView) {
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (whenEl) whenEl.focus();
    showContentEmailAlert('Form filled for a follow-up. Check the template and send time, then send.', 'success');
  }

  function emailHistoryQuery() {
    var params = new URLSearchParams();
    if (emailHistoryFilter === 'positive' || emailHistoryFilter === 'negative') {
      params.set('reply', emailHistoryFilter);
    } else if (emailHistoryFilter !== 'all') {
      params.set('status', emailHistoryFilter);
    }
    var searchEl = document.getElementById('pxEmailHistorySearch');
    var q = searchEl ? searchEl.value.trim() : '';
    if (q) params.set('q', q);
    var qs = params.toString();
    return '/api/platform-admin/email-history' + (qs ? '?' + qs : '');
  }

  function loadEmailHistory() {
    var body = document.getElementById('pxEmailHistoryBody');
    if (!body) return;
    fetch(emailHistoryQuery(), {
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
        if (out.status === 401) {
          clearSession();
          window.location.replace(LOGIN_URL);
          return;
        }
        if (out.status !== 200 || !out.data || !out.data.success) {
          showEmailHistoryAlert((out.data && out.data.message) || 'Could not load email history.', 'error');
          return;
        }
        showEmailHistoryAlert('', '');
        emailHistoryItems = out.data.items || [];
        renderEmailHistoryStats(out.data.counts || {});
        renderEmailHistoryRows(emailHistoryItems);
      })
      .catch(function () {
        showEmailHistoryAlert('Network error while loading email history.', 'error');
      });
  }

  function patchEmailHistoryRow(id, replyStatus, replyNote) {
    fetch('/api/platform-admin/email-history/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: Object.assign({ 'Content-Type': 'application/json' }, sessionHeaders(session)),
      credentials: 'same-origin',
      body: JSON.stringify({ replyStatus: replyStatus, replyNote: replyNote == null ? '' : replyNote }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (out) {
        if (out.status === 401) {
          clearSession();
          window.location.replace(LOGIN_URL);
          return;
        }
        if (out.status !== 200 || !out.data || !out.data.success) {
          showEmailHistoryAlert((out.data && out.data.message) || 'Could not update reply.', 'error');
          return;
        }
        loadEmailHistory();
      })
      .catch(function () {
        showEmailHistoryAlert('Network error while updating reply.', 'error');
      });
  }

  function cancelEmailHistoryRow(id) {
    fetch('/api/platform-admin/email-history/' + encodeURIComponent(id) + '/cancel', {
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
        if (out.status === 401) {
          clearSession();
          window.location.replace(LOGIN_URL);
          return;
        }
        if (out.status !== 200 || !out.data || !out.data.success) {
          showEmailHistoryAlert((out.data && out.data.message) || 'Could not cancel email.', 'error');
          return;
        }
        loadEmailHistory();
      })
      .catch(function () {
        showEmailHistoryAlert('Network error while cancelling.', 'error');
      });
  }

  var emailHistoryRefresh = document.getElementById('pxEmailHistoryRefresh');
  if (emailHistoryRefresh) {
    emailHistoryRefresh.addEventListener('click', function () {
      loadEmailHistory();
    });
  }
  document.querySelectorAll('[data-px-hist-filter]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      emailHistoryFilter = btn.getAttribute('data-px-hist-filter') || 'all';
      document.querySelectorAll('[data-px-hist-filter]').forEach(function (other) {
        other.classList.toggle('active', other === btn);
      });
      loadEmailHistory();
    });
  });
  var emailHistorySearch = document.getElementById('pxEmailHistorySearch');
  if (emailHistorySearch) {
    emailHistorySearch.addEventListener('input', function () {
      clearTimeout(emailHistorySearchTimer);
      emailHistorySearchTimer = setTimeout(loadEmailHistory, 250);
    });
  }

  var chatPurgeBtn = document.getElementById('pxSettingsChatPurgeBtn');
  var chatPurgeHours = document.getElementById('pxSettingsChatPurgeHours');
  var chatPurgeMinutes = document.getElementById('pxSettingsChatPurgeMinutes');
  var chatPurgeAlert = document.getElementById('pxSettingsChatPurgeAlert');

  function showChatPurgeAlert(text, kind) {
    if (!chatPurgeAlert) return;
    chatPurgeAlert.textContent = text || '';
    chatPurgeAlert.classList.remove('d-none', 'alert-success', 'alert-danger', 'alert-warning');
    if (kind === 'success') {
      chatPurgeAlert.classList.add('alert-success');
    } else if (kind === 'error') {
      chatPurgeAlert.classList.add('alert-danger');
    } else {
      chatPurgeAlert.classList.add('alert-warning');
    }
  }

  function hideChatPurgeAlert() {
    if (!chatPurgeAlert) return;
    chatPurgeAlert.classList.add('d-none');
    chatPurgeAlert.textContent = '';
  }

  if (chatPurgeBtn && chatPurgeHours && chatPurgeMinutes) {
    chatPurgeBtn.addEventListener('click', function () {
      hideChatPurgeAlert();
      var h = parseInt(chatPurgeHours.value, 10);
      var m = parseInt(chatPurgeMinutes.value, 10);
      if (Number.isNaN(h) || h < 0) h = 0;
      if (Number.isNaN(m) || m < 0) m = 0;
      var total = h * 60 + m;
      if (total < 1) {
        showChatPurgeAlert('Setează cel puțin 1 minut în total (ore + minute).', 'error');
        return;
      }
      var ok = window.confirm(
        'Ștergi permanent toate mesajele de chat mai vechi de ' +
          total +
          ' minute (' +
          h +
          ' h ' +
          m +
          ' min)? Această acțiune nu poate fi anulată.'
      );
      if (!ok) return;
      chatPurgeBtn.disabled = true;
      fetch('/api/platform-admin/site-chat/purge-older-than', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, sessionHeaders(session)),
        credentials: 'same-origin',
        body: JSON.stringify({ hours: h, minutes: m }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { status: res.status, data: data };
          });
        })
        .then(function (out) {
          chatPurgeBtn.disabled = false;
          if (out.status === 401) {
            clearSession();
            window.location.replace(LOGIN_URL);
            return;
          }
          if (out.status === 200 && out.data && out.data.success) {
            showChatPurgeAlert(out.data.message || 'Gata.', 'success');
            return;
          }
          showChatPurgeAlert((out.data && out.data.message) || 'Eșec.', 'error');
        })
        .catch(function () {
          chatPurgeBtn.disabled = false;
          showChatPurgeAlert('Eroare de rețea.', 'error');
        });
    });
  }

  var panicRefreshBtn = document.getElementById('pxSettingsPanicRefreshBtn');
  var panicTestBtn = document.getElementById('pxSettingsPanicTestBtn');
  var panicRunBtn = document.getElementById('pxSettingsPanicRunBtn');
  var panicForceEl = document.getElementById('pxSettingsPanicForce');

  function loadPanicAlertPanel(sess) {
    var summary = document.getElementById('pxSettingsPanicSummary');
    var previewEl = document.getElementById('pxSettingsPanicPreview');
    if (summary) summary.textContent = 'Loading…';
    if (previewEl) previewEl.textContent = '';
    fetch('/api/platform-admin/panic-alert', {
      credentials: 'same-origin',
      headers: sessionHeaders(sess),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (out) {
        if (out.status === 401) {
          clearSession();
          window.location.replace(LOGIN_URL);
          return;
        }
        if (out.status !== 200 || !out.data || !out.data.success) {
          if (summary) summary.textContent = 'Could not load panic alert status.';
          return;
        }
        var cfg = out.data.config || {};
        var prev = out.data.preview || {};
        var lines = [];
        lines.push('Recipients: ' + (cfg.recipients && cfg.recipients.length ? cfg.recipients.join(', ') : '(none)'));
        lines.push('Alerts enabled: ' + (cfg.enabled ? 'yes' : 'no'));
        lines.push('SMTP: ' + (cfg.smtp_configured ? 'configured' : 'NOT SET — emails will fail'));
        lines.push('Disk alert if ≥ ' + cfg.disk_threshold_pct + '% on /');
        lines.push('Memory alert if ≥ ' + cfg.mem_threshold_pct + '% host memory used');
        lines.push('Cooldown: ' + cfg.cooldown_minutes + ' min per alert type');
        lines.push('Health URL: ' + (cfg.health_url || '—') + (cfg.skip_http ? ' (HTTP check skipped)' : ''));
        lines.push('State file: ' + (cfg.state_path || '—'));
        lines.push('Last run: ' + (cfg.last_run || 'never'));
        if (cfg.last_sent && typeof cfg.last_sent === 'object') {
          var ks = Object.keys(cfg.last_sent);
          if (ks.length) {
            lines.push(
              'Last sent per key: ' +
                ks
                  .map(function (k) {
                    return k + '=' + cfg.last_sent[k];
                  })
                  .join('; ')
            );
          }
        }
        if (summary) summary.textContent = lines.join('\n');

        var pvLines = [];
        if (prev.error) {
          pvLines.push('Preview error: ' + prev.error);
        } else if (prev.issues && prev.issues.length) {
          pvLines.push('Current issues (' + prev.issues.length + '):');
          prev.issues.forEach(function (i) {
            pvLines.push('• ' + i.title);
          });
        } else {
          pvLines.push('Current snapshot: no threshold breaches.');
        }
        if (prev.metrics) {
          var m = prev.metrics;
          pvLines.push('');
          pvLines.push(
            'Disk %: ' +
              (m.disk_pct != null ? m.disk_pct : 'n/a') +
              ' | Mem used %: ' +
              (m.mem_used_pct != null ? m.mem_used_pct : 'n/a') +
              ' | DB pool: ' +
              (m.pool_ok ? 'OK' : 'FAIL')
          );
          if (m.health && m.health.skipped) pvLines.push('HTTP health check: skipped (PROCONIX_PANIC_SKIP_HTTP)');
          else if (m.health && m.health.ok === false) pvLines.push('HTTP health check: FAIL');
          else if (m.health) pvLines.push('HTTP health check: OK');
        }
        if (previewEl) previewEl.textContent = pvLines.join('\n');
      })
      .catch(function () {
        if (summary) summary.textContent = 'Network error loading panic alerts.';
      });
  }

  function showPanicSettingsAlert(text, kind) {
    var el = document.getElementById('pxSettingsPanicAlert');
    if (!el) return;
    el.textContent = text || '';
    el.classList.remove('d-none', 'alert-success', 'alert-danger', 'alert-warning');
    if (kind === 'success') el.classList.add('alert-success');
    else if (kind === 'error') el.classList.add('alert-danger');
    else el.classList.add('alert-warning');
  }

  function hidePanicSettingsAlert() {
    var el = document.getElementById('pxSettingsPanicAlert');
    if (!el) return;
    el.classList.add('d-none');
    el.textContent = '';
  }

  if (panicRefreshBtn) {
    panicRefreshBtn.addEventListener('click', function () {
      hidePanicSettingsAlert();
      loadPanicAlertPanel(session);
    });
  }
  if (panicTestBtn) {
    panicTestBtn.addEventListener('click', function () {
      hidePanicSettingsAlert();
      panicTestBtn.disabled = true;
      fetch('/api/platform-admin/panic-alert/test', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, sessionHeaders(session)),
        credentials: 'same-origin',
        body: JSON.stringify({}),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { status: res.status, data: data };
          });
        })
        .then(function (out) {
          panicTestBtn.disabled = false;
          if (out.status === 401) {
            clearSession();
            window.location.replace(LOGIN_URL);
            return;
          }
          if (out.status === 200 && out.data && out.data.success) {
            showPanicSettingsAlert(out.data.message || 'Test email sent.', 'success');
            loadPanicAlertPanel(session);
            return;
          }
          showPanicSettingsAlert((out.data && out.data.message) || 'Test failed.', 'error');
        })
        .catch(function () {
          panicTestBtn.disabled = false;
          showPanicSettingsAlert('Network error.', 'error');
        });
    });
  }
  if (panicRunBtn && panicForceEl) {
    panicRunBtn.addEventListener('click', function () {
      hidePanicSettingsAlert();
      panicRunBtn.disabled = true;
      fetch('/api/platform-admin/panic-alert/run', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, sessionHeaders(session)),
        credentials: 'same-origin',
        body: JSON.stringify({ force: !!panicForceEl.checked }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { status: res.status, data: data };
          });
        })
        .then(function (out) {
          panicRunBtn.disabled = false;
          if (out.status === 401) {
            clearSession();
            window.location.replace(LOGIN_URL);
            return;
          }
          if (out.status === 200 && out.data && out.data.success) {
            showPanicSettingsAlert(out.data.message || 'Done.', out.data.alerted ? 'warning' : 'success');
            loadPanicAlertPanel(session);
            return;
          }
          showPanicSettingsAlert((out.data && out.data.message) || 'Run failed.', 'error');
        })
        .catch(function () {
          panicRunBtn.disabled = false;
          showPanicSettingsAlert('Network error.', 'error');
        });
    });
  }

  var demoForm = document.getElementById('pxDemoCreateForm');
  var demoAlert = document.getElementById('pxDemoCreateAlert');
  var demoSuccess = document.getElementById('pxDemoCreateSuccess');
  var demoBtn = document.getElementById('pxDemoCreateBtn');
  var demoSendWrap = document.getElementById('pxDemoSendEmailWrap');
  var demoSendBtn = document.getElementById('pxDemoSendEmailBtn');
  var demoSendAlert = document.getElementById('pxDemoSendEmailAlert');
  var demoSendOk = document.getElementById('pxDemoSendEmailOk');
  /** Set after successful create-demo; used only to POST send-demo-login-email (password kept in memory until page reload). */
  var lastDemoSendPayload = null;

  function hideDemoSendAlerts() {
    if (demoSendAlert) {
      demoSendAlert.classList.add('d-none');
      demoSendAlert.textContent = '';
    }
    if (demoSendOk) {
      demoSendOk.classList.add('d-none');
      demoSendOk.textContent = '';
    }
  }

  function hideDemoAlerts() {
    lastDemoSendPayload = null;
    if (demoSendWrap) demoSendWrap.classList.add('d-none');
    hideDemoSendAlerts();
    if (demoAlert) {
      demoAlert.classList.add('d-none');
      demoAlert.textContent = '';
    }
    if (demoSuccess) {
      demoSuccess.classList.add('d-none');
      demoSuccess.textContent = '';
    }
  }

  if (demoForm) {
    demoForm.addEventListener('submit', function (e) {
      e.preventDefault();
      hideDemoAlerts();
      var companyEl = document.getElementById('pxDemoCompanyName');
      var nameEl = document.getElementById('pxDemoHeadManagerName');
      var emailEl = document.getElementById('pxDemoHeadEmail');
      var passEl = document.getElementById('pxDemoHeadPassword');
      if (!companyEl || !nameEl || !emailEl || !passEl) return;
      var payload = {
        company_name: companyEl.value.trim(),
        head_manager_name: nameEl.value.trim(),
        email: emailEl.value.trim(),
        password: passEl.value,
      };
      if (demoBtn) demoBtn.disabled = true;
      fetch('/api/platform-admin/create-demo-records', {
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
          if (demoBtn) demoBtn.disabled = false;
          if (out.status === 401) {
            clearSession();
            window.location.replace(LOGIN_URL);
            return;
          }
          if (out.status === 201 && out.data && out.data.success && out.data.demo) {
            var d = out.data.demo;
            var lines = [
              out.data.message || 'Demo tenant created.',
              '',
              'Manager login: ' + (d.head_manager_email || payload.email) + ' (password: the one you entered).',
              'Primary operative: ' + (d.primary_operative_email || '—') + ' (same password).',
            ];
            if (demoSuccess) {
              demoSuccess.textContent = lines.join('\n');
              demoSuccess.classList.remove('d-none');
            }
            lastDemoSendPayload = {
              to: payload.email,
              company_name: payload.company_name,
              head_manager_name: payload.head_manager_name,
              head_manager_email: d.head_manager_email || payload.email,
              primary_operative_email: d.primary_operative_email || '',
              password: payload.password,
            };
            if (demoSendWrap) demoSendWrap.classList.remove('d-none');
            hideDemoSendAlerts();
            demoForm.reset();
            return;
          }
          if (demoAlert) {
            demoAlert.textContent =
              (out.data && out.data.message) || 'Could not create demo records.';
            demoAlert.classList.remove('d-none');
          }
        })
        .catch(function () {
          if (demoBtn) demoBtn.disabled = false;
          if (demoAlert) {
            demoAlert.textContent = 'Network error.';
            demoAlert.classList.remove('d-none');
          }
        });
    });
  }

  if (demoSendBtn) {
    demoSendBtn.addEventListener('click', function () {
      hideDemoSendAlerts();
      if (!lastDemoSendPayload || !lastDemoSendPayload.password) {
        if (demoSendAlert) {
          demoSendAlert.textContent =
            'Create a demo again to send email (password is only kept for the session right after creation).';
          demoSendAlert.classList.remove('d-none');
        }
        return;
      }
      demoSendBtn.disabled = true;
      fetch('/api/platform-admin/send-demo-login-email', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, sessionHeaders(session)),
        credentials: 'same-origin',
        body: JSON.stringify(lastDemoSendPayload),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { status: res.status, data: data };
          });
        })
        .then(function (out) {
          demoSendBtn.disabled = false;
          if (out.status === 401) {
            clearSession();
            window.location.replace(LOGIN_URL);
            return;
          }
          if (out.status === 200 && out.data && out.data.success) {
            if (demoSendOk) {
              demoSendOk.textContent =
                out.data.message || 'Email sent to ' + (lastDemoSendPayload.to || 'client') + '.';
              demoSendOk.classList.remove('d-none');
            }
            return;
          }
          if (demoSendAlert) {
            demoSendAlert.textContent =
              (out.data && out.data.message) || 'Could not send email.';
            demoSendAlert.classList.remove('d-none');
          }
        })
        .catch(function () {
          demoSendBtn.disabled = false;
          if (demoSendAlert) {
            demoSendAlert.textContent = 'Network error.';
            demoSendAlert.classList.remove('d-none');
          }
        });
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
      if (id === 'data-system') {
        verifyDataSystemAccess().then(function (okAccess) {
          if (!okAccess) return;
          clearSysPoll();
          setActiveSection(id);
          showPanel('data-system', titleText);
          refreshBackupList();
          if (offcanvasEl && window.bootstrap) {
            var inst0 = window.bootstrap.Offcanvas.getInstance(offcanvasEl);
            if (inst0) inst0.hide();
          }
        });
        return;
      }
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
      if (id === 'server-memory') {
        loadSystemHealthPanel(session);
        scheduleSysPoll(session);
      }
      if (id === 'content') {
        loadEmailHistory();
      }
      if (id === 'settings') {
        loadPanicAlertPanel(session);
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

  var btnServerMemoryRefresh = document.getElementById('pxAdminServerMemoryRefresh');
  if (btnServerMemoryRefresh) {
    btnServerMemoryRefresh.addEventListener('click', function () {
      loadSystemHealthPanel(session);
    });
  }

  document.querySelectorAll('.px-admin-auto-refresh-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      sysPollPaused = !sysPollPaused;
      if (sysPollPaused) {
        clearSysPollTimer();
      } else {
        scheduleSysPoll(session);
        var sys = document.querySelector('[data-px-admin-panel="system"]');
        var aud = document.querySelector('[data-px-admin-panel="audit"]');
        var mem = document.querySelector('[data-px-admin-panel="server-memory"]');
        var sysVis = sys && !sys.classList.contains('d-none');
        var audVis = aud && !aud.classList.contains('d-none');
        var memVis = mem && !mem.classList.contains('d-none');
        if (sysVis || audVis || memVis) {
          loadSystemHealthPanel(session);
        }
      }
      updateSysPollToggleUi();
    });
  });
  updateSysPollToggleUi();

  var btnServerMemoryPurgeTrash = document.getElementById('pxAdminServerMemoryPurgeTrashBtn');
  if (btnServerMemoryPurgeTrash) {
    btnServerMemoryPurgeTrash.addEventListener('click', function () {
      var ok = window.confirm(
        'Delete ALL files from cloud_trash across all tenants?\n\nThis action cannot be undone.'
      );
      if (!ok) return;
      btnServerMemoryPurgeTrash.disabled = true;
      fetch('/api/platform-admin/uploads-cloud-trash/purge-all', {
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
          btnServerMemoryPurgeTrash.disabled = false;
          if (out.status !== 200 || !out.data || !out.data.success) {
            var errMsg = (out.data && out.data.message) || 'Could not purge cloud_trash.';
            if (window.pxAdminShowToast) window.pxAdminShowToast(errMsg, 'danger');
            else window.alert(errMsg);
            return;
          }
          loadSystemHealthPanel(session);
          var msg =
            'cloud_trash purged. Deleted files: ' +
            String(out.data.deleted_files || 0) +
            ' · Tenants affected: ' +
            String(out.data.affected_tenants || 0);
          if (window.pxAdminShowToast) window.pxAdminShowToast(msg, 'success');
          else window.alert(msg);
        })
        .catch(function () {
          btnServerMemoryPurgeTrash.disabled = false;
          var msg = 'Network error while purging cloud_trash.';
          if (window.pxAdminShowToast) window.pxAdminShowToast(msg, 'danger');
          else window.alert(msg);
        });
    });
  }

  var orphanScanBtnEl = document.getElementById('pxAdminOrphanScanBtn');
  var orphanPurgeBtnEl = document.getElementById('pxAdminOrphanPurgeAllBtn');
  var orphanBodyEl = document.getElementById('pxAdminOrphanBody');
  if (orphanScanBtnEl) {
    orphanScanBtnEl.addEventListener('click', function () {
      runUploadOrphanScan(session, orphanScanBtnEl);
    });
  }
  if (orphanPurgeBtnEl) {
    orphanPurgeBtnEl.addEventListener('click', function () {
      purgeAllUploadOrphans(session, orphanPurgeBtnEl);
    });
  }
  if (orphanBodyEl && !orphanBodyEl.__pxBoundOrphanDel) {
    orphanBodyEl.__pxBoundOrphanDel = true;
    orphanBodyEl.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.px-admin-orphan-delete');
      if (!btn) return;
      deleteUploadOrphanFile(session, decodeURIComponent(btn.getAttribute('data-orphan-path') || ''));
    });
  }

  var cleanupModalEl = document.getElementById('pxAdminCleanupModal');
  var cleanupTargetLabelEl = document.getElementById('pxAdminCleanupTargetLabel');
  var cleanupDaysEl = document.getElementById('pxAdminCleanupDays');
  var cleanupConfirmBtn = document.getElementById('pxAdminCleanupConfirmBtn');
  var cleanupOpenBtns = document.querySelectorAll('.px-admin-cleanup-open');
  var cleanupSelectedTarget = '';
  var cleanupSelectedLabel = '';

  function getCleanupModalInstance() {
    if (!cleanupModalEl || !window.bootstrap) return null;
    return window.bootstrap.Modal.getOrCreateInstance(cleanupModalEl);
  }

  cleanupOpenBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      cleanupSelectedTarget = String(btn.getAttribute('data-cleanup-target') || '');
      cleanupSelectedLabel = String(btn.getAttribute('data-cleanup-label') || cleanupSelectedTarget);
      if (cleanupTargetLabelEl) cleanupTargetLabelEl.textContent = cleanupSelectedLabel || '—';
      if (cleanupDaysEl && !cleanupDaysEl.value) cleanupDaysEl.value = '3';
      var inst = getCleanupModalInstance();
      if (inst) inst.show();
    });
  });

  if (cleanupConfirmBtn) {
    cleanupConfirmBtn.addEventListener('click', function () {
      var days = cleanupDaysEl ? parseInt(String(cleanupDaysEl.value || ''), 10) : NaN;
      if (!cleanupSelectedTarget) {
        window.alert('Select a cleanup target first.');
        return;
      }
      if (!Number.isInteger(days) || days < 0) {
        window.alert('Please enter a valid number of days (0 or more).');
        return;
      }
      cleanupConfirmBtn.disabled = true;
      fetch('/api/platform-admin/uploads-generated/purge-by-age', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, sessionHeaders(session)),
        credentials: 'same-origin',
        body: JSON.stringify({
          target: cleanupSelectedTarget,
          older_than_days: days,
        }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { status: res.status, data: data };
          });
        })
        .then(function (out) {
          cleanupConfirmBtn.disabled = false;
          if (out.status !== 200 || !out.data || !out.data.success) {
            var errMsg = (out.data && out.data.message) || 'Cleanup failed.';
            if (window.pxAdminShowToast) window.pxAdminShowToast(errMsg, 'danger');
            else window.alert(errMsg);
            return;
          }
          var inst = getCleanupModalInstance();
          if (inst) inst.hide();
          var msg = 'Deleted: ' + String(out.data.deleted_count || 0) + ' from ' + cleanupSelectedLabel + '.';
          if (window.pxAdminShowToast) window.pxAdminShowToast(msg, 'success');
          else window.alert(msg);
          loadSystemHealthPanel(session);
        })
        .catch(function () {
          cleanupConfirmBtn.disabled = false;
          var msg = 'Network error while deleting files.';
          if (window.pxAdminShowToast) window.pxAdminShowToast(msg, 'danger');
          else window.alert(msg);
        });
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

  function puKindLabel(kind, longForm) {
    if (kind === 'manager') return longForm ? 'Manager' : 'manager';
    if (kind === 'mydrawings') return longForm ? 'My Drawings' : 'mydrawings';
    return longForm ? 'User' : 'user';
  }

  function puDisplayName(row) {
    if (row.kind === 'manager') {
      return [row.name, row.surname].filter(Boolean).join(' ').trim();
    }
    if (row.kind === 'mydrawings') {
      return [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || row.name || '';
    }
    return row.name || '';
  }

  function puRoleLabel(row) {
    if (row.kind === 'manager') return row.is_head_manager || '—';
    if (row.kind === 'mydrawings') return row.role || 'Worker';
    return row.role || '—';
  }

  function appendPlatformUserRow(tbody, row) {
    var tr = document.createElement('tr');
    tr.className = 'px-admin-pu-row';
    tr.setAttribute('data-pu-kind', String(row.kind || ''));
    tr.setAttribute('data-pu-id', String(row.id));
    tr.setAttribute('role', 'button');
    tr.tabIndex = 0;
    var typeLabel = puKindLabel(row.kind, true);
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

  function fillMdUsersSelect(list) {
    var sel = document.getElementById('pxAdminPuMdUsers');
    if (!sel) return;
    var prev = sel.value;
    var md = (list || []).filter(function (row) {
      return row && row.kind === 'mydrawings';
    });
    md.sort(function (a, b) {
      var na = puDisplayName(a).toLowerCase();
      var nb = puDisplayName(b).toLowerCase();
      if (na !== nb) return na.localeCompare(nb);
      return String(a.email || '').localeCompare(String(b.email || ''));
    });
    sel.innerHTML = '';
    var first = document.createElement('option');
    first.value = '';
    first.textContent = md.length
      ? 'Select a user — ' + md.length + ' registered'
      : 'No My Drawings users yet';
    sel.appendChild(first);
    md.forEach(function (row) {
      var o = document.createElement('option');
      o.value = String(row.id);
      var name = puDisplayName(row) || 'User #' + row.id;
      o.textContent = row.email ? name + ' — ' + row.email : name;
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
      var typeLabel = puKindLabel(row.kind, false);
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
        row.first_name,
        row.last_name,
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
          fillMdUsersSelect([]);
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
        fillMdUsersSelect(platformUsersCache);
        applyPlatformUsersFilters();
      })
      .catch(function () {
        if (loading) loading.classList.add('d-none');
        platformUsersCache = [];
        fillMdUsersSelect([]);
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
      var mdSel = document.getElementById('pxAdminPuMdUsers');
      if (mdSel) mdSel.value = '';
      applyPlatformUsersFilters();
    });
  }

  var puMdUsers = document.getElementById('pxAdminPuMdUsers');
  if (puMdUsers) {
    puMdUsers.addEventListener('change', function () {
      var id = puMdUsers.value;
      if (!id) return;
      if (puFilterType) puFilterType.value = 'mydrawings';
      applyPlatformUsersFilters();
      openPuModal('mydrawings', id);
    });
  }

  var puModalEl = document.getElementById('pxAdminPuModal');
  var puModalLoading = document.getElementById('pxAdminPuModalLoading');
  var puModalForm = document.getElementById('pxAdminPuModalForm');
  var puModalFeedback = document.getElementById('pxAdminPuModalFeedback');
  var puBlockM = document.getElementById('pxPu_block_manager');
  var puBlockU = document.getElementById('pxPu_block_user');
  var puBlockMd = document.getElementById('pxPu_block_mydrawings');

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
    if (puBlockMd) puBlockMd.classList.add('d-none');
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
    } else if (record.kind === 'mydrawings' && puBlockMd) {
      puBlockMd.classList.remove('d-none');
      setVal('pxPu_md_id', record.id);
      setVal('pxPu_md_first_name', record.first_name);
      setVal('pxPu_md_last_name', record.last_name);
      setVal('pxPu_md_email', record.email);
      setVal('pxPu_md_workspace', record.company_name);
      setVal('pxPu_md_devices', record.device_count != null ? String(record.device_count) : '0');
      setCreatedAtInput('pxPu_md_created_at', record.created_at);
      setCreatedAtInput('pxPu_md_verified_at', record.verified_at);
      setCreatedAtInput('pxPu_md_last_seen', record.last_seen_at);
    }
    var title = document.getElementById('pxAdminPuModalLabel');
    if (title) {
      title.textContent = puKindLabel(record.kind, true) + ' · ID ' + String(record.id);
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
      } else if (currentPuKind === 'mydrawings') {
        payload.first_name =
          document.getElementById('pxPu_md_first_name') && document.getElementById('pxPu_md_first_name').value;
        payload.last_name =
          document.getElementById('pxPu_md_last_name') && document.getElementById('pxPu_md_last_name').value;
        payload.email = document.getElementById('pxPu_md_email') && document.getElementById('pxPu_md_email').value;
        if (!payload.first_name || !String(payload.first_name).trim() || !payload.last_name || !String(payload.last_name).trim()) {
          showPuModalFeedback('First name and last name are required.', 'error');
          return;
        }
        if (!payload.email || !String(payload.email).trim()) {
          showPuModalFeedback('Email is required.', 'error');
          return;
        }
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
        puKindLabel(currentPuKind, false) +
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
    var cloudLimEl = document.getElementById('pxCo_cloud_storage_limit_mb');
    if (cloudLimEl) {
      var cloudLimRaw = company.cloud_storage_limit_mb;
      var cloudLim = parseInt(String(cloudLimRaw == null ? '' : cloudLimRaw), 10);
      cloudLimEl.value = Number.isInteger(cloudLim) && cloudLim >= 1 ? String(cloudLim) : '500';
    }

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
      var cloudLimInp = document.getElementById('pxCo_cloud_storage_limit_mb');
      var cloudLimStr = cloudLimInp && cloudLimInp.value != null ? String(cloudLimInp.value).trim() : '';
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
      var cloudStorageLimitPayload = parseInt(cloudLimStr || '500', 10);
      if (!Number.isInteger(cloudStorageLimitPayload) || cloudStorageLimitPayload < 1) {
        showModalFeedback('Cloud storage limit must be a positive integer (MB).', 'error');
        return;
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
        cloud_storage_limit_mb: cloudStorageLimitPayload,
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
