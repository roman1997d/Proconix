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
} = require('../controllers/unitProgressController');

router.get('/workspace', requireManagerAuth, getWorkspace);
router.put('/workspace', requireManagerAuth, putWorkspace);

router.get('/supervisor/workspace', requireSupervisorAuth, getWorkspaceSupervisor);
router.put('/supervisor/workspace', requireSupervisorAuth, putWorkspaceSupervisor);

module.exports = router;
