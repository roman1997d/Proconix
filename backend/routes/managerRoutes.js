/**
 * Manager API routes.
 * POST /api/managers/create – register manager (after company onboarding).
 * POST /api/managers/login – authenticate manager (email + password, active only).
 */

const express = require('express');
const router = express.Router();
const managerController = require('../controllers/managerController');
const { requireManagerAuth } = require('../middleware/requireManagerAuth');

router.post('/create', managerController.createManager);
router.post('/login', managerController.loginManager);

// Manager profile settings (dashboard)
router.get('/me', requireManagerAuth, managerController.getManagerMe);
router.patch('/phone', requireManagerAuth, managerController.updateManagerPhone);
router.post('/change-password', requireManagerAuth, managerController.changeManagerPassword);
router.post('/invite', requireManagerAuth, managerController.inviteManager);

module.exports = router;
