/**
 * Middleware: valid session for Proconix platform administrators.
 * Headers: X-Platform-Admin-Id, X-Platform-Admin-Email (from frontend after login).
 */

const { pool } = require('../db/pool');

async function requirePlatformAdminAuth(req, res, next) {
  const rawId = req.headers['x-platform-admin-id'];
  const email = req.headers['x-platform-admin-email'];

  if (!rawId || !email || typeof email !== 'string') {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Valid platform admin session required.',
    });
  }

  const id = parseInt(rawId, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Invalid session.',
    });
  }

  const emailNorm = email.trim();

  try {
    const result = await pool.query(
      `SELECT id, full_name, email, admin_rank, access_level, active, enroll_date, address
       FROM proconix_admin
       WHERE id = $1 AND LOWER(TRIM(email)) = LOWER(TRIM($2)) AND active = true`,
      [id, emailNorm]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Session invalid or account inactive.',
      });
    }

    req.platformAdmin = result.rows[0];
    next();
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({
        success: false,
        message: 'Platform admin is not configured (missing table).',
      });
    }
    console.error('requirePlatformAdminAuth error:', err);
    return res.status(500).json({
      success: false,
      message: 'Access check failed.',
    });
  }
}

module.exports = { requirePlatformAdminAuth };
