/**
 * Site Snags API — manager-only, company-scoped workspace.
 */

const express = require('express');
const router = express.Router();
const { requireManagerAuth } = require('../middleware/requireManagerAuth');
const { getWorkspace, putWorkspace } = require('../controllers/siteSnagsController');

router.get('/workspace', requireManagerAuth, getWorkspace);
router.put('/workspace', requireManagerAuth, putWorkspace);

module.exports = router;
