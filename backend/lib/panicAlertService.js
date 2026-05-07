/**
 * Server panic alerts: disk / memory pressure, DB connectivity, HTTP health.
 * Sends email via existing SMTP (sendCallbackRequestEmail.createTransport).
 * State file prevents spam (cooldown per alert key).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const { execSync } = require('child_process');
const { pool } = require('../db/pool');
const { createTransport } = require('./sendCallbackRequestEmail');

const STATE_PATH = path.join(__dirname, '..', 'data', 'panic-alert-state.json');

function loadState() {
  try {
    if (fs.existsSync(STATE_PATH)) {
      const raw = fs.readFileSync(STATE_PATH, 'utf8');
      const j = JSON.parse(raw);
      if (j && typeof j === 'object') return j;
    }
  } catch (e) {
    /* ignore */
  }
  return { lastSent: {}, lastRun: null };
}

function saveState(state) {
  const dir = path.dirname(STATE_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function getAlertRecipients() {
  const raw = (process.env.PROCONIX_PANIC_ALERT_EMAIL || 'rdemian732@gmail.com').trim();
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isPanicAlertsGloballyEnabled() {
  const v = process.env.PROCONIX_PANIC_ALERT_ENABLED;
  if (v === 'false' || v === '0' || v === 'off') return false;
  return true;
}

function getDiskUsagePercentRoot() {
  try {
    const plat = os.platform();
    if (plat === 'linux' || plat === 'darwin') {
      const out = execSync('df -P /', { encoding: 'utf8', timeout: 8000 });
      const lines = out.trim().split('\n');
      const line = lines[1];
      if (!line) return null;
      const parts = line.split(/\s+/);
      const capField = parts[parts.length - 2];
      const m = String(capField).match(/(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    }
  } catch (e) {
    /* ignore */
  }
  return null;
}

function getInternalHealthUrl() {
  const explicit = (process.env.PROCONIX_INTERNAL_HEALTH_URL || '').trim();
  if (explicit) return explicit;
  const port = String(process.env.PORT || '3000').trim();
  return `http://127.0.0.1:${port}/api/health`;
}

function checkHttpHealth() {
  if (process.env.PROCONIX_PANIC_SKIP_HTTP === '1' || process.env.PROCONIX_PANIC_SKIP_HTTP === 'true') {
    return Promise.resolve({
      skipped: true,
      ok: true,
      url: getInternalHealthUrl(),
    });
  }
  const url = getInternalHealthUrl();
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.get(url, { timeout: 10000 }, (res) => {
        let body = '';
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(body);
          } catch (e) {
            resolve({
              ok: false,
              url,
              statusCode: res.statusCode,
              error: 'invalid_json',
              snippet: String(body).slice(0, 200),
            });
            return;
          }
          const alive =
            res.statusCode === 200 &&
            json &&
            json.status === 'ok' &&
            json.connected === true;
          resolve({
            ok: alive,
            url,
            statusCode: res.statusCode,
            body: json,
          });
        });
      });
      req.on('error', (e) => {
        resolve({
          ok: false,
          url,
          networkError: true,
          error: e.message || String(e),
        });
      });
      req.on('timeout', () => {
        req.destroy();
        resolve({
          ok: false,
          url,
          networkError: true,
          error: 'timeout',
        });
      });
    } catch (e) {
      resolve({
        ok: false,
        url,
        error: e.message || String(e),
      });
    }
  });
}

async function collectIssues() {
  const issues = [];
  const diskPct = getDiskUsagePercentRoot();
  const diskTh = parseInt(process.env.PROCONIX_PANIC_DISK_THRESHOLD_PCT || '85', 10);
  if (diskPct != null && !Number.isNaN(diskTh) && diskPct >= diskTh) {
    issues.push({
      key: 'disk_high',
      title: `Root filesystem is ${diskPct}% full (threshold ${diskTh}%)`,
      detail: 'Low disk space can crash PostgreSQL and prevent writes. Free space under / or expand the volume.',
    });
  }

  const total = os.totalmem();
  const free = os.freemem();
  const usedPct = total > 0 ? Math.round(((total - free) / total) * 1000) / 10 : 0;
  const memTh = parseFloat(process.env.PROCONIX_PANIC_MEM_THRESHOLD_PCT || '92');
  if (!Number.isNaN(memTh) && usedPct >= memTh) {
    issues.push({
      key: 'mem_high',
      title: `Host memory pressure: ${usedPct}% used (threshold ${memTh}%)`,
      detail: 'The Linux OOM killer may terminate PostgreSQL or Node. Add RAM, swap, or reduce workload.',
    });
  }

  let poolOk = true;
  let poolErr = '';
  try {
    await pool.query('SELECT 1');
  } catch (e) {
    poolOk = false;
    poolErr = e && e.message ? String(e.message) : String(e);
    issues.push({
      key: 'db_down',
      title: 'PostgreSQL query failed',
      detail: poolErr.slice(0, 800),
    });
  }

  const health = await checkHttpHealth();
  if (health.skipped) {
    /* no http issue */
  } else if (health.networkError) {
    issues.push({
      key: 'http_unreachable',
      title: 'API health endpoint unreachable',
      detail: `${health.url} — ${health.error || 'error'}`,
    });
  } else if (!health.ok) {
    const st = health.statusCode != null ? `HTTP ${health.statusCode}` : 'bad response';
    const conn =
      health.body && typeof health.body.connected === 'boolean'
        ? ` connected=${health.body.connected}`
        : '';
    issues.push({
      key: 'health_bad',
      title: 'API /api/health reports a problem',
      detail: `${st}${conn}`.trim().slice(0, 500),
    });
  }

  return {
    issues,
    metrics: {
      disk_pct: diskPct,
      mem_used_pct: usedPct,
      pool_ok: poolOk,
      health,
    },
  };
}

function shouldSendForKey(key, state, cooldownMs, force) {
  if (force) return true;
  const last = state.lastSent[key];
  if (!last) return true;
  const t = new Date(last).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t > cooldownMs;
}

async function sendPanicEmail(subject, textBody) {
  const transport = createTransport();
  if (!transport) {
    const err = new Error('SMTP_HOST is not set; cannot send panic alert.');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }
  const from = (process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@proconix.uk').trim();
  const recipients = getAlertRecipients();
  if (!recipients.length) {
    const err = new Error('No panic alert recipients configured.');
    err.code = 'NO_RECIPIENTS';
    throw err;
  }
  await transport.sendMail({
    from,
    to: recipients.join(', '),
    subject,
    text: textBody,
  });
}

function getPanicAlertConfig() {
  const state = loadState();
  const transport = createTransport();
  return {
    enabled: isPanicAlertsGloballyEnabled(),
    recipients: getAlertRecipients(),
    disk_threshold_pct: parseInt(process.env.PROCONIX_PANIC_DISK_THRESHOLD_PCT || '85', 10),
    mem_threshold_pct: parseFloat(process.env.PROCONIX_PANIC_MEM_THRESHOLD_PCT || '92'),
    cooldown_minutes: parseInt(process.env.PROCONIX_PANIC_COOLDOWN_MINUTES || '360', 10),
    health_url: getInternalHealthUrl(),
    skip_http: process.env.PROCONIX_PANIC_SKIP_HTTP === '1' || process.env.PROCONIX_PANIC_SKIP_HTTP === 'true',
    smtp_configured: !!transport,
    last_run: state.lastRun || null,
    last_sent: state.lastSent || {},
    state_path: STATE_PATH,
  };
}

/**
 * @param {{ force?: boolean, test?: boolean }} opts
 */
async function runPanicAlertCheck(opts = {}) {
  const force = !!opts.force;
  const test = !!opts.test;
  const cooldownMs =
    parseInt(process.env.PROCONIX_PANIC_COOLDOWN_MINUTES || '360', 10) * 60 * 1000;

  if (!isPanicAlertsGloballyEnabled() && !test) {
    return { skipped: true, reason: 'PROCONIX_PANIC_ALERT_ENABLED=off' };
  }

  const recipients = getAlertRecipients();
  if (!recipients.length && !test) {
    return { skipped: true, reason: 'no_recipients' };
  }

  const { issues, metrics } = await collectIssues();

  if (test) {
    const hostname = os.hostname();
    const lines = [
      'This is a TEST email from the Proconix panic alert monitor.',
      '',
      `Host: ${hostname}`,
      `Time: ${new Date().toISOString()}`,
      '',
      'Current snapshot (not necessarily alerts):',
      `  Disk / (df): ${metrics.disk_pct != null ? `${metrics.disk_pct}%` : 'n/a'}`,
      `  Memory used: ${metrics.mem_used_pct}%`,
      `  DB pool query: ${metrics.pool_ok ? 'OK' : 'FAIL'}`,
      `  HTTP health: ${metrics.health && metrics.health.skipped ? 'skipped' : metrics.health && metrics.health.ok ? 'OK' : 'FAIL'}`,
      '',
      issues.length
        ? `Active issues detected (${issues.length}):\n${issues.map((i) => `  - ${i.title}`).join('\n')}`
        : 'No threshold breaches in this snapshot.',
      '',
      `Cooldown for repeat alerts: ${cooldownMs / 60000} minutes per issue type.`,
    ];
    await sendPanicEmail(`[Proconix] Test panic alert (${hostname})`, lines.join('\n'));
    return { success: true, test: true, metrics, issue_count: issues.length };
  }

  if (!issues.length) {
    const state = loadState();
    state.lastRun = new Date().toISOString();
    saveState(state);
    return { success: true, alerted: false, issue_count: 0, metrics };
  }

  const state = loadState();
  const toSend = issues.filter((i) => shouldSendForKey(i.key, state, cooldownMs, force));

  if (!toSend.length) {
    state.lastRun = new Date().toISOString();
    saveState(state);
    return {
      success: true,
      alerted: false,
      suppressed_by_cooldown: true,
      issue_count: issues.length,
      metrics,
    };
  }

  const hostname = os.hostname();
  const subject = `[Proconix ALERT] ${toSend[0].title} — ${hostname}`;
  const body = [
    'Proconix server panic monitor',
    `Host: ${hostname}`,
    `Time: ${new Date().toISOString()}`,
    '',
    ...toSend.map((i) => `• ${i.title}\n  ${i.detail}`),
    '',
    `Metrics: disk=${metrics.disk_pct != null ? `${metrics.disk_pct}%` : 'n/a'}, mem_used=${metrics.mem_used_pct}%, db_pool=${metrics.pool_ok ? 'ok' : 'fail'}`,
    '',
    `Same alert type will not repeat more often than every ${cooldownMs / 60000} minutes (override with force run from admin).`,
  ].join('\n');

  await sendPanicEmail(subject, body);

  const now = new Date().toISOString();
  toSend.forEach((i) => {
    state.lastSent[i.key] = now;
  });
  state.lastRun = now;
  saveState(state);

  return {
    success: true,
    alerted: true,
    sent_keys: toSend.map((i) => i.key),
    issue_count: issues.length,
    metrics,
  };
}

module.exports = {
  collectIssues,
  runPanicAlertCheck,
  getPanicAlertConfig,
  getInternalHealthUrl,
};
