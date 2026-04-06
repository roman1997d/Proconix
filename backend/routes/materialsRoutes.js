/**
 * Material Management API routes.
 * Base path: /api/materials
 * All routes require manager auth (X-Manager-Id, X-Manager-Email).
 */

const express = require('express');
const router = express.Router();
const { requireManagerAuth } = require('../middleware/requireManagerAuth');
const { requireSupervisorAuth } = require('../middleware/requireSupervisorAuth');
const {
  getProjects,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  getMaterials,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  getForecast,
} = require('../controllers/materialsController');

router.get('/projects', requireManagerAuth, getProjects);
router.get('/categories', requireManagerAuth, getCategories);
router.post('/categories', requireManagerAuth, createCategory);
router.put('/categories/:id', requireManagerAuth, updateCategory);
router.delete('/categories/:id', requireManagerAuth, deleteCategory);
router.get('/suppliers', requireManagerAuth, getSuppliers);
router.post('/suppliers', requireManagerAuth, createSupplier);
router.put('/suppliers/:id', requireManagerAuth, updateSupplier);
router.delete('/suppliers/:id', requireManagerAuth, deleteSupplier);
router.get('/forecast', requireManagerAuth, getForecast);
router.get('/', requireManagerAuth, getMaterials);

// Supervisor (operative token): read-only, scoped to assigned project
router.get('/supervisor/projects', requireSupervisorAuth, getProjects);
router.get('/supervisor/categories', requireSupervisorAuth, getCategories);
router.get('/supervisor/suppliers', requireSupervisorAuth, getSuppliers);
router.get('/supervisor/forecast', requireSupervisorAuth, getForecast);
router.get('/supervisor', requireSupervisorAuth, getMaterials);
router.post('/', requireManagerAuth, createMaterial);
router.put('/:id', requireManagerAuth, updateMaterial);
router.delete('/:id', requireManagerAuth, deleteMaterial);

module.exports = router;
