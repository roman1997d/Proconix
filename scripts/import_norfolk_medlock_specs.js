/**
 * Import 1 Medlock Street wall types + detail images into Norfolk Drywall Ltd.
 * Run from repo root: node scripts/import_norfolk_medlock_specs.js
 */

const { ensureSchema } = require('../backend/controllers/myDrawingsController');
const { importNorfolkMedlockSpecsOnce } = require('../backend/lib/myDrawingsWallTypes');
const { pool } = require('../backend/db/pool');

(async function main() {
  try {
    await ensureSchema();
    const result = await importNorfolkMedlockSpecsOnce();
    const count = await pool.query(
      `SELECT COUNT(*)::int AS n
       FROM my_drawings_wall_type wt
       JOIN my_drawings_workspace ws ON ws.id = wt.workspace_id
       WHERE UPPER(ws.access_code) = '2026AA' OR ws.name ILIKE 'Norfolk Drywall%'`
    );
    console.log(JSON.stringify({
      import: result,
      norfolkWallTypes: count.rows[0] && count.rows[0].n,
    }, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
