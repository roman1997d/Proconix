/**
 * Progress Drawings — /api/progress-drawings
 * Auth: same device token / admin PIN as My Drawings.
 */

const express = require('express');
const router = express.Router();
const { requireMyDrawingsPin } = require('../middleware/requireMyDrawingsPin');
const ctrl = require('../controllers/progressDrawingsController');

router.get('/bootstrap', requireMyDrawingsPin, ctrl.getBootstrap);

module.exports = router;
