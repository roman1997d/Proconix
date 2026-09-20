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
  checkMyDrawingsDownload,
  runAllChecks,
  worstStatus,
  isCriticalError,
} = require('../lib/healthChecks');

const router = express.Router();

function send(res, overall, body, criticalError) {
  const code = criticalError || overall === 'error' ? 503 : 200;
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  return res.status(code).json(body);
}

router.get('/', async (req, res) => {
  try {
    const [database, storage, disk, drawings] = await Promise.all([
      checkDatabase(),
      checkStorage(),
      checkDisk(),
      checkMyDrawingsDownload(),
    ]);
    const memory = checkMemory();
    const critical = [database.status, storage.status, memory.status, disk.status, drawings.status].indexOf('error') !== -1;
    const status = critical ? 'error' : 'ok';
    return send(res, status, {
      status,
      connected: database.status === 'ok',
      database: { status: database.status, latency_ms: database.latency_ms },
      storage: { status: storage.status },
      drawings: { status: drawings.status },
      memory: { status: memory.status, rss_mb: memory.rss_mb },
      disk: { status: disk.status, percent_used: disk.percent_used, free_mb: disk.free_mb },
    }, critical);
  } catch (_) {
    return res.status(503).json({
      status: 'error',
      connected: false,
      database: { status: 'error' },
      storage: { status: 'error' },
      drawings: { status: 'error' },
      memory: { status: 'error' },
      disk: { status: 'error' },
    });
  }
});

router.get('/api', async (req, res) => {
  const [api, drawings] = await Promise.all([
    Promise.resolve(checkApi()),
    checkMyDrawingsDownload(),
  ]);
  const overall = api.status === 'error' || drawings.status === 'error' ? 'error' : 'ok';
  return send(res, overall, {
    status: overall,
    api: { status: api.status === 'error' || drawings.status === 'error' ? overall : api.status },
    drawings: { status: drawings.status },
    uptime_seconds: api.uptime_seconds,
    modules: api.modules,
  }, overall === 'error');
});

router.get('/storage', async (req, res) => {
  const [storage, drawings] = await Promise.all([checkStorage(), checkMyDrawingsDownload()]);
  const overall = storage.status === 'error' || drawings.status === 'error' ? 'error' : 'ok';
  return send(res, overall, {
    status: overall,
    storage: {
      status: storage.status,
      readable: storage.readable,
      writable: storage.writable,
    },
    drawings: {
      status: drawings.status,
      web: drawings.web && drawings.web.status,
      mobile: drawings.mobile && drawings.mobile.status,
      image: drawings.image && drawings.image.status,
      image_mobile: drawings.image_mobile && drawings.image_mobile.status,
    },
  }, overall === 'error');
});

router.get('/mydrawings', async (req, res) => {
  const drawings = await checkMyDrawingsDownload();
  const overall = drawings.status === 'error' ? 'error' : 'ok';
  return send(res, overall, {
    status: overall,
    drawings: {
      status: drawings.status,
      web: drawings.web,
      mobile: drawings.mobile,
      image: drawings.image,
      image_mobile: drawings.image_mobile,
    },
  }, overall === 'error');
});

router.get('/full', async (req, res) => {
  try {
    const checks = await runAllChecks();
    const critical = isCriticalError(checks);
    const mix = worstStatus([
      checks.api.status,
      checks.database.status,
      checks.storage.status,
      checks.drawings.status,
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
        drawings: checks.drawings.status,
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
        drawings: 'error',
        memory: 'error',
        disk: 'error',
      },
    });
  }
});

module.exports = router;
