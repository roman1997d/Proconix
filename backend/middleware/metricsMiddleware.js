/**
 * Records /api request duration and status for platform admin metrics.
 */
const { record } = require('../lib/apiMetricsStore');

function metricsMiddleware(req, res, next) {
  if (!req.path || !req.path.startsWith('/api')) {
    return next();
  }
  const t0 = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - t0;
    record(res.statusCode || 500, ms);
  });
  next();
}

module.exports = { metricsMiddleware };
