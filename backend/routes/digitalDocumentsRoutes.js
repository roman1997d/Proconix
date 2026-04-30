/**
 * Digital documents & signatures — /api/documents
 * Manager: upload, fields, assign, list, get, audit, delete
 * Operative: inbox, get assigned document, sign
 */

const express = require('express');
const router = express.Router();
const { requireManagerAuth } = require('../middleware/requireManagerAuth');
const { requireOperativeAuth } = require('../middleware/requireOperativeAuth');
const { resolveCompanyDocsDir, resolveCompanyDocsDirForDocument } = require('../middleware/resolveCompanyDocsDir');
const { uploadPdf } = require('../utils/digitalDocumentsUpload');
const ctrl = require('../controllers/digitalDocumentsController');

function handleUploadError(err, req, res, next) {
  if (!err) return next();
  if (err.message && (err.message.includes('Only PDF') || err.message.includes('PDF'))) {
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'File too large (max 25 MB).' });
  }
  return next(err);
}

router.get('/operative/inbox', requireOperativeAuth, ctrl.operativeInbox);
router.get('/operative/document/:id', requireOperativeAuth, ctrl.getOneOperative);
router.post('/:id/sign', requireOperativeAuth, resolveCompanyDocsDirForDocument, ctrl.sign);
router.post('/:id/manager-sign', requireManagerAuth, resolveCompanyDocsDir, ctrl.managerInPersonSign);

router.get('/', requireManagerAuth, ctrl.list);
router.post(
  '/upload',
  requireManagerAuth,
  resolveCompanyDocsDir,
  uploadPdf,
  handleUploadError,
  ctrl.uploadDocument
);
router.patch('/:id/fields', requireManagerAuth, ctrl.patchFields);
router.post('/:id/assign', requireManagerAuth, ctrl.assign);
router.post('/:id/reset', requireManagerAuth, ctrl.resetDocument);
router.get('/:id/signed-pdf', requireManagerAuth, ctrl.downloadSignedPdf);
router.post('/:id/email-signed', requireManagerAuth, ctrl.emailSignedPdf);
router.get('/:id/audit', requireManagerAuth, ctrl.getAudit);
router.delete('/:id', requireManagerAuth, ctrl.remove);
router.get('/:id', requireManagerAuth, ctrl.getOne);

module.exports = router;
