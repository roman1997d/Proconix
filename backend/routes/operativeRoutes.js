/**
 * Operatives API – manager CRUD, login/set-password, and operative dashboard.
 */

const express = require('express');
const router = express.Router();
const { requireManagerAuth } = require('../middleware/requireManagerAuth');
const { requireOperativeAuth } = require('../middleware/requireOperativeAuth');
const {
  addOperative,
  getCompanySeatStatus,
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
  getTaskDetail,
  updateTaskStatus,
  uploadTaskConfirmationPhoto,
  getMyWorkLogs,
  workLogUpload,
  createWorkLog,
  sendWorkLogInvoiceCopy,
  archiveMyWorkLog,
  listQaAssignedJobsForOperative,
} = require('../controllers/operativeDashboardController');

const { generateTimesheetPdf, generateWorkReportPdf } = require('../controllers/pdfKitReportsController');
const {
  uploadIssueFile,
  uploadDocumentFile,
  uploadWorklogFile,
  uploadTaskPhotoFile,
  injectFileUrl,
} = require('../utils/uploadMiddleware');

// ——— Manager-only (dashboard) ———
router.get('/', requireManagerAuth, listOperatives);
router.get('/seat-status', requireManagerAuth, getCompanySeatStatus);
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
router.get('/qa/assigned-jobs', requireOperativeAuth, listQaAssignedJobsForOperative);
router.get('/tasks', requireOperativeAuth, getTasks);
router.get('/tasks/:taskId', requireOperativeAuth, getTaskDetail);
router.patch('/tasks/:taskId', requireOperativeAuth, updateTaskStatus);
router.post(
  '/tasks/:taskId/photos',
  requireOperativeAuth,
  uploadTaskPhotoFile,
  injectFileUrl('task-photos'),
  uploadTaskConfirmationPhoto
);

router.post('/issues', requireOperativeAuth, uploadIssueFile, injectFileUrl('issues'), reportIssue);
router.post('/uploads', requireOperativeAuth, uploadDocumentFile, injectFileUrl('documents'), uploadDocument);

router.get('/work-log', requireOperativeAuth, getMyWorkLogs);
router.post('/work-log/upload', requireOperativeAuth, uploadWorklogFile, workLogUpload);
router.post('/work-log', requireOperativeAuth, createWorkLog);
router.post('/work-log/:id/send-invoice-copy', requireOperativeAuth, sendWorkLogInvoiceCopy);
router.post('/work-log/:id/archive', requireOperativeAuth, archiveMyWorkLog);

// PDF generation (backend: PDFKit)
router.post('/timesheet/generate', requireOperativeAuth, generateTimesheetPdf);
router.post('/work-report/generate', requireOperativeAuth, generateWorkReportPdf);

module.exports = router;
