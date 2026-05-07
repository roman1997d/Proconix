#!/usr/bin/env node
/**
 * Cron-friendly panic alert runner (same logic as Platform admin → Run check).
 * Example crontab (every 15 minutes):
 *   */15 * * * * cd /var/www/proconix && /usr/bin/node scripts/run-panic-alert-check.js >> /var/log/proconix-panic-alert.log 2>&1
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { runPanicAlertCheck } = require('../backend/lib/panicAlertService');

(async () => {
  try {
    const out = await runPanicAlertCheck({ force: false });
    const line = JSON.stringify({ at: new Date().toISOString(), ...out });
    console.log(line);
    process.exit(0);
  } catch (e) {
    console.error(JSON.stringify({ at: new Date().toISOString(), error: String(e && e.message ? e.message : e) }));
    process.exit(1);
  }
})();
