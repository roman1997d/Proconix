/**
 * Proconix platform administration API (operators), not company managers.
 */

const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');
const router = express.Router();
const {
  login,
  me,
  listCompanies,
  listCompaniesStorageSummary,
  getCompany,
  updateCompany,
  deleteCompany,
  listBillingSubscriptions,
  updateBillingSubscription,
  sendClientEmail,
  createDemoRecords,
  sendDemoLoginEmail,
  createBackup,
  restoreBackup,
  listBackups,
  deleteBackup,
  verifyAdminPassword,
  verifyDataSystemOtp,
  restoreBackupFromServer,
  purgeSiteChatOlderThan,
} = require('../controllers/platformAdminController');
const {
  listPlatformUsers,
  getPlatformUser,
  updatePlatformUser,
  deletePlatformUser,
} = require('../controllers/platformUsersAdminController');
const { getSystemHealth, getServerLogStream, postLogTest } = require('../controllers/systemHealthAdminController');
const { requirePlatformAdminAuth } = require('../middleware/requirePlatformAdminAuth');
const restoreUploadDir = path.join(os.tmpdir(), 'proconix-restore-upload');
fs.mkdirSync(restoreUploadDir, { recursive: true });
const restoreUpload = multer({
  dest: restoreUploadDir,
  limits: { fileSize: 1024 * 1024 * 1024 * 2 },
});

router.post('/login', login);
router.get('/me', requirePlatformAdminAuth, me);
router.get('/system-health', requirePlatformAdminAuth, getSystemHealth);
router.get('/server-log-stream', requirePlatformAdminAuth, getServerLogStream);
router.post('/log-test', requirePlatformAdminAuth, postLogTest);
router.post('/send-client-email', requirePlatformAdminAuth, sendClientEmail);
router.post('/create-demo-records', requirePlatformAdminAuth, createDemoRecords);
router.post('/send-demo-login-email', requirePlatformAdminAuth, sendDemoLoginEmail);
router.post('/backup', requirePlatformAdminAuth, createBackup);
router.post('/restore', requirePlatformAdminAuth, restoreUpload.single('backup'), restoreBackup);
router.get('/backups', requirePlatformAdminAuth, listBackups);
router.delete('/backups/:filename', requirePlatformAdminAuth, deleteBackup);
router.post('/verify-password', requirePlatformAdminAuth, verifyAdminPassword);
router.post('/verify-otp', requirePlatformAdminAuth, verifyDataSystemOtp);
router.post('/restore-from-server', requirePlatformAdminAuth, restoreBackupFromServer);
router.get('/billing-subscriptions', requirePlatformAdminAuth, listBillingSubscriptions);
router.patch('/billing-subscriptions/:id', requirePlatformAdminAuth, updateBillingSubscription);
router.get('/platform-users', requirePlatformAdminAuth, listPlatformUsers);
router.get('/platform-users/:kind/:id', requirePlatformAdminAuth, getPlatformUser);
router.patch('/platform-users/:kind/:id', requirePlatformAdminAuth, updatePlatformUser);
router.delete('/platform-users/:kind/:id', requirePlatformAdminAuth, deletePlatformUser);
router.get('/companies/storage-summary', requirePlatformAdminAuth, listCompaniesStorageSummary);
router.get('/companies', requirePlatformAdminAuth, listCompanies);
router.get('/companies/:id', requirePlatformAdminAuth, getCompany);
router.patch('/companies/:id', requirePlatformAdminAuth, updateCompany);
router.delete('/companies/:id', requirePlatformAdminAuth, deleteCompany);
router.post('/site-chat/purge-older-than', requirePlatformAdminAuth, purgeSiteChatOlderThan);

module.exports = router;
