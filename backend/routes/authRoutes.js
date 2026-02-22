/**
 * Auth: validate manager session (active = true) and return company name for display.
 * GET /api/auth/validate – expects headers X-Manager-Id, X-Manager-Email.
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db/pool');
const { requireManagerAuth } = require('../middleware/requireManagerAuth');

router.get('/validate', requireManagerAuth, async function (req, res) {
  let company_name = null;
  try {
    const companyResult = await pool.query(
      'SELECT name FROM companies WHERE id = $1',
      [req.manager.company_id]
    );
    if (companyResult.rows.length > 0) {
      company_name = companyResult.rows[0].name;
    }
  } catch (_) {
    // leave company_name null on error
  }

  return res.status(200).json({
    success: true,
    valid: true,
    company_name: company_name || 'My Company',
    manager: {
      id: req.manager.id,
      company_id: req.manager.company_id,
      name: req.manager.name,
      surname: req.manager.surname,
      email: req.manager.email,
      active: req.manager.active,
    },
  });
});

module.exports = router;
