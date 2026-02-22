/**
 * Company controller: handles company registration (insert into companies table).
 * Table: companies (id, name, industry_type, subscription_plan, active, created_at, created_by, security_question1, security_token1, office_address)
 */

const { pool } = require('../db/pool');
const { createToken } = require('../utils/onboardingToken');

/**
 * Generates a security code: 3 uppercase letters + 3 digits (e.g. ABC123).
 * No special characters.
 */
function generateSecurityToken() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < 3; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  for (let i = 0; i < 3; i++) {
    code += digits.charAt(Math.floor(Math.random() * digits.length));
  }
  return code;
}

/** Allowed industry types (must match frontend dropdown) */
const ALLOWED_INDUSTRIES = ['Drylining', 'Plumbing', 'Electrical', 'Carpentry', 'Other'];

/** Allowed subscription plans */
const ALLOWED_PLANS = ['1 month', '3 months', '6 months', '12 months'];

/**
 * Validates and sanitizes company create payload.
 * @param {object} body - Request body
 * @returns {{ valid: boolean, errors: string[], data?: object }}
 */
function validateCreateBody(body) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Invalid request body.'] };
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const industry_type = typeof body.industry_type === 'string' ? body.industry_type.trim() : '';
  const subscription_plan = typeof body.subscription_plan === 'string' ? body.subscription_plan.trim() : '';
  const created_by = typeof body.created_by === 'string' ? body.created_by.trim() : '';
  const office_address = typeof body.office_address === 'string' ? body.office_address.trim() : '';
  const security_question1 = typeof body.security_question1 === 'string' ? body.security_question1.trim() : '';

  if (!name) errors.push('Company name is required.');
  if (!industry_type) errors.push('Industry type is required.');
  if (!ALLOWED_INDUSTRIES.includes(industry_type)) {
    errors.push(`Industry type must be one of: ${ALLOWED_INDUSTRIES.join(', ')}.`);
  }
  if (!subscription_plan) errors.push('Subscription plan is required.');
  if (!ALLOWED_PLANS.includes(subscription_plan)) {
    errors.push(`Subscription plan must be one of: ${ALLOWED_PLANS.join(', ')}.`);
  }
  if (!created_by) errors.push('Head manager name (created_by) is required.');
  if (!office_address) errors.push('Office address is required.');
  if (!security_question1) errors.push('Security question is required.');

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      name,
      industry_type,
      subscription_plan,
      created_by,
      office_address,
      security_question1,
    },
  };
}

/**
 * Create a new company (insert into companies table).
 * POST /api/companies/create
 * Body: name, industry_type, subscription_plan, created_by, office_address, security_question1, security_token1
 */
async function createCompany(req, res) {
  try {
    const validation = validateCreateBody(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: validation.errors,
      });
    }

    const {
      name,
      industry_type,
      subscription_plan,
      created_by,
      office_address,
      security_question1,
    } = validation.data;

    const active = 'not_active';
    const security_token1 = generateSecurityToken();

    const result = await pool.query(
      `INSERT INTO companies (
        name, industry_type, subscription_plan, active,
        created_by, security_question1, security_token1, office_address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, name, industry_type, subscription_plan, active, created_at, created_by, office_address`,
      [
        name,
        industry_type,
        subscription_plan,
        active,
        created_by,
        security_question1,
        security_token1,
        office_address,
      ]
    );

    const row = result.rows[0];
    const onboarding_token = createToken(row.id);
    return res.status(201).json({
      success: true,
      message: 'Company registered successfully.',
      security_token: security_token1,
      onboarding_token,
      company: {
        id: row.id,
        name: row.name,
        industry_type: row.industry_type,
        subscription_plan: row.subscription_plan,
        active: row.active,
        created_at: row.created_at,
        created_by: row.created_by,
        office_address: row.office_address,
      },
    });
  } catch (err) {
    console.error('createCompany error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to register company.',
      error: err.message,
    });
  }
}

module.exports = {
  createCompany,
};
