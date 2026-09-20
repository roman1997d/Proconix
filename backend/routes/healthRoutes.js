/**
 * Public health endpoints for UptimeRobot (no auth, no secrets).
 */

const express = require('express');
const {
  checkApi,
  checkDatabase,
  checkStorage,
  checkMemory,
  checkDisk,
  runAllChecks,
  worstStatus,
  isCriticalError,
} = require('../lib/healthChecks');

const router = express.Router();

function send(res, overall, body, criticalError) {
  const code = criticalError || overall === 'error' ? 503 : 200;
  return res.status(code).json(body);
}

router.get('/', async (req, res) => {
  try {
    const [database, storage, disk] = await Promise.all([
      checkDatabase(),
      checkStorage(),
      checkDisk(),
    ]);
    const memory = checkMemory();
    const critical = database.status === 'error' || storage.status === 'error';
    const status = critical ? 'error' : 'ok';
    return send(res, status, {
      status,
      connected: database.status === 'ok',
      database: { status: database.status, latency_ms: database.latency_ms },
      storage: { status: storage.status },
      memory: { status: memory.status, rss_mb: memory.rss_mb },
      disk: { status: disk.status, percent_used: disk.percent_used, free_mb: disk.free_mb },
    }, critical);
  } catch (_) {
    return res.status(503).json({
      status: 'error',
      connected: false,
      database: { status: 'error' },
      storage: { status: 'error' },
      memory: { status: 'error' },
      disk: { status: 'error' },
    });
  }
});

router.get('/api', (req, res) => {
  const api = checkApi();
  const overall = api.status === 'error' ? 'error' : 'ok';
  return send(res, overall, {
    status: overall,
    api: { status: api.status },
    uptime_seconds: api.uptime_seconds,
    modules: api.modules,
  }, api.status === 'error');
});

router.get('/storage', async (req, res) => {
  const storage = await checkStorage();
  const overall = storage.status === 'error' ? 'error' : 'ok';
  return send(res, overall, {
    status: overall,
    storage: {
      status: storage.status,
      readable: storage.readable,
      writable: storage.writable,
    },
  }, storage.status === 'error');
});

router.get('/full', async (req, res) => {
  try {
    const checks = await runAllChecks();
    const critical = isCriticalError(checks);
    const mix = worstStatus([
      checks.api.status,
      checks.database.status,
      checks.storage.status,
      checks.memory.status,
      checks.disk.status,
    ]);
    const status = mix === 'ok' ? 'ok' : 'degraded';
    return send(res, critical ? 'error' : status, {
      status,
      checks: {
        api: checks.api.status,
        database: checks.database.status,
        storage: checks.storage.status,
        memory: checks.memory.status,
        disk: checks.disk.status,
      },
    }, critical);
  } catch (_) {
    return res.status(503).json({
      status: 'error',
      checks: {
        api: 'error',
        database: 'error',
        storage: 'error',
        memory: 'error',
        disk: 'error',
      },
    });
  }
});

module.exports = router;
