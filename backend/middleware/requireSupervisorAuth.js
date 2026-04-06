/**
 * Requires valid operative token and users.role = 'Supervisor'.
 * Sets req.supervisor and req.operative for downstream handlers.
 */

const { getSession } = require('../utils/operativeSessionStore');
const { pool } = require('../db/pool');

const DEACTIVATED_MESSAGE = 'Your account has been deactivated.';

async function requireSupervisorAuth(req, res, next) {
  const token =
    req.headers['x-operative-token'] ||
    (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Supervisor session required. Please log in again.',
    });
  }

  const data = getSession(token);
  if (!data) {
    return res.status(401).json({
      success: false,
      message: 'Session expired or invalid. Please log in again.',
    });
  }

  try {
    const r = await pool.query(
      `SELECT id, name, email, company_id, project_id, role, active_status FROM users WHERE id = $1`,
      [data.userId]
    );
    if (r.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Access denied.',
      });
    }
    const u = r.rows[0];
    if (u.active_status === false) {
      return res.status(403).json({
        success: false,
        message: DEACTIVATED_MESSAGE,
        code: 'account_deactivated',
      });
    }
    if (String(u.role || '').trim() !== 'Supervisor') {
      return res.status(403).json({
        success: false,
        message: 'Supervisor access only.',
      });
    }
    req.supervisor = {
      id: u.id,
      name: u.name || '',
      email: u.email || '',
      company_id: u.company_id,
      project_id: u.project_id != null ? u.project_id : null,
    };
    req.operative = {
      id: u.id,
      company_id: u.company_id,
      email: u.email,
    };
    next();
  } catch (err) {
    console.error('requireSupervisorAuth:', err);
    return res.status(500).json({ success: false, message: 'Authentication failed.' });
  }
}

module.exports = { requireSupervisorAuth };
