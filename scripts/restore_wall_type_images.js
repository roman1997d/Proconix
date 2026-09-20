/**
 * Recopy missing wall-type spec images from frontend/mydrawings/data/wall-types.
 * Run from repo root: node scripts/restore_wall_type_images.js
 */

const { ensureSchema } = require('../backend/controllers/myDrawingsController');
const { restoreMissingWallTypeImages } = require('../backend/lib/myDrawingsWallTypes');
const { pool } = require('../backend/db/pool');

(async function main() {
  try {
    await ensureSchema();
    const result = await restoreMissingWallTypeImages();
    const missing = await pool.query(
      `SELECT COUNT(*)::int AS n
       FROM my_drawings_wall_type
       WHERE detail_image_path IS NULL OR TRIM(detail_image_path) = ''`
    );
    console.log(JSON.stringify({
      restore: result,
      wallTypesWithoutPath: missing.rows[0] && missing.rows[0].n,
    }, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
