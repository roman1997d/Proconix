/**
 * Same text as printed to the terminal on server listen (server.js).
 * Used by GET /api/platform-admin/system-health for a UI mirror.
 *
 * @param {{ dbOk: boolean, dbName?: string, dbError?: string | null }} opts
 * @returns {string[]}
 */
function getStartupConsoleBannerLines(opts) {
  const dbOk = !!opts.dbOk;
  const dbName = opts.dbName || process.env.PGDATABASE || process.env.DB_NAME || 'ConflowDB';
  const dbError = opts.dbError == null ? null : String(opts.dbError);

  const HOST = process.env.HOST || 'localhost';
  const PORT = parseInt(process.env.PORT || '3000', 10);

  const lines = [
    '-------------------------------------------',
    `  Server:       http://${HOST}:${PORT}/`,
    `  Conflow:     http://${HOST}:${PORT}/`,
    `  Register:     http://${HOST}:${PORT}/register_company.html`,
    `  API health:   http://${HOST}:${PORT}/api/health`,
    `  API create:   POST http://${HOST}:${PORT}/api/companies/create`,
    '-------------------------------------------',
  ];

  if (dbOk) {
    lines.push(`  Database (${dbName}): CONNECTED`);
  } else {
    lines.push(`  Database (${dbName}): NOT CONNECTED`);
    if (dbError) {
      lines.push(`  Error: ${dbError}`);
    }
  }
  lines.push('-------------------------------------------');
  return lines;
}

/**
 * Print startup banner to stdout (Node console).
 * @param {{ dbOk: boolean, dbName?: string, dbError?: string | null }} opts
 */
function printStartupConsoleBanner(opts) {
  getStartupConsoleBannerLines(opts).forEach((line) => {
    console.log(line);
  });
}

module.exports = {
  getStartupConsoleBannerLines,
  printStartupConsoleBanner,
};
