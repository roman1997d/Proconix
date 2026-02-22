/**
 * Add operative or supervisor to the manager's company.
 * Inserts into users table with hashed password; company_id from req.manager.
 */

const { pool } = require('../db/pool');
const bcrypt = require('bcrypt');
const { createSession } = require('../utils/operativeSessionStore');

const OPERATIVE_ROLES = ['Plaster', 'Dryliner', 'Electrician', 'Plumber', 'Painter', 'Carpenter', 'Other'];
const SUPERVISOR_ROLE = 'Supervisor';
const ALL_ROLES = [SUPERVISOR_ROLE].concat(OPERATIVE_ROLES);

const TEMP_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes
const operativeTempTokens = new Map(); // token -> { userId, createdAt }

const DEFAULT_TEMP_PASSWORD_LENGTH = 12;

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < DEFAULT_TEMP_PASSWORD_LENGTH; i++) {
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return s;
}

/**
 * POST /api/operatives/add
 * Body: { firstName, surname, email, role?, active }
 * - If role is omitted or "Supervisor", treat as supervisor (role = Supervisor).
 * - company_id from req.manager (set by requireManagerAuth).
 */
async function addOperative(req, res) {
  const companyId = req.manager?.company_id;
  if (companyId == null) {
    return res.status(403).json({
      success: false,
      message: 'Manager company not found.',
    });
  }

  const raw = req.body || {};
  const firstName = typeof raw.firstName === 'string' ? raw.firstName.trim() : '';
  const surname = typeof raw.surname === 'string' ? raw.surname.trim() : '';
  const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';
  const isSupervisor = raw.isSupervisor === true || raw.role === SUPERVISOR_ROLE;
  const role = isSupervisor ? SUPERVISOR_ROLE : (raw.role && OPERATIVE_ROLES.includes(raw.role) ? raw.role : OPERATIVE_ROLES[0]);
  const active = Boolean(raw.active);

  if (!firstName || !surname) {
    return res.status(400).json({
      success: false,
      message: 'First name and last name are required.',
    });
  }

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Email is required.',
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'Please enter a valid email address.',
    });
  }

  const fullName = [firstName, surname].filter(Boolean).join(' ');
  const tempPassword = generateTempPassword();

  let hashedPassword;
  try {
    hashedPassword = await bcrypt.hash(tempPassword, 10);
  } catch (err) {
    console.error('operativeController hash error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to create user.',
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO users
       (company_id, project_id, role, name, email, password, active, created_at, active_status)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, NOW(), $7)
       RETURNING id, company_id, project_id, role, name, email, active, created_at, active_status`,
      [companyId, role, fullName, email, hashedPassword, active, active]
    );

    const row = result.rows[0];
    return res.status(201).json({
      success: true,
      message: isSupervisor ? 'Supervisor added successfully.' : 'Operative added successfully.',
      user: {
        id: row.id,
        company_id: row.company_id,
        project_id: row.project_id,
        role: row.role,
        name: row.name,
        email: row.email,
        active: row.active,
        active_status: row.active_status,
        created_at: row.created_at,
      },
      temporaryPassword: tempPassword,
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'A user with this email already exists in your company.',
      });
    }
    if (err.code === '23503') {
      return res.status(400).json({
        success: false,
        message: 'Invalid company. Please try again.',
      });
    }
    console.error('operativeController insert error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to add user. Please try again.',
    });
  }
}

/**
 * GET /api/operatives
 * Returns all users (operatives/supervisors) for the manager's company + role statistics.
 */
async function listOperatives(req, res) {
  const companyId = req.manager?.company_id;
  if (companyId == null) {
    return res.status(403).json({ success: false, message: 'Manager company not found.' });
  }

  try {
    const listResult = await pool.query(
      `SELECT id, name, email, role, project_id, created_at, active, active_status
       FROM users
       WHERE company_id = $1
       ORDER BY created_at DESC`,
      [companyId]
    );

    const projectIds = [...new Set(listResult.rows.map((r) => r.project_id).filter(Boolean))];
    const projectNames = {};
    if (projectIds.length > 0) {
      try {
        const proj = await pool.query(
          `SELECT id, project_name AS project_name FROM projects WHERE id = ANY($1) AND company_id = $2`,
          [projectIds, companyId]
        );
        proj.rows.forEach((r) => { projectNames[r.id] = r.project_name; });
      } catch (e) {
        if (e.code === '42P01') {
          // projects table missing - leave projectNames empty
        } else if (e.code === '42703') {
          const proj = await pool.query(
            `SELECT id, name AS project_name FROM projects WHERE id = ANY($1) AND company_id = $2`,
            [projectIds, companyId]
          );
          proj.rows.forEach((r) => { projectNames[r.id] = r.project_name; });
        }
      }
    }

    const operatives = listResult.rows.map((row) => ({
      ...row,
      project_name: row.project_id != null ? (projectNames[row.project_id] || null) : null,
    }));

    const statsResult = await pool.query(
      `SELECT role, COUNT(*)::int AS count
       FROM users
       WHERE company_id = $1
       GROUP BY role
       ORDER BY count DESC`,
      [companyId]
    );

    const stats = {};
    statsResult.rows.forEach(function (r) {
      stats[r.role] = r.count;
    });

    return res.status(200).json({
      success: true,
      operatives,
      stats,
    });
  } catch (err) {
    console.error('operativeController list error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to load operatives.',
    });
  }
}

/**
 * PATCH /api/operatives/:id
 * Body: { role?, active? } — update role and/or active status. company_id must match.
 */
async function updateOperative(req, res) {
  const companyId = req.manager?.company_id;
  if (companyId == null) {
    return res.status(403).json({ success: false, message: 'Manager company not found.' });
  }

  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid operative id.' });
  }

  const raw = req.body || {};
  const role = typeof raw.role === 'string' && ALL_ROLES.includes(raw.role) ? raw.role : null;
  const hasActive = Object.prototype.hasOwnProperty.call(raw, 'active');
  const active = hasActive ? (raw.active === true || raw.active === 'true') : false;

  if (role === null && !hasActive) {
    return res.status(400).json({ success: false, message: 'Provide role and/or active to update.' });
  }

  try {
    let result;
    if (role !== null && hasActive) {
      result = await pool.query(
        'UPDATE users SET role = $1, active = $2, active_status = $3 WHERE id = $4 AND company_id = $5 RETURNING id, name, email, role, project_id, created_at, active',
        [role, active, active, id, companyId]
      );
    } else if (role !== null) {
      result = await pool.query(
        'UPDATE users SET role = $1 WHERE id = $2 AND company_id = $3 RETURNING id, name, email, role, project_id, created_at, active',
        [role, id, companyId]
      );
    } else {
      result = await pool.query(
        'UPDATE users SET active = $1, active_status = $2 WHERE id = $3 AND company_id = $4 RETURNING id, name, email, role, project_id, created_at, active',
        [active, active, id, companyId]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Operative not found or access denied.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Operative updated.',
      operative: result.rows[0],
    });
  } catch (err) {
    console.error('operativeController update error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update operative.' });
  }
}

/**
 * DELETE /api/operatives/:id
 * Removes the operative from users. company_id must match.
 */
async function deleteOperative(req, res) {
  const companyId = req.manager?.company_id;
  if (companyId == null) {
    return res.status(403).json({ success: false, message: 'Manager company not found.' });
  }

  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid operative id.' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 AND company_id = $2 RETURNING id',
      [id, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Operative not found or access denied.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Operative removed.',
    });
  } catch (err) {
    console.error('operativeController delete error:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete operative.' });
  }
}

/**
 * POST /api/operatives/login
 * Body: { email, password }
 * Normal login for operatives who have already set their password (onboarded = true).
 */
async function login(req, res) {
  const raw = req.body || {};
  const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';
  const password = typeof raw.password === 'string' ? raw.password : '';

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required.',
    });
  }

  try {
    let result;
    try {
      result = await pool.query(
        'SELECT id, name, password, active, onboarding, company_id FROM users WHERE email = $1',
        [email]
      );
    } catch (queryErr) {
      if (queryErr.code === '42703' || (queryErr.message && (queryErr.message.indexOf('onboarding') !== -1 || queryErr.message.indexOf('onboarded') !== -1))) {
        result = await pool.query(
          'SELECT id, name, password, active, company_id FROM users WHERE email = $1',
          [email]
        );
        if (result.rows.length > 0) {
          result.rows[0].onboarding = 'yes';
        }
      } else {
        throw queryErr;
      }
    }

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const user = result.rows[0];
    if (!user.active) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    if (user.hasOwnProperty('onboarding') && user.onboarding !== 'yes') {
      return res.status(400).json({
        success: false,
        message: 'First-time login: please use your temporary password to set your password.',
      });
    }

    const storedHash = user.password;
    if (!storedHash || typeof storedHash !== 'string' || storedHash.length < 10) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    let match = false;
    try {
      match = await bcrypt.compare(password, storedHash);
    } catch (compareErr) {
      console.error('operativeController login bcrypt.compare error:', compareErr.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }
    if (!match) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const sessionToken = createSession(user.id, user.company_id || null, user.email);
    return res.status(200).json({
      success: true,
      token: sessionToken,
      user: { id: user.id, name: user.name || '', email: user.email },
    });
  } catch (err) {
    console.error('operativeController login error:', err.message || err);
    return res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.',
    });
  }
}

/**
 * POST /api/operatives/login-temp
 * Body: { email, temporaryPassword }
 * Only for first-time login (onboarded = false). Validates temp password and returns one-time token for set-password.
 */
async function loginTemp(req, res) {
  const raw = req.body || {};
  const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';
  const temporaryPassword = typeof raw.temporaryPassword === 'string' ? raw.temporaryPassword.trim() : '';

  if (!email || !temporaryPassword) {
    return res.status(400).json({
      success: false,
      message: 'Email and temporary password are required.',
    });
  }

  try {
    let result;
    try {
      result = await pool.query(
        'SELECT id, name, password, active, onboarding, company_id FROM users WHERE email = $1',
        [email]
      );
    } catch (queryErr) {
      if (queryErr.code === '42703' || (queryErr.message && (queryErr.message.indexOf('onboarding') !== -1 || queryErr.message.indexOf('onboarded') !== -1))) {
        result = await pool.query(
          'SELECT id, name, password, active, company_id FROM users WHERE email = $1',
          [email]
        );
        if (result.rows.length > 0) result.rows[0].onboarding = 'yes';
      } else {
        throw queryErr;
      }
    }

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or temporary password.',
      });
    }

    const user = result.rows[0];
    if ((user.onboarding && user.onboarding === 'yes') || user.onboarding == null) {
      return res.status(400).json({
        success: false,
        message: 'You have already set your password. Please log in with your email and password.',
      });
    }
    if (!user.active) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or temporary password.',
      });
    }

    const storedHash = user.password;
    if (!storedHash || typeof storedHash !== 'string' || storedHash.length < 10) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or temporary password.',
      });
    }

    let match = false;
    try {
      match = await bcrypt.compare(temporaryPassword, storedHash);
    } catch (compareErr) {
      console.error('operativeController loginTemp bcrypt.compare error:', compareErr.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or temporary password.',
      });
    }
    if (!match) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or temporary password.',
      });
    }

    const token = require('crypto').randomBytes(32).toString('hex');
    operativeTempTokens.set(token, { userId: user.id, createdAt: Date.now() });

    return res.status(200).json({
      success: true,
      token,
      user: { id: user.id, name: user.name },
    });
  } catch (err) {
    console.error('operativeController loginTemp error:', err);
    return res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.',
    });
  }
}

/**
 * POST /api/operatives/set-password
 * Body: { token, newPassword, confirmPassword }
 * Updates user password (hashed) and sets active_status = true. Token is one-time use.
 */
async function setPassword(req, res) {
  const raw = req.body || {};
  const token = typeof raw.token === 'string' ? raw.token.trim() : '';
  const newPassword = typeof raw.newPassword === 'string' ? raw.newPassword : '';
  const confirmPassword = typeof raw.confirmPassword === 'string' ? raw.confirmPassword : '';

  if (!token) {
    return res.status(400).json({ success: false, message: 'Session expired. Please start the login again.' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ success: false, message: 'Passwords do not match.' });
  }

  const data = operativeTempTokens.get(token);
  if (!data) {
    return res.status(401).json({ success: false, message: 'Session expired. Please start the login again.' });
  }

  const now = Date.now();
  if (now - data.createdAt > TEMP_TOKEN_TTL_MS) {
    operativeTempTokens.delete(token);
    return res.status(401).json({ success: false, message: 'Session expired. Please start the login again.' });
  }

  operativeTempTokens.delete(token);

  let hashedPassword;
  try {
    hashedPassword = await bcrypt.hash(newPassword, 10);
  } catch (err) {
    console.error('operativeController setPassword hash error:', err);
    return res.status(500).json({ success: false, message: 'Failed to set password.' });
  }

  try {
    try {
      await pool.query(
        "UPDATE users SET password = $1, active_status = TRUE, onboarding = 'yes' WHERE id = $2",
        [hashedPassword, data.userId]
      );
    } catch (updateErr) {
      if (updateErr.code === '42703' || (updateErr.message && (updateErr.message.indexOf('onboarding') !== -1 || updateErr.message.indexOf('onboarded') !== -1))) {
        await pool.query(
          'UPDATE users SET password = $1, active_status = TRUE WHERE id = $2',
          [hashedPassword, data.userId]
        );
      } else {
        throw updateErr;
      }
    }
    const userRow = await pool.query(
      'SELECT id, company_id, email, name FROM users WHERE id = $1',
      [data.userId]
    );
    const user = userRow.rows[0];
    const sessionToken = createSession(
      user.id,
      user.company_id,
      user.email
    );
    return res.status(200).json({
      success: true,
      message: 'Password set successfully.',
      token: sessionToken,
      user: { id: user.id, name: user.name || '', email: user.email },
    });
  } catch (err) {
    console.error('operativeController setPassword update error:', err);
    return res.status(500).json({ success: false, message: 'Failed to set password.' });
  }
}

// Clean expired tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [t, data] of operativeTempTokens.entries()) {
    if (now - data.createdAt > TEMP_TOKEN_TTL_MS) operativeTempTokens.delete(t);
  }
}, 60 * 1000);

module.exports = {
  addOperative,
  listOperatives,
  updateOperative,
  deleteOperative,
  login,
  loginTemp,
  setPassword,
  OPERATIVE_ROLES,
  SUPERVISOR_ROLE,
  ALL_ROLES,
};
