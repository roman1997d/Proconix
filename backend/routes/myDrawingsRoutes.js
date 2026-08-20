/**
 * My Drawings — /api/my-drawings
 * Workers unlock with the access key. Admin key is required to change the catalog.
 */

const express = require('express');
const router = express.Router();
const { requireMyDrawingsPin, requireMyDrawingsAdmin } = require('../middleware/requireMyDrawingsPin');
const { uploadPdf } = require('../utils/myDrawingsUpload');
const ctrl = require('../controllers/myDrawingsController');

function handleUploadError(err, req, res, next) {
  if (!err) return next();
  if (err.message && (err.message.includes('Only PDF') || err.message.includes('Upload directory'))) {
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'File too large (max 50 MB).' });
  }
  return next(err);
}

router.post('/unlock', ctrl.unlock);
router.get('/catalog', requireMyDrawingsPin, ctrl.getCatalog);

router.post('/categories', requireMyDrawingsPin, requireMyDrawingsAdmin, ctrl.addCategory);
router.post('/categories/delete', requireMyDrawingsPin, requireMyDrawingsAdmin, ctrl.deleteCategory);

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

module.exports = router;
