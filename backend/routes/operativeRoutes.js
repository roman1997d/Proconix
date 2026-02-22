/**
 * Operatives API – manager CRUD, login/set-password, and operative dashboard.
 */

const express = require('express');
const router = express.Router();
const { requireManagerAuth } = require('../middleware/requireManagerAuth');
const { requireOperativeAuth } = require('../middleware/requireOperativeAuth');
const {
  addOperative,
  listOperatives,
  updateOperative,
  deleteOperative,
  login,
  loginTemp,
  setPassword,
} = require('../controllers/operativeController');
const {
  getMe,
  clockIn,
  clockOut,
  workHoursStatus,
  workHoursWeekly,
  getCurrentProject,
  reportIssue,
  uploadDocument,
  getTasks,
  getMyWorkLogs,
  workLogUpload,
  createWorkLog,
} = require('../controllers/operativeDashboardController');
const { uploadIssueFile, uploadDocumentFile, uploadWorklogFile, injectFileUrl } = require('../utils/uploadMiddleware');

// ——— Manager-only (dashboard) ———
router.get('/', requireManagerAuth, listOperatives);
router.post('/add', requireManagerAuth, addOperative);
router.patch('/:id', requireManagerAuth, updateOperative);
router.delete('/:id', requireManagerAuth, deleteOperative);

// ——— Operative login (no auth) ———
router.post('/login', login);
router.post('/login-temp', loginTemp);
router.post('/set-password', setPassword);

// ——— Operative dashboard (require operative session) ———
router.get('/me', requireOperativeAuth, getMe);
router.post('/work-hours/clock-in', requireOperativeAuth, clockIn);
router.post('/work-hours/clock-out', requireOperativeAuth, clockOut);
router.get('/work-hours/status', requireOperativeAuth, workHoursStatus);
router.get('/work-hours/weekly', requireOperativeAuth, workHoursWeekly);
router.get('/project/current', requireOperativeAuth, getCurrentProject);
router.get('/tasks', requireOperativeAuth, getTasks);

router.post('/issues', requireOperativeAuth, uploadIssueFile, injectFileUrl('issues'), reportIssue);
router.post('/uploads', requireOperativeAuth, uploadDocumentFile, injectFileUrl('documents'), uploadDocument);

router.get('/work-log', requireOperativeAuth, getMyWorkLogs);
router.post('/work-log/upload', requireOperativeAuth, uploadWorklogFile, workLogUpload);
router.post('/work-log', requireOperativeAuth, createWorkLog);

module.exports = router;
