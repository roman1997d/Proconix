/**
 * Middleware: require valid manager OR operative session.
 * Tries manager headers first (X-Manager-Id, X-Manager-Email), then operative token.
 * Sets req.manager and req.userType = 'manager' OR req.operative and req.userType = 'operative'.
 */

const { pool } = require('../db/pool');
const { getSession } = require('../utils/operativeSessionStore');

function getOperativeToken(req) {
  const token =
    req.headers['x-operative-token'] ||
    (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null);
  return token || null;
}

async function requireManagerOrOperativeAuth(req, res, next) {
  const managerId = req.headers['x-manager-id'];
  const email = req.headers['x-manager-email'];

  if (managerId && email && typeof email === 'string') {
    const id = parseInt(managerId, 10);
    if (Number.isInteger(id) && id >= 1) {
      try {
        const result = await pool.query(
          'SELECT id, company_id, name, surname, email, active FROM manager WHERE id = $1 AND email = $2 AND active = true',
          [id, email.trim()]
        );
        if (result.rows.length > 0) {
          req.manager = result.rows[0];
          req.userType = 'manager';
          return next();
        }
      } catch (err) {
        console.error('requireManagerOrOperativeAuth manager check:', err);
      }
    }
  }

  const token = getOperativeToken(req);
  if (token) {
    const data = getSession(token);
    if (data) {
      req.operative = {
        id: data.userId,
        company_id: data.companyId,
        email: data.email,
      };
      req.userType = 'operative';
      return next();
    }
  }

  return res.status(401).json({
    success: false,
    message: 'Access denied. Valid session required.',
  });
}

module.exports = { requireManagerOrOperativeAuth };
