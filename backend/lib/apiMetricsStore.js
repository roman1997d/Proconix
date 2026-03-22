/**
 * In-memory rolling window of API response times & errors (per-minute buckets).
 * Used by System & health dashboard (platform admin).
 */

const MAX_BUCKETS = 30;

const buckets = [];

/**
 * @param {number} statusCode - HTTP status
 * @param {number} durationMs - response time
 */
function record(statusCode, durationMs) {
  const minute = Math.floor(Date.now() / 60000);
  let last = buckets[buckets.length - 1];
  if (!last || last.minute !== minute) {
    last = { minute, sumMs: 0, n: 0, errors5xx: 0, errors4xx: 0 };
    buckets.push(last);
    while (buckets.length > MAX_BUCKETS) buckets.shift();
  }
  last.sumMs += durationMs;
  last.n += 1;
  if (statusCode >= 500) last.errors5xx += 1;
  else if (statusCode >= 400) last.errors4xx += 1;
}

function getBuckets() {
  return buckets.map((b) => {
    const errAll = b.errors5xx + b.errors4xx;
    return {
      minute: b.minute,
      avg_response_ms: b.n ? Math.round(b.sumMs / b.n) : 0,
      error_rate_5xx_pct: b.n ? Math.round((1000 * b.errors5xx) / b.n) / 10 : 0,
      error_rate_4xx_pct: b.n ? Math.round((1000 * b.errors4xx) / b.n) / 10 : 0,
      error_rate_any_pct: b.n ? Math.round((1000 * errAll) / b.n) / 10 : 0,
      requests: b.n,
    };
  });
}

module.exports = {
  record,
  getBuckets,
};
