/**
 * Quality Assurance API for site supervisors (operative token).
 * Read templates; list/create/update jobs for assigned project only (no template mutations, no job delete).
 */

const express = require('express');
const router = express.Router();
const { requireSupervisorAuth } = require('../middleware/requireSupervisorAuth');
const { uploadTaskPhotoFile, injectFileUrl } = require('../utils/uploadMiddleware');
const qa = require('../controllers/qaController');

/** No auth — use to verify routing: GET /api/supervisor/qa/_ping */
router.get('/_ping', (req, res) => {
  res.json({ ok: true, service: 'supervisor-qa' });
});

router.get('/personnel', requireSupervisorAuth, qa.getPersonnel);
router.get('/templates', requireSupervisorAuth, qa.listTemplates);
router.get('/templates/:id', requireSupervisorAuth, qa.getTemplate);
router.get('/jobs/next-number', requireSupervisorAuth, qa.getNextJobNumber);
router.post('/jobs/preview-material-requirements', requireSupervisorAuth, qa.previewJobMaterialRequirements);
router.get('/jobs/:id/step-evidence', requireSupervisorAuth, qa.getJobStepEvidence);
router.put('/jobs/:id/step-comment', requireSupervisorAuth, qa.putJobStepComment);
router.post(
  '/jobs/:id/step-photos',
  requireSupervisorAuth,
  uploadTaskPhotoFile,
  injectFileUrl('task-photos'),
  qa.postJobStepPhoto
);
router.delete('/jobs/:id/step-photos/:photoId', requireSupervisorAuth, qa.deleteJobStepPhoto);
router.get('/jobs', requireSupervisorAuth, qa.listJobs);
router.get('/jobs/:id', requireSupervisorAuth, qa.getJob);
router.post('/jobs', requireSupervisorAuth, qa.createJob);
router.put('/jobs/:id', requireSupervisorAuth, qa.updateJob);

module.exports = router;
