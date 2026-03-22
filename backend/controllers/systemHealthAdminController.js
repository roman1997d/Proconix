/**
 * Platform admin: system health, DB stats, feature flags (read-only).
 */

const { pool } = require('../db/pool');
const { getBuckets } = require('../lib/apiMetricsStore');
const { getStartupConsoleBannerLines } = require('../lib/startupConsoleBanner');

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
  const uptimeSeconds = Math.round(process.uptime());

  let dbOk = false;
  let dbLatencyMs = null;
  let dbError = null;
  const dbName = process.env.PGDATABASE || process.env.DB_NAME || 'ProconixDB';
  try {
    const t0 = Date.now();
    await pool.query('SELECT 1');
    dbLatencyMs = Date.now() - t0;
    dbOk = true;
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

  return res.status(200).json({
    success: true,
    uptime_seconds: uptimeSeconds,
    api: { ok: true },
    database: {
      ok: dbOk,
      latency_ms: dbLatencyMs,
    },
    console_banner: {
      lines: consoleBannerLines,
      note:
        'Same lines as the server startup log (HOST/PORT from env). Database status is checked live on each request.',
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
    slow_queries: slowQueries,
    slow_queries_meta: {
      source: slowQueriesSource,
      note: slowQueriesNote,
    },
    feature_flags: collectFeatureFlags(),
  });
}

module.exports = {
  getSystemHealth,
};
