/**
 * Planning API – manager-only (backend for Task_Planning module).
 */

const express = require('express');
const router = express.Router();
const { requireManagerAuth } = require('../middleware/requireManagerAuth');

const { requireSupervisorAuth } = require('../middleware/requireSupervisorAuth');
const {
  createPlan,
  upsertPlanTasks,
  patchPlanTask,
  deletePlanTask,
  listPlans,
  getPlanTaskConfirmationPhotos,
  listPlansForSupervisor,
  getPlanTaskConfirmationPhotosSupervisor,
} = require('../controllers/planningController');

// Create plan
router.post('/plans', requireManagerAuth, createPlan);

// Replace/upsert tasks for a plan (batch)
router.post('/plan-tasks', requireManagerAuth, upsertPlanTasks);

// Patch one task
router.patch('/plan-tasks/:id', requireManagerAuth, patchPlanTask);

// Delete one task
router.delete('/plan-tasks/:id', requireManagerAuth, deletePlanTask);

// Operative-uploaded confirmation photos (read-only for manager)
router.get('/plan-tasks/:id/confirmation-photos', requireManagerAuth, getPlanTaskConfirmationPhotos);

// Optional listing (for future frontend integration)
router.get('/list', requireManagerAuth, listPlans);

// Supervisor (operative token): read-only filtered list + confirmation photos
router.get('/supervisor/list', requireSupervisorAuth, listPlansForSupervisor);
router.get('/supervisor/plan-tasks/:id/confirmation-photos', requireSupervisorAuth, getPlanTaskConfirmationPhotosSupervisor);

module.exports = router;

