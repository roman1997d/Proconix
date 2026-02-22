/**
 * Middleware: require valid active manager session.
 * Expects headers: X-Manager-Id, X-Manager-Email (from frontend localStorage session).
 * Queries manager table: id + email must match and active = true.
 */

const { pool } = require('../db/pool');

async function requireManagerAuth(req, res, next) {
  const managerId = req.headers['x-manager-id'];
  const email = req.headers['x-manager-email'];

  if (!managerId || !email || typeof email !== 'string') {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Valid session required.',
    });
  }

  const id = parseInt(managerId, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Invalid session.',
    });
  }

  try {
    const result = await pool.query(
      'SELECT id, company_id, name, surname, email, active FROM manager WHERE id = $1 AND email = $2 AND active = true',
      [id, email.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'You do not have access. Please register or contact the administrator.',
      });
    }

    req.manager = result.rows[0];
    next();
  } catch (err) {
    console.error('requireManagerAuth error:', err);
    return res.status(500).json({
      success: false,
      message: 'Access check failed.',
    });
  }
}

module.exports = { requireManagerAuth };
