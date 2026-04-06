/**
 * Crews API – manager dashboard (teams of operatives).
 */

const express = require('express');
const router = express.Router();
const { requireManagerAuth } = require('../middleware/requireManagerAuth');
const crew = require('../controllers/crewController');

router.get('/', requireManagerAuth, crew.listCrews);
router.post('/', requireManagerAuth, crew.createCrew);
router.get('/notifications', requireManagerAuth, crew.listNotifications);
router.get('/available-operatives', requireManagerAuth, crew.listAvailableOperatives);
router.get('/for-user/:userId', requireManagerAuth, crew.operativeCrews);
router.get('/:id', requireManagerAuth, crew.getCrew);
router.patch('/:id', requireManagerAuth, crew.updateCrew);
router.post('/:id/members', requireManagerAuth, crew.addCrewMembers);
router.delete('/:id/members/:userId', requireManagerAuth, crew.removeCrewMember);
router.get('/:id/activity', requireManagerAuth, crew.crewActivitySummary);

module.exports = router;
