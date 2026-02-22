/**
 * Work Logs API – manager only.
 */

const express = require('express');
const router = express.Router();
const { requireManagerAuth } = require('../middleware/requireManagerAuth');
const {
  list,
  workers,
  getOne,
  update,
  approve,
  reject,
  archive,
  archiveBulk,
  create,
} = require('../controllers/worklogsController');

router.get('/workers', requireManagerAuth, workers);
router.post('/archive-bulk', requireManagerAuth, archiveBulk);
router.post('/', requireManagerAuth, create);
router.get('/', requireManagerAuth, list);
router.get('/:id', requireManagerAuth, getOne);
router.patch('/:id', requireManagerAuth, update);
router.post('/:id/approve', requireManagerAuth, approve);
router.post('/:id/reject', requireManagerAuth, reject);
router.post('/:id/archive', requireManagerAuth, archive);

module.exports = router;
