/**
 * Projects API per Proconix spec.
 * Manager-only: list, create, update, deactivate.
 * Manager or Operative: get one project (company / assigned project check in controller).
 */

const express = require('express');
const router = express.Router();
const { requireManagerAuth } = require('../middleware/requireManagerAuth');
const { requireManagerOrOperativeAuth } = require('../middleware/requireManagerOrOperativeAuth');
const {
  create,
  list,
  getOne,
  update,
  deactivate,
  getAssignments,
  assign,
  removeAssignment,
} = require('../controllers/projectsController');

router.post('/create', requireManagerAuth, create);
router.get('/list', requireManagerAuth, list);
router.get('/:id/assignments', requireManagerAuth, getAssignments);
router.post('/:id/assign', requireManagerAuth, assign);
router.delete('/assignment/:assignmentId', requireManagerAuth, removeAssignment);
router.get('/:id', requireManagerOrOperativeAuth, getOne);
router.put('/:id/update', requireManagerAuth, update);
router.put('/:id/deactivate', requireManagerAuth, deactivate);

module.exports = router;
