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

module.exports = {
  createManager,
  loginManager,
};
