/**
 * Company API routes.
 * Base path: /api/companies
 */

const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');
const { requireManagerAuth } = require('../middleware/requireManagerAuth');

/** POST /api/companies/create – register a new company */
router.post('/create', companyController.createCompany);

/** GET /api/companies/me – logged-in manager company profile */
router.get('/me', requireManagerAuth, companyController.getCompanyMe);

module.exports = router;
