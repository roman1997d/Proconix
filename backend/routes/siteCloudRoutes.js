const express = require('express');
const { requireManagerAuth } = require('../middleware/requireManagerAuth');
const { resolveCompanyDocsDir } = require('../middleware/resolveCompanyDocsDir');
const { uploadCloudFile } = require('../utils/siteCloudUpload');
const ctrl = require('../controllers/siteCloudController');

const router = express.Router();

function handleUploadError(err, req, res, next) {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'File too large (max 50 MB).' });
  }
  return res.status(400).json({ success: false, message: err.message || 'Upload failed.' });
}

router.get('/files', requireManagerAuth, resolveCompanyDocsDir, ctrl.listFiles);
router.get('/folders', requireManagerAuth, resolveCompanyDocsDir, ctrl.listExtraFolders);
router.post('/folders', requireManagerAuth, resolveCompanyDocsDir, ctrl.createExtraFolder);
router.delete('/folders/:name', requireManagerAuth, resolveCompanyDocsDir, ctrl.deleteExtraFolder);
router.get('/stats', requireManagerAuth, resolveCompanyDocsDir, ctrl.getStats);
router.post(
  '/upload',
  requireManagerAuth,
  resolveCompanyDocsDir,
  (req, res, next) => {
    ctrl.ensureCloudDir(req);
    next();
  },
  uploadCloudFile,
  handleUploadError,
  ctrl.uploadFile
);
router.get('/files/:name/view', requireManagerAuth, resolveCompanyDocsDir, ctrl.viewFile);
router.get('/files/:name/download', requireManagerAuth, resolveCompanyDocsDir, ctrl.downloadFile);
router.post('/files/:name/share-link', requireManagerAuth, resolveCompanyDocsDir, ctrl.generateShareLink);
router.post('/files/:name/send-email', requireManagerAuth, resolveCompanyDocsDir, ctrl.sendFileByEmail);
router.get('/shared-links', requireManagerAuth, resolveCompanyDocsDir, ctrl.listSharedLinks);
router.delete('/shared-links/:token', requireManagerAuth, resolveCompanyDocsDir, ctrl.revokeSharedLink);
router.get('/deleted', requireManagerAuth, resolveCompanyDocsDir, ctrl.listDeletedFiles);
router.post('/deleted/:id/restore', requireManagerAuth, resolveCompanyDocsDir, ctrl.restoreDeletedFile);
router.delete('/deleted/:id/permanent', requireManagerAuth, resolveCompanyDocsDir, ctrl.permanentlyDeleteFile);
router.get('/share/:token', ctrl.downloadSharedFile);
router.get('/share/:token/view', ctrl.viewSharedFile);
router.delete('/files/:name', requireManagerAuth, resolveCompanyDocsDir, ctrl.removeFile);

module.exports = router;

