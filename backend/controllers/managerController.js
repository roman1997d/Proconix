/**
 * Manager registration: insert into manager table.
 * Table: manager (id, company_id, name, surname, email, password, active, created_at,
 *   project_onboard_name, is_head_manager, active_status, dezactivation_date)
 * - company_id from request (validated by onboarding token on frontend).
 * - active set to false ("No" equivalent: BOOLEAN DEFAULT FALSE).
 * - is_head_manager default "No".
 * - Password is hashed with bcrypt before insert.
 */

const bcrypt = require('bcrypt');
const { pool } = require('../db/pool');

const SALT_ROUNDS = 10;

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 12; i += 1) {
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return s;
}

/**
 * Validate create manager body.
 * @returns {{ valid: boolean, errors: string[], data?: object }}
 */
function validateCreateBody(body) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Invalid request body.'] };
  }

  const company_id = body.company_id != null ? Number(body.company_id) : NaN;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const surname = typeof body.surname === 'string' ? body.surname.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!Number.isInteger(company_id) || company_id < 1) {
    errors.push('Valid company_id is required.');
  }
  if (!name || name.length < 2) {
    errors.push('Name is required (at least 2 characters).');
  }
  if (!surname || surname.length < 2) {
    errors.push('Surname is required (at least 2 characters).');
  }
  if (!email) {
    errors.push('Email is required.');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Please enter a valid email address.');
  }
  if (!password || password.length < 8) {
    errors.push('Password is required (minimum 8 characters).');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: { company_id, name, surname, email, password },
  };
}

/**
 * POST /api/managers/create – register a new manager (linked to company).
 */
async function createManager(req, res) {
  try {
    const validation = validateCreateBody(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: validation.errors,
      });
    }

    const { company_id, name, surname, email, password } = validation.data;

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const active = false;
    const is_head_manager = 'No';

    const result = await pool.query(
      `INSERT INTO manager (
        company_id, name, surname, email, password, active,
        is_head_manager
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, company_id, name, surname, email, active`,
      [company_id, name, surname, email, passwordHash, active, is_head_manager]
    );

    const row = result.rows[0];
    return res.status(201).json({
      success: true,
      message: 'Manager registered successfully. You can now sign in when your account is activated.',
      manager: {
        id: row.id,
        company_id: row.company_id,
        name: row.name,
        surname: row.surname,
        email: row.email,
        active: row.active,
      },
    });
  } catch (err) {
    console.error('createManager error:', err);
    if (err.code === '23503') {
      return res.status(400).json({
        success: false,
        message: 'Invalid company. Please complete company registration first.',
        error: err.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to register manager.',
      error: err.message,
    });
  }
}

/**
 * POST /api/managers/login – authenticate manager (email + password, active = true only).
 */
async function loginManager(req, res) {
  try {
    const body = req.body || {};
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address.',
      });
    }
    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required.',
      });
    }

    const result = await pool.query(
      'SELECT id, company_id, name, surname, email, password, active FROM manager WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const row = result.rows[0];
    if (row.active !== true) {
      return res.status(401).json({
        success: false,
        message: 'Your account is not activated yet. Please contact the administrator.',
      });
    }

    const match = await bcrypt.compare(password, row.password || '');
    if (!match) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      manager: {
        id: row.id,
        company_id: row.company_id,
        name: row.name,
        surname: row.surname,
        email: row.email,
        active: row.active,
      },
    });
  } catch (err) {
    console.error('loginManager error:', err);
    return res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.',
      error: err.message,
    });
  }
}

/**
 * GET /api/managers/me
 * Returns logged-in manager profile details.
 * If DB schema doesn't have manager.phone, we return phone_supported=false.
 */
async function getManagerMe(req, res) {
  const op = req.manager;
  if (!op || op.id == null) {
    return res.status(401).json({ success: false, message: 'Unauthorized.' });
  }

  const managerId = op.id;

  // Some deployments might not yet have `manager.phone` column.
  try {
    const result = await pool.query(
      'SELECT id, company_id, name, surname, email, active, phone FROM manager WHERE id = $1',
      [managerId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Manager not found.' });
    }

    const row = result.rows[0];
    return res.status(200).json({
      success: true,
      manager: {
        id: row.id,
        company_id: row.company_id,
        name: row.name || '',
        surname: row.surname || '',
        email: row.email || '',
        active: row.active,
        phone: row.phone != null ? String(row.phone) : null,
      },
      phone_supported: true,
    });
  } catch (err) {
    if (err && err.code === '42703') {
      // Undefined column: likely `phone` doesn't exist yet.
      try {
        const result = await pool.query(
          'SELECT id, company_id, name, surname, email, active FROM manager WHERE id = $1',
          [managerId]
        );

        if (!result.rows.length) {
          return res.status(404).json({ success: false, message: 'Manager not found.' });
        }

        const row = result.rows[0];
        return res.status(200).json({
          success: true,
          manager: {
            id: row.id,
            company_id: row.company_id,
            name: row.name || '',
            surname: row.surname || '',
            email: row.email || '',
            active: row.active,
            phone: null,
          },
          phone_supported: false,
        });
      } catch (innerErr) {
        console.error('getManagerMe fallback error:', innerErr);
        return res.status(500).json({ success: false, message: 'Failed to load profile.' });
      }
    }

    console.error('getManagerMe error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load profile.' });
  }
}

/**
 * PATCH /api/managers/phone
 * Body: { phone?: string }
 * - Requires DB column `manager.phone`. If missing, returns 400.
 */
async function updateManagerPhone(req, res) {
  const op = req.manager;
  if (!op || op.id == null) {
    return res.status(401).json({ success: false, message: 'Unauthorized.' });
  }

  const managerId = op.id;
  const body = req.body || {};
  const phoneRaw = typeof body.phone === 'string' ? body.phone.trim() : '';
  const phone = phoneRaw.length ? phoneRaw : null;

  if (phone && phone.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Phone number is too short.',
    });
  }

  try {
    const result = await pool.query(
      'UPDATE manager SET phone = $1 WHERE id = $2 RETURNING phone',
      [phone, managerId]
    );

    const row = result.rows && result.rows[0] ? result.rows[0] : null;
    return res.status(200).json({
      success: true,
      manager: { phone: row && row.phone != null ? String(row.phone) : null },
    });
  } catch (err) {
    if (err && err.code === '42703') {
      return res.status(400).json({
        success: false,
        message: 'Phone field is not available in the database schema yet.',
      });
    }

    console.error('updateManagerPhone error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update phone.' });
  }
}

/**
 * POST /api/managers/change-password
 * Body: { current_password, new_password }
 */
async function changeManagerPassword(req, res) {
  const op = req.manager;
  if (!op || op.id == null) {
    return res.status(401).json({ success: false, message: 'Unauthorized.' });
  }

  const body = req.body || {};
  const currentPassword = typeof body.current_password === 'string' ? body.current_password : '';
  const newPassword = typeof body.new_password === 'string' ? body.new_password : '';

  if (!currentPassword) {
    return res.status(400).json({ success: false, message: 'Current password is required.' });
  }
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
  }

  try {
    const result = await pool.query(
      'SELECT password FROM manager WHERE id = $1 AND active = true',
      [op.id]
    );

    if (!result.rows.length) {
      return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }

    const storedHash = result.rows[0].password || '';
    const match = await bcrypt.compare(currentPassword, storedHash);
    if (!match) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await pool.query('UPDATE manager SET password = $1 WHERE id = $2', [passwordHash, op.id]);

    return res.status(200).json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    console.error('changeManagerPassword error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update password.' });
  }
}

/**
 * POST /api/managers/invite
 * Body:
 *   - manager_type: 'general' | 'site'
 *   - project_id: required for 'site'
 *   - email: manager email
 *
 * Creates a manager with:
 *   - active=true (so they can login with temporaryPassword and then change it)
 *   - generated temporary password returned in response
 *
 * Site manager: stores selected project name in `project_onboard_name`.
 */
async function inviteManager(req, res) {
  const op = req.manager;
  if (!op || op.company_id == null) {
    return res.status(401).json({ success: false, message: 'Unauthorized.' });
  }

  const companyId = op.company_id;
  const body = req.body || {};

  const managerType = typeof body.manager_type === 'string' ? body.manager_type.trim().toLowerCase() : '';
  const emailRaw = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const projectIdRaw = body.project_id != null ? String(body.project_id) : '';

  const validEmail = emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw);
  if (!validEmail) {
    return res.status(400).json({ success: false, message: 'Valid email is required.' });
  }

  if (managerType !== 'general' && managerType !== 'site') {
    return res.status(400).json({ success: false, message: 'manager_type must be general or site.' });
  }

  let projectId = null;
  if (managerType === 'site') {
    projectId = parseInt(projectIdRaw, 10);
    if (!Number.isInteger(projectId) || projectId < 1) {
      return res.status(400).json({ success: false, message: 'project_id is required for site managers.' });
    }
  }

  try {
    // Prevent duplicates for the same company.
    const existing = await pool.query(
      'SELECT id FROM manager WHERE company_id = $1 AND email = $2 LIMIT 1',
      [companyId, emailRaw]
    );
    if (existing.rows.length) {
      return res.status(409).json({ success: false, message: 'A manager with this email already exists.' });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS);

    // Derive name/surname from email (best-effort; can be edited later).
    const local = emailRaw.split('@')[0] || '';
    const parts = local.split(/[._-]+/).filter(Boolean);
    const name = (parts[0] || '').slice(0, 60);
    const surname = (parts[1] || '').slice(0, 60);

    let is_head_manager = 'No';
    let project_onboard_name = null;
    if (managerType === 'general') {
      is_head_manager = 'Yes';
    }
    if (managerType === 'site') {
      // Robust project name lookup (project_name vs legacy name column)
      try {
        const proj = await pool.query(
          'SELECT id, project_name FROM projects WHERE id = $1 AND company_id = $2',
          [projectId, companyId]
        );
        if (!proj.rows.length) return res.status(404).json({ success: false, message: 'Project not found.' });
        project_onboard_name = proj.rows[0].project_name || String(projectId);
      } catch (err) {
        if (err && err.code === '42703') {
          const proj = await pool.query(
            'SELECT id, name FROM projects WHERE id = $1 AND company_id = $2',
            [projectId, companyId]
          );
          if (!proj.rows.length) return res.status(404).json({ success: false, message: 'Project not found.' });
          project_onboard_name = proj.rows[0].name || String(projectId);
        } else {
          throw err;
        }
      }
    }

    const active = true;
    const result = await pool.query(
      `INSERT INTO manager
        (company_id, name, surname, email, password, active, project_onboard_name, is_head_manager)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, company_id, name, surname, email, active, project_onboard_name, is_head_manager`,
      [companyId, name || null, surname || null, emailRaw, passwordHash, active, project_onboard_name, is_head_manager]
    );

    const row = result.rows[0];
    return res.status(201).json({
      success: true,
      message: 'Manager invited successfully.',
      temporaryPassword: tempPassword,
      manager: row,
      project_onboard_name: project_onboard_name,
    });
  } catch (err) {
    console.error('inviteManager error:', err);
    return res.status(500).json({ success: false, message: 'Failed to invite manager.' });
  }
}

module.exports = {
  createManager,
  loginManager,
  getManagerMe,
  updateManagerPhone,
  changeManagerPassword,
  inviteManager,
};
