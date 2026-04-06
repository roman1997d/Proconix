/**
 * Planning API – manager-only (backend for Task_Planning module).
 */

const express = require('express');
const router = express.Router();
const { requireManagerAuth } = require('../middleware/requireManagerAuth');

const { requireSupervisorAuth } = require('../middleware/requireSupervisorAuth');
const { uploadTaskPhotoFile, injectFileUrl } = require('../utils/uploadMiddleware');
const {
  createPlan,
  upsertPlanTasks,
  patchPlanTask,
  deletePlanTask,
  listPlans,
  getPlanTaskConfirmationPhotos,
  listPlansForSupervisor,
  getPlanTaskConfirmationPhotosSupervisor,
  listProjectOperativesForSupervisor,
  patchPlanTaskSupervisor,
  uploadPlanTaskPhotoSupervisor,
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

// Supervisor (operative token): tasks on same project, updates, photos
router.get('/supervisor/list', requireSupervisorAuth, listPlansForSupervisor);
router.get('/supervisor/project-operatives', requireSupervisorAuth, listProjectOperativesForSupervisor);
router.patch('/supervisor/plan-tasks/:id', requireSupervisorAuth, patchPlanTaskSupervisor);
router.post(
  '/supervisor/plan-tasks/:id/photos',
  requireSupervisorAuth,
  uploadTaskPhotoFile,
  injectFileUrl('task-photos'),
  uploadPlanTaskPhotoSupervisor
);
router.get('/supervisor/plan-tasks/:id/confirmation-photos', requireSupervisorAuth, getPlanTaskConfirmationPhotosSupervisor);

module.exports = router;

