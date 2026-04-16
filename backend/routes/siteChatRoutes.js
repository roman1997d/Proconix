const express = require('express');
const router = express.Router();
const { requireManagerOrOperativeAuth } = require('../middleware/requireManagerOrOperativeAuth');
const { uploadDocumentFile, injectFileUrl } = require('../utils/uploadMiddleware');
const ctrl = require('../controllers/siteChatController');

router.get('/room', requireManagerOrOperativeAuth, ctrl.getRoom);
router.get('/messages', requireManagerOrOperativeAuth, ctrl.listMessages);
router.post('/messages', requireManagerOrOperativeAuth, uploadDocumentFile, injectFileUrl('documents'), ctrl.postMessage);
router.get('/notifications', requireManagerOrOperativeAuth, ctrl.listNotifications);
router.patch('/notifications/read-all', requireManagerOrOperativeAuth, ctrl.markNotificationsRead);

module.exports = router;

