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
router.delete('/files/:name', requireManagerAuth, resolveCompanyDocsDir, ctrl.removeFile);

module.exports = router;

