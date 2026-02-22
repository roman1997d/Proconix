/**
 * Middleware: require valid operative session and active_status = true.
 * Expects header: X-Operative-Token or Authorization: Bearer <token>
 */

const { getSession } = require('../utils/operativeSessionStore');
const { pool } = require('../db/pool');

const DEACTIVATED_MESSAGE = 'Contul tău a fost dezactivat.';

async function requireOperativeAuth(req, res, next) {
  const token =
    req.headers['x-operative-token'] ||
    (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Operative session required. Please log in again.',
    });
  }

  const data = getSession(token);
  if (!data) {
    return res.status(401).json({
      success: false,
      message: 'Session expired or invalid. Please log in again.',
    });
  }

  req.operative = {
    id: data.userId,
    company_id: data.companyId,
    email: data.email,
  };

  try {
    const r = await pool.query(
      'SELECT active_status FROM users WHERE id = $1',
      [data.userId]
    );
    if (r.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: DEACTIVATED_MESSAGE,
        code: 'account_deactivated',
      });
    }
    const activeStatus = r.rows[0].active_status;
    if (activeStatus === false) {
      return res.status(403).json({
        success: false,
        message: DEACTIVATED_MESSAGE,
        code: 'account_deactivated',
      });
    }
  } catch (err) {
    if (err.code === '42703') {
      return next();
    }
    console.error('requireOperativeAuth active_status check:', err);
    return next();
  }

  next();
}

module.exports = { requireOperativeAuth };
