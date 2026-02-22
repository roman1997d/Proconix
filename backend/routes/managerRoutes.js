/**
 * Manager API routes.
 * POST /api/managers/create – register manager (after company onboarding).
 * POST /api/managers/login – authenticate manager (email + password, active only).
 */

const express = require('express');
const router = express.Router();
const managerController = require('../controllers/managerController');

router.post('/create', managerController.createManager);
router.post('/login', managerController.loginManager);

module.exports = router;
