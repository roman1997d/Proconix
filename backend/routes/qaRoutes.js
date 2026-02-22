/**
 * Quality Assurance API routes.
 * Base path: /api (so GET /api/templates, GET /api/jobs?projectId=, etc.)
 * All routes require manager auth (X-Manager-Id, X-Manager-Email).
 */

const express = require('express');
const router = express.Router();
const { requireManagerAuth } = require('../middleware/requireManagerAuth');
const qa = require('../controllers/qaController');

// Personnel (supervisors + workers for manager's company) – before /templates
router.get('/personnel', requireManagerAuth, qa.getPersonnel);

// Templates
router.get('/templates', requireManagerAuth, qa.listTemplates);
router.get('/templates/:id', requireManagerAuth, qa.getTemplate);
router.post('/templates', requireManagerAuth, qa.createTemplate);
router.put('/templates/:id', requireManagerAuth, qa.updateTemplate);
router.delete('/templates/:id', requireManagerAuth, qa.deleteTemplate);

// Jobs – next-number before :id so it is matched literally
router.get('/jobs/next-number', requireManagerAuth, qa.getNextJobNumber);
router.get('/jobs', requireManagerAuth, qa.listJobs);
router.get('/jobs/:id', requireManagerAuth, qa.getJob);
router.post('/jobs', requireManagerAuth, qa.createJob);
router.put('/jobs/:id', requireManagerAuth, qa.updateJob);
router.delete('/jobs/:id', requireManagerAuth, qa.deleteJob);

module.exports = router;
