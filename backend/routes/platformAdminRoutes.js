/**
 * Conflow platform administration API (operators), not company managers.
 */

const express = require('express');
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
} = require('../controllers/platformAdminController');
const {
  listPlatformUsers,
  getPlatformUser,
  updatePlatformUser,
  deletePlatformUser,
} = require('../controllers/platformUsersAdminController');
const { getSystemHealth, getServerLogStream, postLogTest } = require('../controllers/systemHealthAdminController');
const { requirePlatformAdminAuth } = require('../middleware/requirePlatformAdminAuth');

router.post('/login', login);
router.get('/me', requirePlatformAdminAuth, me);
router.get('/system-health', requirePlatformAdminAuth, getSystemHealth);
router.get('/server-log-stream', requirePlatformAdminAuth, getServerLogStream);
router.post('/log-test', requirePlatformAdminAuth, postLogTest);
router.post('/send-client-email', requirePlatformAdminAuth, sendClientEmail);
router.post('/create-demo-records', requirePlatformAdminAuth, createDemoRecords);
router.post('/send-demo-login-email', requirePlatformAdminAuth, sendDemoLoginEmail);
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

module.exports = router;
