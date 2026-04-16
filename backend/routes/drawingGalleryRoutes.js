/**
 * Drawing Gallery — /api/drawing-gallery
 */

const express = require('express');
const router = express.Router();
const { requireManagerAuth } = require('../middleware/requireManagerAuth');
const { requireManagerOrOperativeAuth } = require('../middleware/requireManagerOrOperativeAuth');
const { resolveCompanyDocsDir } = require('../middleware/resolveCompanyDocsDir');
const { drawingGalleryProjectForManagerUpload } = require('../middleware/drawingGalleryProjectMiddleware');
const { drawingFileUpload } = require('../utils/drawingGalleryUpload');
const ctrl = require('../controllers/drawingGalleryController');

function handleUploadError(err, req, res, next) {
  if (!err) return next();
  if (err.message && (err.message.includes('Allowed:') || err.message.includes('Drawing upload'))) {
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'File too large (max 50 MB).' });
  }
  return next(err);
}

router.get('/projects/:projectId/series', requireManagerOrOperativeAuth, ctrl.listSeries);
router.get('/projects/:projectId/disciplines', requireManagerOrOperativeAuth, ctrl.listDisciplines);
router.get(
  '/projects/:projectId/disciplines/:discipline/categories',
  requireManagerOrOperativeAuth,
  ctrl.listCategoriesByDiscipline
);
router.get(
  '/projects/:projectId/disciplines/:discipline/categories/:category/drawings',
  requireManagerOrOperativeAuth,
  ctrl.listDrawingsByCategory
);
router.get('/series/:seriesId', requireManagerOrOperativeAuth, ctrl.getSeriesDetail);

router.post(
  '/projects/:projectId/upload',
  requireManagerAuth,
  resolveCompanyDocsDir,
  drawingGalleryProjectForManagerUpload,
  drawingFileUpload,
  handleUploadError,
  ctrl.uploadDrawing
);

router.get('/versions/:versionId/file', requireManagerOrOperativeAuth, ctrl.downloadVersionFile);
router.get('/versions/:versionId/meta', requireManagerOrOperativeAuth, ctrl.getVersionMeta);
router.post('/versions/:versionId/public-share', requireManagerOrOperativeAuth, ctrl.createPublicShareLink);

router.get('/public/:token/meta', ctrl.getPublicVersionMeta);
router.get('/public/:token/file', ctrl.downloadPublicVersionFile);

router.get('/comments', requireManagerOrOperativeAuth, ctrl.listComments);
router.post('/comments', requireManagerOrOperativeAuth, ctrl.postComment);

router.get('/notifications', requireManagerOrOperativeAuth, ctrl.listNotifications);
router.patch('/notifications/:id/read', requireManagerOrOperativeAuth, ctrl.markNotificationRead);

module.exports = router;
