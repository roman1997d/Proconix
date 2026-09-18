/**
 * Native My Drawings API aliases:
 *   GET  /api/drawings
 *   GET  /api/drawings/:id/file
 *   POST /api/devices/register
 */

const express = require('express');
const router = express.Router();
const { requireMyDrawingsPin } = require('../middleware/requireMyDrawingsPin');
const ctrl = require('../controllers/myDrawingsController');

router.get('/drawings', requireMyDrawingsPin, ctrl.listDrawings);
router.get('/drawings/:id/file', requireMyDrawingsPin, ctrl.downloadFile);
router.post('/devices/register', requireMyDrawingsPin, ctrl.registerDevice);

module.exports = router;
