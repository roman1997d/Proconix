/**
 * My Drawings — /api/my-drawings
 * Workers register with name + email, then a 4-digit key sent by email.
 * After verify, the device token stays signed in. Admin key is required to change the catalog.
 */

const express = require('express');
const router = express.Router();
const { requireMyDrawingsPin, requireMyDrawingsAdmin, requireMyDrawingsCompanyAdmin } = require('../middleware/requireMyDrawingsPin');
const { uploadPdf, uploadCompanyLogo, uploadWallTypeImage, uploadSpecRequestPdf } = require('../utils/myDrawingsUpload');
const ctrl = require('../controllers/myDrawingsController');

function handleUploadError(err, req, res, next) {
  if (!err) return next();
  if (err.message && (err.message.includes('Only PDF') || err.message.includes('Upload directory') || err.message.includes('Logo must') || err.message.includes('Construction detail'))) {
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'File too large.' });
  }
  return next(err);
}

router.post('/register', ctrl.registerWorker);
router.post('/login', ctrl.loginWorker);
router.post('/verify', ctrl.verifyWorker);
router.post('/auth/lookup', ctrl.lookupAuth);
router.post('/auth/request-code', ctrl.requestAuthCode);
router.post('/auth/verify', ctrl.verifyWorker);
router.post('/company-start', uploadCompanyLogo, handleUploadError, ctrl.startCompany);
router.post('/company-login', ctrl.companyLogin);
router.post('/company-forgot-password', ctrl.requestCompanyPasswordReset);
router.get('/company-reset-password', ctrl.previewCompanyPasswordReset);
router.post('/company-reset-password', ctrl.resetCompanyPassword);
router.post('/unlock', ctrl.unlock);
router.post('/logout', ctrl.logoutSession);
router.get('/catalog', requireMyDrawingsPin, ctrl.getCatalog);
router.get('/drawings', requireMyDrawingsPin, ctrl.listDrawings);
router.get('/activity', requireMyDrawingsPin, ctrl.getActivity);
router.get('/workers', requireMyDrawingsPin, requireMyDrawingsAdmin, ctrl.listWorkers);
router.post('/workers/:id/suspend', requireMyDrawingsPin, requireMyDrawingsAdmin, ctrl.suspendWorker);
router.post('/workers/:id/restore', requireMyDrawingsPin, requireMyDrawingsAdmin, ctrl.restoreWorker);
router.delete('/workers/:id', requireMyDrawingsPin, requireMyDrawingsAdmin, ctrl.deleteWorker);
router.post('/workers/:id/make-admin', requireMyDrawingsPin, requireMyDrawingsAdmin, ctrl.makeWorkerAdmin);
router.post('/workers/:id/remove-admin', requireMyDrawingsPin, requireMyDrawingsAdmin, ctrl.removeWorkerAdmin);
router.post('/access-code', requireMyDrawingsPin, requireMyDrawingsAdmin, ctrl.updateAccessCode);
router.get('/sites', requireMyDrawingsPin, requireMyDrawingsAdmin, ctrl.listSites);
router.post('/sites', requireMyDrawingsPin, requireMyDrawingsCompanyAdmin, ctrl.addSite);
router.put('/sites/:id', requireMyDrawingsPin, requireMyDrawingsCompanyAdmin, ctrl.renameSite);
router.put('/sites/:id/locations', requireMyDrawingsPin, requireMyDrawingsAdmin, ctrl.updateSiteLocations);
router.delete('/sites/:id', requireMyDrawingsPin, requireMyDrawingsCompanyAdmin, ctrl.deleteSite);
router.post('/devices/register', requireMyDrawingsPin, ctrl.registerDevice);
router.delete('/account', requireMyDrawingsPin, ctrl.deleteMyAccount);

router.post('/categories', requireMyDrawingsPin, requireMyDrawingsAdmin, ctrl.addCategory);
router.post('/categories/rename', requireMyDrawingsPin, requireMyDrawingsAdmin, ctrl.renameCategory);
router.post('/categories/reorder', requireMyDrawingsPin, requireMyDrawingsAdmin, ctrl.reorderCategories);

router.post(
  '/drawings',
  requireMyDrawingsPin,
  requireMyDrawingsAdmin,
  ctrl.prepareUploadDir,
  uploadPdf,
  handleUploadError,
  ctrl.addDrawing
);
router.put(
  '/drawings/:id',
  requireMyDrawingsPin,
  requireMyDrawingsAdmin,
  ctrl.prepareUploadDir,
  uploadPdf,
  handleUploadError,
  ctrl.editDrawing
);
router.post(
  '/drawings/:id/update',
  requireMyDrawingsPin,
  requireMyDrawingsAdmin,
  ctrl.prepareUploadDir,
  uploadPdf,
  handleUploadError,
  ctrl.updateDrawingFile
);
router.delete('/drawings/:id', requireMyDrawingsPin, requireMyDrawingsAdmin, ctrl.deleteDrawing);
router.get('/drawings/:id/file', requireMyDrawingsPin, ctrl.downloadFile);

router.get('/wall-types', requireMyDrawingsPin, ctrl.listWallTypes);
router.put('/wall-types/pack', requireMyDrawingsPin, requireMyDrawingsAdmin, ctrl.updateWallTypesPack);
router.post('/wall-types/seed-starter', requireMyDrawingsPin, requireMyDrawingsAdmin, ctrl.seedStarterWallTypes);
router.post(
  '/wall-types',
  requireMyDrawingsPin,
  requireMyDrawingsAdmin,
  uploadWallTypeImage,
  handleUploadError,
  ctrl.addWallType
);
router.put(
  '/wall-types/:id',
  requireMyDrawingsPin,
  requireMyDrawingsAdmin,
  uploadWallTypeImage,
  handleUploadError,
  ctrl.editWallType
);
router.delete('/wall-types/:id', requireMyDrawingsPin, requireMyDrawingsAdmin, ctrl.deleteWallType);
router.get('/wall-types/:id/image', requireMyDrawingsPin, ctrl.downloadWallTypeImage);
router.post(
  '/wall-types/spec-request',
  requireMyDrawingsPin,
  requireMyDrawingsAdmin,
  uploadSpecRequestPdf,
  handleUploadError,
  ctrl.sendSpecImportRequest
);

module.exports = router;
