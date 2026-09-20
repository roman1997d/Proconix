/**
 * Platform admin: system health, DB stats, feature flags (read-only).
 */

const os = require('os');
const { pool } = require('../db/pool');
const { getProjectDiskUsageCached } = require('../lib/projectDiskUsage');
const {
  runAllChecks,
  worstStatus,
  isCriticalError,
} = require('../lib/healthChecks');

/** For approximate Node CPU % between consecutive GET /system-health calls. */
let _nodeCpuMark = null;

function bytesToMbOneDecimal(bytes) {
  if (bytes == null || !isFinite(bytes)) return null;
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

function computeNodeCpuPercentSinceLastRequest() {
  const cur = process.cpuUsage();
  const t = Date.now();
  if (!_nodeCpuMark) {
    _nodeCpuMark = { user: cur.user, system: cur.system, t };
    return null;
  }
  const du = cur.user - _nodeCpuMark.user;
  const ds = cur.system - _nodeCpuMark.system;
  const wallSec = (t - _nodeCpuMark.t) / 1000;
  _nodeCpuMark = { user: cur.user, system: cur.system, t };
  if (wallSec <= 0.001) return null;
  const cpuSec = (du + ds) / 1e6;
  return Math.round(((cpuSec / wallSec) * 100) * 10) / 10;
}

function buildHostMetrics() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const usedPct = total > 0 ? Math.round((used / total) * 1000) / 10 : null;
  const la = os.loadavg();
  const n = (os.cpus() && os.cpus().length) || 1;
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    cpu_count: n,
    loadavg: [la[0], la[1], la[2]],
    mem_total_mb: bytesToMbOneDecimal(total),
    mem_free_mb: bytesToMbOneDecimal(free),
    mem_used_pct: usedPct,
  };
}

function buildNodeProcessMetrics() {
  const m = process.memoryUsage();
  return {
    rss_mb: bytesToMbOneDecimal(m.rss),
    heap_used_mb: bytesToMbOneDecimal(m.heapUsed),
    heap_total_mb: bytesToMbOneDecimal(m.heapTotal),
    external_mb: bytesToMbOneDecimal(m.external),
    cpu_percent_since_last: computeNodeCpuPercentSinceLastRequest(),
  };
}
const { getBuckets } = require('../lib/apiMetricsStore');
const { getStartupConsoleBannerLines } = require('../lib/startupConsoleBanner');

function publicProbeSlice(probe) {
  if (!probe || typeof probe !== 'object') return { status: 'error' };
  const out = { status: probe.status || 'error' };
  if (probe.http_status != null) out.http_status = probe.http_status;
  if (probe.bytes != null) out.bytes = probe.bytes;
  if (probe.latency_ms != null) out.latency_ms = probe.latency_ms;
  if (probe.pdf != null) out.pdf = !!probe.pdf;
  if (probe.jpeg != null) out.jpeg = !!probe.jpeg;
  if (probe.code) out.code = String(probe.code);
  return out;
}

function buildLiveHealth(checks) {
  if (!checks) {
    return {
      status: 'error',
      http_status: 503,
      checked_at: new Date().toISOString(),
      checks: {
        api: 'error',
        database: 'error',
        storage: 'error',
        drawings: 'error',
        memory: 'error',
        disk: 'error',
      },
      details: {},
      monitors: healthMonitorCatalog(),
    };
  }
  const mix = worstStatus([
    checks.api && checks.api.status,
    checks.database && checks.database.status,
    checks.storage && checks.storage.status,
    checks.drawings && checks.drawings.status,
    checks.memory && checks.memory.status,
    checks.disk && checks.disk.status,
  ]);
  const critical = isCriticalError(checks);
  const drawings = checks.drawings || {};
  return {
    status: mix,
    http_status: critical || mix === 'error' ? 503 : 200,
    checked_at: new Date().toISOString(),
    checks: {
      api: (checks.api && checks.api.status) || 'error',
      database: (checks.database && checks.database.status) || 'error',
      storage: (checks.storage && checks.storage.status) || 'error',
      drawings: drawings.status || 'error',
      memory: (checks.memory && checks.memory.status) || 'error',
      disk: (checks.disk && checks.disk.status) || 'error',
    },
    details: {
      api: {
        status: checks.api && checks.api.status,
        uptime_seconds: checks.api && checks.api.uptime_seconds,
        node: checks.api && checks.api.node,
        modules: (checks.api && checks.api.modules) || {},
      },
      database: {
        status: checks.database && checks.database.status,
        latency_ms: checks.database && checks.database.latency_ms,
        code: checks.database && checks.database.code,
      },
      storage: {
        status: checks.storage && checks.storage.status,
        readable: !!(checks.storage && checks.storage.readable),
        writable: !!(checks.storage && checks.storage.writable),
        code: checks.storage && checks.storage.code,
      },
      drawings: {
        status: drawings.status,
        web: publicProbeSlice(drawings.web),
        mobile: publicProbeSlice(drawings.mobile),
        image: publicProbeSlice(drawings.image),
        image_mobile: publicProbeSlice(drawings.image_mobile),
      },
      memory: {
        status: checks.memory && checks.memory.status,
        rss_mb: checks.memory && checks.memory.rss_mb,
        heap_used_mb: checks.memory && checks.memory.heap_used_mb,
        limit_mb: checks.memory && checks.memory.limit_mb,
        rss_pct_of_limit: checks.memory && checks.memory.rss_pct_of_limit,
      },
      disk: {
        status: checks.disk && checks.disk.status,
        percent_used: checks.disk && checks.disk.percent_used,
        free_mb: checks.disk && checks.disk.free_mb,
        code: checks.disk && checks.disk.code,
      },
    },
    monitors: healthMonitorCatalog(),
  };
}

function healthMonitorCatalog() {
  return [
    {
      name: 'Overall',
      path: '/api/health',
      ok_http: 200,
      fail_http: 503,
      checks: 'API, database, storage, My Drawings downloads, memory, disk',
    },
    {
      name: 'API',
      path: '/api/health/api',
      ok_http: 200,
      fail_http: 503,
      checks: 'Express modules and My Drawings download routes',
    },
    {
      name: 'Storage',
      path: '/api/health/storage',
      ok_http: 200,
      fail_http: 503,
      checks: 'Uploads read/write plus My Drawings file pipeline',
    },
    {
      name: 'My Drawings',
      path: '/api/health/mydrawings',
      ok_http: 200,
      fail_http: 503,
      checks: 'Real PDF and image download through the same APIs users hit',
    },
    {
      name: 'Full',
      path: '/api/health/full',
      ok_http: 200,
      fail_http: 503,
      checks: 'All components in one JSON payload',
    },
  ];
}

function collectFeatureFlags() {
  const out = [];
  const envKeys = Object.keys(process.env).sort();
  envKeys.forEach((k) => {
    if (k.startsWith('FEATURE_') || k.startsWith('PROCONIX_FLAG_')) {
      const raw = process.env[k];
      const val = raw === undefined ? '' : String(raw);
      const enabled = !/^(false|0|off|no|)$/i.test(val.trim());
      out.push({ key: k, value: val, enabled, source: 'env' });
    }
  });
  const jsonRaw = process.env.FEATURE_FLAGS_JSON;
  if (jsonRaw && jsonRaw.trim()) {
    try {
      const j = JSON.parse(jsonRaw);
      if (j && typeof j === 'object' && !Array.isArray(j)) {
        Object.keys(j).forEach((k) => {
          const val = String(j[k]);
          const enabled = j[k] === true || val === 'true' || val === '1';
          out.push({ key: k, value: val, enabled, source: 'FEATURE_FLAGS_JSON' });
        });
      }
    } catch (e) {
      out.push({
        key: 'FEATURE_FLAGS_JSON',
        value: '(invalid JSON)',
        enabled: false,
        source: 'parse_error',
      });
    }
  }
  return out;
}

/**
 * GET /api/platform-admin/system-health
 */
async function getSystemHealth(req, res) {
  const healthPromise = runAllChecks()
    .then((checks) => ({ checks: checks, error: null }))
    .catch((e) => ({
      checks: null,
      error: e && e.message ? String(e.message) : 'health failed',
    }));

  const uptimeSeconds = Math.round(process.uptime());

  let dbOk = false;
  let dbLatencyMs = null;
  let dbError = null;
  let dbLiveName = null;
  let dbSizeBytes = null;
  let dbSizePretty = null;
  const dbName = process.env.PGDATABASE || process.env.DB_NAME || 'ProconixDB';
  try {
    const t0 = Date.now();
    const r = await pool.query(
      `SELECT
        current_database() AS live_name,
        pg_database_size(current_database())::bigint AS size_bytes,
        pg_size_pretty(pg_database_size(current_database())) AS size_pretty`
    );
    dbLatencyMs = Date.now() - t0;
    dbOk = true;
    if (r.rows[0]) {
      if (r.rows[0].live_name != null) dbLiveName = String(r.rows[0].live_name);
      if (r.rows[0].size_bytes != null) dbSizeBytes = Number(r.rows[0].size_bytes);
      if (r.rows[0].size_pretty != null) dbSizePretty = String(r.rows[0].size_pretty);
    }
  } catch (e) {
    dbOk = false;
    dbError = e.message || String(e);
  }

  const consoleBannerLines = getStartupConsoleBannerLines({
    dbOk,
    dbName,
    dbError,
  });

  let poolStats = {
    totalCount: null,
    idleCount: null,
    waitingCount: null,
  };
  try {
    poolStats = {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    };
  } catch (e) {
    /* ignore */
  }

  let pgConnections = { active: null, max: null };
  try {
    const c = await pool.query(
      `SELECT count(*)::int AS n
       FROM pg_stat_activity
       WHERE datname = current_database()`
    );
    pgConnections.active = c.rows[0] && c.rows[0].n != null ? c.rows[0].n : null;
    const m = await pool.query(
      "SELECT setting FROM pg_settings WHERE name = 'max_connections'"
    );
    if (m.rows[0] && m.rows[0].setting != null) {
      pgConnections.max = parseInt(String(m.rows[0].setting), 10);
    }
  } catch (e) {
    pgConnections.error = e.message;
  }

  let slowQueries = [];
  let slowQueriesSource = 'none';
  let slowQueriesNote = '';

  try {
    const ext = await pool.query(
      `SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements' LIMIT 1`
    );
    if (ext.rows.length) {
      try {
        slowQueriesSource = 'pg_stat_statements';
        const sq = await pool.query(
          `SELECT
             LEFT(query, 220) AS query,
             calls::bigint AS calls,
             ROUND(mean_exec_time::numeric, 2) AS mean_ms,
             ROUND(total_exec_time::numeric, 2) AS total_ms
           FROM pg_stat_statements
           WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
           ORDER BY mean_exec_time DESC
           LIMIT 12`
        );
        slowQueries = sq.rows || [];
        slowQueriesNote = 'Top statements by mean execution time (pg_stat_statements).';
      } catch (inner) {
        slowQueriesSource = 'pg_stat_statements_denied';
        slowQueriesNote =
          inner.message ||
          'pg_stat_statements exists but query failed (may need superuser or grant).';
      }
    }
    if (slowQueriesSource === 'none' || slowQueriesSource === 'pg_stat_statements_denied') {
      const wasDenied = slowQueriesSource === 'pg_stat_statements_denied';
      slowQueriesSource = 'pg_stat_activity';
      slowQueriesNote = wasDenied
        ? 'pg_stat_statements unavailable; showing long-running queries from pg_stat_activity (> ~1s).'
        : 'Extension pg_stat_statements is not installed. Showing currently running queries (longer than ~1s).';
      const cur = await pool.query(
        `SELECT
           pid,
           ROUND(EXTRACT(EPOCH FROM (now() - query_start))::numeric, 2) AS running_sec,
           LEFT(query, 220) AS query
         FROM pg_stat_activity
         WHERE datname = current_database()
           AND state = 'active'
           AND query NOT ILIKE '%pg_stat_activity%'
           AND query_start IS NOT NULL
           AND now() - query_start > interval '1 second'
         ORDER BY query_start ASC
         LIMIT 12`
      );
      slowQueries = cur.rows.map((r) => ({
        query: r.query,
        calls: 1,
        mean_ms: r.running_sec != null ? r.running_sec * 1000 : null,
        pid: r.pid,
      }));
    }
  } catch (e) {
    slowQueriesNote = e.message || 'Could not load slow query stats.';
  }

  const metricsBuckets = getBuckets();

  const healthResult = await healthPromise;
  const liveHealth = buildLiveHealth(healthResult.checks);
  if (healthResult.error) liveHealth.error = 'probe_failed';

  return res.status(200).json({
    success: true,
    uptime_seconds: uptimeSeconds,
    live_health: liveHealth,
    api: { ok: !!(liveHealth.checks && liveHealth.checks.api === 'ok') },
    database: {
      ok: dbOk,
      latency_ms: dbLatencyMs,
      name: dbLiveName || dbName,
      size_bytes: dbSizeBytes,
      size_pretty: dbSizePretty,
    },
    console_banner: {
      lines: consoleBannerLines,
      note:
        'Static summary (HOST/PORT, DB ping) refreshed when you load this panel — not a live terminal. Use “Live server output” below for real-time stdout/stderr from this Node process.',
    },
    pool: poolStats,
    pg_connections: pgConnections,
    metrics: {
      buckets: metricsBuckets,
      window_minutes: metricsBuckets.length,
      description:
        'Per-minute aggregates for /api requests only (since process start). Error rate = 5xx and 4xx.',
    },
    queue: {
      depth: 0,
      backend: 'none',
      note: 'No background job queue (Bull/Redis etc.) is configured in this deployment.',
    },
    host: buildHostMetrics(),
    node_process: buildNodeProcessMetrics(),
    host_metrics_note:
      'Host load/RAM are system-wide (like htop summary). Node CPU % is estimated from process CPU time between the last two requests to this panel.',
    project_disk: (function () {
      try {
        return getProjectDiskUsageCached();
      } catch (e) {
        return {
          root_path: null,
          scanned_at: new Date().toISOString(),
          total_bytes: 0,
          total_mb: 0,
          entries: [],
          error: e.message || String(e),
          cache_ttl_seconds: 90,
        };
      }
    })(),
    slow_queries: slowQueries,
    slow_queries_meta: {
      source: slowQueriesSource,
      note: slowQueriesNote,
    },
    feature_flags: collectFeatureFlags(),
  });
}

/**
 * NDJSON stream: first line is { type: 'snapshot', lines: string[] }, then { type: 'line', text } for new output.
 * GET /api/platform-admin/server-log-stream
 */
function getServerLogStream(req, res) {
  const { buffer } = require('../lib/serverProcessLogBuffer');

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const snapshot = { type: 'snapshot', lines: buffer.getAllLines() };
  res.write(`${JSON.stringify(snapshot)}\n`);

  const unsub = buffer.subscribe((line) => {
    if (res.writableEnded || res.destroyed) return;
    try {
      res.write(`${JSON.stringify({ type: 'line', text: line })}\n`);
    } catch (_) {
      unsub();
    }
  });

  const ping = setInterval(() => {
    if (res.writableEnded || res.destroyed) {
      clearInterval(ping);
      return;
    }
    try {
      res.write(`${JSON.stringify({ type: 'ping' })}\n`);
    } catch (_) {
      clearInterval(ping);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(ping);
    unsub();
  });
}

/**
 * POST /api/platform-admin/log-test
 * Writes intentional lines to stdout/stderr so you can verify "Live server output" in System & health.
 */
function postLogTest(req, res) {
  const tag = `[${new Date().toISOString()}] proconix_log_test`;
  console.error(`${tag} — stderr (intentional test)`);
  console.log(`${tag} — stdout (intentional test)`);
  return res.status(200).json({
    success: true,
    message:
      'Logged one line to stderr and one to stdout. Open System & health → Live server output to see [err] / [out] lines.',
  });
}

module.exports = {
  getSystemHealth,
  getServerLogStream,
  postLogTest,
};
