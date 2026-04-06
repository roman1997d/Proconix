/**
 * Quality Assurance API for site supervisors (operative token).
 * Read templates; list/create/update jobs for assigned project only (no template mutations, no job delete).
 */

const express = require('express');
const router = express.Router();
const { requireSupervisorAuth } = require('../middleware/requireSupervisorAuth');
const qa = require('../controllers/qaController');

router.get('/personnel', requireSupervisorAuth, qa.getPersonnel);
router.get('/templates', requireSupervisorAuth, qa.listTemplates);
router.get('/templates/:id', requireSupervisorAuth, qa.getTemplate);
router.get('/jobs/next-number', requireSupervisorAuth, qa.getNextJobNumber);
router.get('/jobs', requireSupervisorAuth, qa.listJobs);
router.get('/jobs/:id', requireSupervisorAuth, qa.getJob);
router.post('/jobs', requireSupervisorAuth, qa.createJob);
router.put('/jobs/:id', requireSupervisorAuth, qa.updateJob);

module.exports = router;
