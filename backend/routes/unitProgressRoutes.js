/**
 * Unit Progress Tracking API — company-scoped workspace.
 */

const express = require('express');
const router = express.Router();
const { requireManagerAuth } = require('../middleware/requireManagerAuth');
const { requireSupervisorAuth } = require('../middleware/requireSupervisorAuth');
const {
  getWorkspace,
  putWorkspace,
  getWorkspaceSupervisor,
  putWorkspaceSupervisor,
  getPublicTimeline,
  getPrivateTimelineManager,
  getPrivateTimelineSupervisor,
  appendPrivateProgressManager,
  appendPrivateProgressSupervisor,
  requestDeleteUnitManager,
  confirmDeleteUnitManager,
  requestDeleteUnitSupervisor,
  confirmDeleteUnitSupervisor,
} = require('../controllers/unitProgressController');

router.get('/public-timeline/:unitId', getPublicTimeline);
router.get('/manager/private-timeline/:unitId', requireManagerAuth, getPrivateTimelineManager);
router.post('/manager/private-timeline/:unitId/progress', requireManagerAuth, appendPrivateProgressManager);
router.get('/supervisor/private-timeline/:unitId', requireSupervisorAuth, getPrivateTimelineSupervisor);
router.post('/supervisor/private-timeline/:unitId/progress', requireSupervisorAuth, appendPrivateProgressSupervisor);

router.get('/workspace', requireManagerAuth, getWorkspace);
router.put('/workspace', requireManagerAuth, putWorkspace);
router.post('/manager/delete-unit/request', requireManagerAuth, requestDeleteUnitManager);
router.post('/manager/delete-unit/confirm', requireManagerAuth, confirmDeleteUnitManager);

router.get('/supervisor/workspace', requireSupervisorAuth, getWorkspaceSupervisor);
router.put('/supervisor/workspace', requireSupervisorAuth, putWorkspaceSupervisor);
router.post('/supervisor/delete-unit/request', requireSupervisorAuth, requestDeleteUnitSupervisor);
router.post('/supervisor/delete-unit/confirm', requireSupervisorAuth, confirmDeleteUnitSupervisor);

module.exports = router;
