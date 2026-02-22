/**
 * Company API routes.
 * Base path: /api/companies
 */

const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');

/** POST /api/companies/create – register a new company */
router.post('/create', companyController.createCompany);

module.exports = router;
