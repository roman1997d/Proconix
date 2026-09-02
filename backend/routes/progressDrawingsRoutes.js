/**
 * Progress Drawings — /api/progress-drawings
 * Auth: same device token / admin PIN as My Drawings.
 */

const express = require('express');
const router = express.Router();
const { requireMyDrawingsPin } = require('../middleware/requireMyDrawingsPin');
const ctrl = require('../controllers/progressDrawingsController');

router.get('/bootstrap', requireMyDrawingsPin, ctrl.getBootstrap);
router.post('/bookings', requireMyDrawingsPin, ctrl.createOrGetDraft);
router.get('/bookings/:id', requireMyDrawingsPin, ctrl.getBooking);
router.post('/bookings/:id/locations', requireMyDrawingsPin, ctrl.addLocation);
router.put('/locations/:id', requireMyDrawingsPin, ctrl.updateLocation);
router.delete('/locations/:id', requireMyDrawingsPin, ctrl.deleteLocation);

module.exports = router;
