const express = require('express');
const router = express.Router();
const { requireManagerOrOperativeAuth } = require('../middleware/requireManagerOrOperativeAuth');
const { uploadDocumentFile, injectFileUrl } = require('../utils/uploadMiddleware');
const ctrl = require('../controllers/siteChatController');

router.get('/room', requireManagerOrOperativeAuth, ctrl.getRoom);
router.get('/messages', requireManagerOrOperativeAuth, ctrl.listMessages);
router.post('/messages', requireManagerOrOperativeAuth, uploadDocumentFile, injectFileUrl('documents'), ctrl.postMessage);
router.patch('/messages/:messageId/complete', requireManagerOrOperativeAuth, ctrl.completeMaterialRequest);
router.patch('/messages/:messageId/status', requireManagerOrOperativeAuth, ctrl.updateMaterialRequestStatus);
router.delete('/messages/:messageId', requireManagerOrOperativeAuth, ctrl.deleteOwnMessage);
router.post(
  '/messages/:messageId/photos',
  requireManagerOrOperativeAuth,
  uploadDocumentFile,
  injectFileUrl('documents'),
  ctrl.uploadMaterialRequestPhoto
);
router.get('/notifications', requireManagerOrOperativeAuth, ctrl.listNotifications);
router.patch('/notifications/read-all', requireManagerOrOperativeAuth, ctrl.markNotificationsRead);

module.exports = router;

