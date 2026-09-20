/**
 * Fast, non-secret health probes for UptimeRobot and ops.
 * Never returns connection strings, tokens, user data, or directory listings.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { pool } = require('../db/pool');
const { UPLOADS_ROOT } = require('../middleware/resolveCompanyDocsDir');
const { checkMyDrawingsDownload } = require('./myDrawingsHealthProbe');

const CHECK_TIMEOUT_MS = 2500;
const HEALTH_DIR = path.join(UPLOADS_ROOT, '.health');
const MEMORY_LIMIT_MB = parseInt(process.env.PROCONIX_MEMORY_LIMIT_MB || '800', 10);
const DISK_ERROR_PCT = 95;
const DISK_DEGRADED_PCT = 85;
const DISK_ERROR_FREE_MB = 200;

function publicCode(err) {
  if (!err) return 'failed';
  if (err.code) return String(err.code);
  return 'failed';
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const err = new Error('timeout');
      err.code = 'ETIMEDOUT';
      setTimeout(() => reject(err), ms);
    }),
  ]);
}

function bytesToMb(n) {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round((n / (1024 * 1024)) * 10) / 10;
}

async function checkDatabase() {
  const t0 = Date.now();
  try {
    await withTimeout(pool.query('SELECT 1 AS ok'), CHECK_TIMEOUT_MS);
    return { status: 'ok', latency_ms: Date.now() - t0 };
  } catch (err) {
    return { status: 'error', code: publicCode(err), latency_ms: Date.now() - t0 };
  }
}

async function checkStorage() {
  const result = {
    status: 'ok',
    readable: false,
    writable: false,
  };
  try {
    await fsp.mkdir(HEALTH_DIR, { recursive: true });
    await fsp.access(UPLOADS_ROOT, fs.constants.R_OK);
    result.readable = true;
    const probe = path.join(HEALTH_DIR, `probe-${process.pid}-${Date.now()}.tmp`);
    const payload = `proconix-health ${Date.now()}`;
    await withTimeout(fsp.writeFile(probe, payload, { encoding: 'utf8', flag: 'w' }), CHECK_TIMEOUT_MS);
    const readBack = await withTimeout(fsp.readFile(probe, 'utf8'), CHECK_TIMEOUT_MS);
    await fsp.unlink(probe).catch(() => {});
    if (readBack !== payload) {
      result.status = 'error';
      result.code = 'EMISMATCH';
      return result;
    }
    result.writable = true;
    return result;
  } catch (err) {
    result.status = 'error';
    result.code = publicCode(err);
    return result;
  }
}

function checkMemory() {
  const mem = process.memoryUsage();
  const rssMb = bytesToMb(mem.rss);
  const heapMb = bytesToMb(mem.heapUsed);
  const limit = Number.isFinite(MEMORY_LIMIT_MB) && MEMORY_LIMIT_MB > 0 ? MEMORY_LIMIT_MB : 800;
  const pct = limit > 0 && rssMb != null ? Math.round((rssMb / limit) * 1000) / 10 : null;
  let status = 'ok';
  if (pct != null && pct >= 95) status = 'error';
  else if (pct != null && pct >= 85) status = 'degraded';
  return {
    status,
    rss_mb: rssMb,
    heap_used_mb: heapMb,
    limit_mb: limit,
    rss_pct_of_limit: pct,
  };
}

function parseDfKilobytes(stdout) {
  const lines = String(stdout || '').trim().split('\n');
  if (lines.length < 2) return null;
  const parts = lines[lines.length - 1].split(/\s+/);
  if (parts.length < 4) return null;
  const totalKb = parseInt(parts[1], 10);
  const availKb = parseInt(parts[3], 10);
  if (!Number.isFinite(totalKb) || totalKb <= 0) return null;
  const usedPct = Math.round(((totalKb - (Number.isFinite(availKb) ? availKb : 0)) / totalKb) * 1000) / 10;
  return {
    percent_used: usedPct,
    free_mb: Number.isFinite(availKb) ? Math.round(availKb / 1024) : null,
  };
}

function checkDisk() {
  return new Promise((resolve) => {
    const target = UPLOADS_ROOT;
    execFile('df', ['-Pk', target], { timeout: 2000 }, (err, stdout) => {
      if (err) {
        resolve({ status: 'degraded', code: publicCode(err) });
        return;
      }
      const parsed = parseDfKilobytes(stdout);
      if (!parsed) {
        resolve({ status: 'degraded', code: 'EPARSE' });
        return;
      }
      let status = 'ok';
      if (
        parsed.percent_used >= DISK_ERROR_PCT ||
        (parsed.free_mb != null && parsed.free_mb < DISK_ERROR_FREE_MB)
      ) {
        status = 'error';
      } else if (parsed.percent_used >= DISK_DEGRADED_PCT) {
        status = 'degraded';
      }
      resolve({
        status,
        percent_used: parsed.percent_used,
        free_mb: parsed.free_mb,
      });
    });
  });
}

function moduleLoaded(fragment) {
  const keys = Object.keys(require.cache || {});
  const needle = fragment.split(path.sep).join(path.sep);
  return keys.some((k) => k.indexOf(needle) !== -1);
}

function checkApi() {
  const modules = {
    database_pool: typeof pool.query === 'function' ? 'ok' : 'error',
    uploads_root: 'ok',
  };
  try {
    fs.accessSync(UPLOADS_ROOT, fs.constants.R_OK);
  } catch (_) {
    modules.uploads_root = 'error';
  }
  const expected = [
    ['company_routes', 'routes/companyRoutes.js'],
    ['auth_routes', 'routes/authRoutes.js'],
    ['my_drawings_routes', 'routes/myDrawingsRoutes.js'],
  ];
  expected.forEach(([name, file]) => {
    modules[name] = moduleLoaded(file) ? 'ok' : 'degraded';
  });
  const values = Object.keys(modules).map((k) => modules[k]);
  let status = 'ok';
  if (values.indexOf('error') !== -1) status = 'error';
  else if (values.indexOf('degraded') !== -1) status = 'degraded';
  return {
    status,
    uptime_seconds: Math.round(process.uptime()),
    node: true,
    modules,
  };
}

function worstStatus(statuses) {
  if (statuses.indexOf('error') !== -1) return 'error';
  if (statuses.indexOf('degraded') !== -1) return 'degraded';
  return 'ok';
}

async function runAllChecks() {
  const [database, storage, disk, drawings] = await Promise.all([
    checkDatabase(),
    checkStorage(),
    checkDisk(),
    checkMyDrawingsDownload(),
  ]);
  const api = checkApi();
  const memory = checkMemory();
  return { api, database, storage, memory, disk, drawings };
}

function httpStatusFor(overall, criticalError) {
  if (criticalError) return 503;
  if (overall === 'error') return 503;
  return 200;
}

function isCriticalError(checks) {
  return (
    (checks.api && checks.api.status === 'error') ||
    (checks.database && checks.database.status === 'error') ||
    (checks.storage && checks.storage.status === 'error') ||
    (checks.memory && checks.memory.status === 'error') ||
    (checks.disk && checks.disk.status === 'error') ||
    (checks.drawings && checks.drawings.status === 'error')
  );
}

module.exports = {
  HEALTH_DIR,
  checkApi,
  checkDatabase,
  checkStorage,
  checkMemory,
  checkDisk,
  checkMyDrawingsDownload,
  runAllChecks,
  worstStatus,
  httpStatusFor,
  isCriticalError,
};
