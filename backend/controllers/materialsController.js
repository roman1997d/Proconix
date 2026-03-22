/**
 * Material Management API.
 * All routes require manager auth. Data scoped by manager's company_id.
 * Audit: created_by_id/name, updated_by_id/name, deleted_at/deleted_by.
 */

const { pool } = require('../db/pool');

function getCompanyId(req) {
  if (req.manager && req.manager.company_id != null) return req.manager.company_id;
  return null;
}

function getManagerDisplayName(manager) {
  if (!manager) return '';
  const n = [manager.name, manager.surname].filter(Boolean).join(' ').trim();
  return n || manager.name || manager.email || '';
}

/** Today's date (YYYY-MM-DD) in server local time for consumption snapshot */
function getTodayDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Record or update daily snapshot in material_consumption (after create/update material). */
async function recordConsumptionSnapshot(materialId, projectId, companyId, quantityRemaining) {
  const today = getTodayDate();
  try {
    await pool.query(
      `INSERT INTO material_consumption (material_id, project_id, company_id, snapshot_date, quantity_remaining)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (material_id, snapshot_date) DO UPDATE SET quantity_remaining = $5, recorded_at = NOW()`,
      [materialId, projectId, companyId, today, quantityRemaining]
    );
  } catch (err) {
    if (err.code !== '42P01') console.error('recordConsumptionSnapshot:', err);
  }
}

/** GET /api/materials/projects */
async function getProjects(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }
  try {
    let result;
    try {
      result = await pool.query(
        `SELECT id, project_name, address FROM projects WHERE company_id = $1 AND (active IS NULL OR active = true) ORDER BY id`,
        [companyId]
      );
      return res.json({
        success: true,
        projects: result.rows.map((r) => ({
          id: r.id,
          name: r.project_name || '',
          address: r.address || '',
        })),
      });
    } catch (e) {
      if (e.code === '42703' || e.code === '42P01') {
        result = await pool.query(
          `SELECT id, name, address FROM projects WHERE company_id = $1 ORDER BY id`,
          [companyId]
        );
        return res.json({
          success: true,
          projects: result.rows.map((r) => ({
            id: r.id,
            name: r.name || '',
            address: r.address || '',
          })),
        });
      }
      throw e;
    }
  } catch (err) {
    console.error('materials getProjects:', err);
    return res.status(500).json({ message: err.message || 'Failed to load projects.' });
  }
}

/** GET /api/materials/categories */
async function getCategories(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  try {
    const result = await pool.query(
      `SELECT id, name, description FROM material_categories WHERE company_id = $1 AND deleted_at IS NULL ORDER BY name`,
      [companyId]
    );
    return res.json(result.rows.map((r) => ({ id: r.id, name: r.name || '', description: r.description || '' })));
  } catch (err) {
    if (err.code === '42P01') {
      return res.json([]);
    }
    console.error('materials getCategories:', err);
    return res.status(500).json({ message: err.message || 'Failed to load categories.' });
  }
}

/** POST /api/materials/categories */
async function createCategory(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  const body = req.body || {};
  const name = (body.name && String(body.name).trim()) || '';
  const description = (body.description && String(body.description).trim()) || null;
  if (!name) {
    return res.status(400).json({ message: 'Category name is required.' });
  }
  const createdByName = getManagerDisplayName(req.manager);
  const createdById = req.manager.id;
  try {
    const result = await pool.query(
      `INSERT INTO material_categories (company_id, name, description, created_by_id, created_by_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, description`,
      [companyId, name, description, createdById, createdByName]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ message: 'Material tables not set up. Run scripts/create_material_tables.sql' });
    }
    console.error('materials createCategory:', err);
    return res.status(500).json({ message: err.message || 'Failed to create category.' });
  }
}

/** PUT /api/materials/categories/:id */
async function updateCategory(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  const id = req.params.id;
  const body = req.body || {};
  const name = (body.name && String(body.name).trim()) || '';
  const description = (body.description && String(body.description).trim()) || null;
  if (!id) {
    return res.status(400).json({ message: 'Category id is required.' });
  }
  if (!name) {
    return res.status(400).json({ message: 'Category name is required.' });
  }
  const updatedByName = getManagerDisplayName(req.manager);
  const updatedById = req.manager.id;
  try {
    const result = await pool.query(
      `UPDATE material_categories
       SET name = $1,
           description = $2,
           updated_at = NOW(),
           updated_by_id = $3,
           updated_by_name = $4
       WHERE id = $5 AND company_id = $6 AND deleted_at IS NULL
       RETURNING id, name, description`,
      [name, description, updatedById, updatedByName, id, companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Category not found.' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ message: 'Material tables not set up. Run scripts/create_material_tables.sql' });
    }
    console.error('materials updateCategory:', err);
    return res.status(500).json({ message: err.message || 'Failed to update category.' });
  }
}

/** DELETE /api/materials/categories/:id (soft delete) */
async function deleteCategory(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  const id = req.params.id;
  if (!id) {
    return res.status(400).json({ message: 'Category id is required.' });
  }
  const deletedByName = getManagerDisplayName(req.manager);
  const deletedById = req.manager.id;
  try {
    const result = await pool.query(
      `UPDATE material_categories
       SET deleted_at = NOW(),
           deleted_by_id = $1,
           deleted_by_name = $2
       WHERE id = $3 AND company_id = $4 AND deleted_at IS NULL
       RETURNING id`,
      [deletedById, deletedByName, id, companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Category not found.' });
    }
    return res.status(204).send();
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ message: 'Material tables not set up. Run scripts/create_material_tables.sql' });
    }
    console.error('materials deleteCategory:', err);
    return res.status(500).json({ message: err.message || 'Failed to delete category.' });
  }
}

/** GET /api/materials/suppliers */
async function getSuppliers(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  try {
    const result = await pool.query(
      `SELECT id, name, contact, email_phone, address FROM material_suppliers WHERE company_id = $1 AND deleted_at IS NULL ORDER BY name`,
      [companyId]
    );
    return res.json(
      result.rows.map((r) => ({
        id: r.id,
        name: r.name || '',
        contact: r.contact || '',
        emailPhone: r.email_phone || '',
        address: r.address || '',
      }))
    );
  } catch (err) {
    if (err.code === '42P01') {
      return res.json([]);
    }
    console.error('materials getSuppliers:', err);
    return res.status(500).json({ message: err.message || 'Failed to load suppliers.' });
  }
}

/** POST /api/materials/suppliers */
async function createSupplier(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  const body = req.body || {};
  const name = (body.name && String(body.name).trim()) || '';
  const contact = (body.contact && String(body.contact).trim()) || null;
  const emailPhone = (body.emailPhone && String(body.emailPhone).trim()) || null;
  const address = (body.address && String(body.address).trim()) || null;
  if (!name) {
    return res.status(400).json({ message: 'Supplier name is required.' });
  }
  const createdByName = getManagerDisplayName(req.manager);
  const createdById = req.manager.id;
  try {
    const result = await pool.query(
      `INSERT INTO material_suppliers (company_id, name, contact, email_phone, address, created_by_id, created_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, contact, email_phone, address`,
      [companyId, name, contact, emailPhone, address, createdById, createdByName]
    );
    const r = result.rows[0];
    return res.status(201).json({
      id: r.id,
      name: r.name || '',
      contact: r.contact || '',
      emailPhone: r.email_phone || '',
      address: r.address || '',
    });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ message: 'Material tables not set up. Run scripts/create_material_tables.sql' });
    }
    console.error('materials createSupplier:', err);
    return res.status(500).json({ message: err.message || 'Failed to create supplier.' });
  }
}

/** PUT /api/materials/suppliers/:id */
async function updateSupplier(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  const id = req.params.id;
  const body = req.body || {};
  const name = (body.name && String(body.name).trim()) || '';
  const contact = (body.contact && String(body.contact).trim()) || null;
  const emailPhone = (body.emailPhone && String(body.emailPhone).trim()) || null;
  const address = (body.address && String(body.address).trim()) || null;
  if (!id) {
    return res.status(400).json({ message: 'Supplier id is required.' });
  }
  if (!name) {
    return res.status(400).json({ message: 'Supplier name is required.' });
  }
  const updatedByName = getManagerDisplayName(req.manager);
  const updatedById = req.manager.id;
  try {
    const result = await pool.query(
      `UPDATE material_suppliers
       SET name = $1,
           contact = $2,
           email_phone = $3,
           address = $4,
           updated_at = NOW(),
           updated_by_id = $5,
           updated_by_name = $6
       WHERE id = $7 AND company_id = $8 AND deleted_at IS NULL
       RETURNING id, name, contact, email_phone, address`,
      [name, contact, emailPhone, address, updatedById, updatedByName, id, companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Supplier not found.' });
    }
    const r = result.rows[0];
    return res.json({
      id: r.id,
      name: r.name || '',
      contact: r.contact || '',
      emailPhone: r.email_phone || '',
      address: r.address || '',
    });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ message: 'Material tables not set up. Run scripts/create_material_tables.sql' });
    }
    console.error('materials updateSupplier:', err);
    return res.status(500).json({ message: err.message || 'Failed to update supplier.' });
  }
}

/** DELETE /api/materials/suppliers/:id (soft delete) */
async function deleteSupplier(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  const id = req.params.id;
  if (!id) {
    return res.status(400).json({ message: 'Supplier id is required.' });
  }
  const deletedByName = getManagerDisplayName(req.manager);
  const deletedById = req.manager.id;
  try {
    const result = await pool.query(
      `UPDATE material_suppliers
       SET deleted_at = NOW(),
           deleted_by_id = $1,
           deleted_by_name = $2
       WHERE id = $3 AND company_id = $4 AND deleted_at IS NULL
       RETURNING id`,
      [deletedById, deletedByName, id, companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Supplier not found.' });
    }
    return res.status(204).send();
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ message: 'Material tables not set up. Run scripts/create_material_tables.sql' });
    }
    console.error('materials deleteSupplier:', err);
    return res.status(500).json({ message: err.message || 'Failed to delete supplier.' });
  }
}

function computeStatus(remaining, threshold) {
  const r = Number(remaining);
  if (r <= 0) return 'out';
  const t = threshold != null ? Number(threshold) : 0;
  if (t > 0 && r <= t) return 'low';
  return 'normal';
}

/** Ensure project belongs to manager's company */
async function assertProjectBelongsToCompany(projectId, companyId) {
  const r = await pool.query('SELECT id FROM projects WHERE id = $1 AND company_id = $2', [projectId, companyId]);
  if (r.rows.length === 0) {
    throw new Error('Project not found or access denied.');
  }
}

/** GET /api/materials?projectId= */
async function getMaterials(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  const projectId = req.query.projectId;
  if (!projectId) {
    return res.status(400).json({ message: 'projectId is required.' });
  }
  try {
    await assertProjectBelongsToCompany(projectId, companyId);
    const result = await pool.query(
      `SELECT m.id, m.name, m.category_id, m.supplier_id, m.unit,
              m.quantity_initial, m.quantity_used, m.quantity_remaining, m.low_stock_threshold, m.status, m.email_notify,
              c.name AS category_name, s.name AS supplier_name
       FROM materials m
       LEFT JOIN material_categories c ON c.id = m.category_id AND c.deleted_at IS NULL
       LEFT JOIN material_suppliers s ON s.id = m.supplier_id AND s.deleted_at IS NULL
       WHERE m.project_id = $1 AND m.company_id = $2 AND m.deleted_at IS NULL
       ORDER BY m.name`,
      [projectId, companyId]
    );
    const rows = result.rows.map((r) => ({
      id: r.id,
      name: r.name || '',
      categoryId: r.category_id,
      categoryName: r.category_name || '',
      supplierId: r.supplier_id,
      supplierName: r.supplier_name || '',
      unit: r.unit || 'kg',
      quantityInitial: Number(r.quantity_initial) || 0,
      quantityUsed: Number(r.quantity_used) || 0,
      quantityRemaining: Number(r.quantity_remaining) ?? Number(r.quantity_initial) - Number(r.quantity_used),
      lowStockThreshold: r.low_stock_threshold != null ? Number(r.low_stock_threshold) : null,
      status: r.status || 'normal',
      emailNotify: !!r.email_notify,
    }));
    return res.json(rows);
  } catch (err) {
    if (err.message === 'Project not found or access denied.') {
      return res.status(403).json({ message: err.message });
    }
    if (err.code === '42P01') {
      return res.json([]);
    }
    console.error('materials getMaterials:', err);
    return res.status(500).json({ message: err.message || 'Failed to load materials.' });
  }
}

/** POST /api/materials */
async function createMaterial(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  const body = req.body || {};
  const projectId = body.projectId != null ? parseInt(String(body.projectId), 10) : NaN;
  const name = (body.name && String(body.name).trim()) || '';
  const unit = (body.unit && String(body.unit).trim()) || 'kg';
  const quantityInitial = parseFloat(body.quantityInitial);
  const quantityUsed = 0;
  const quantityRemaining = Number.isFinite(quantityInitial) && quantityInitial >= 0 ? quantityInitial : 0;
  const lowStockThreshold = body.lowStockThreshold != null && body.lowStockThreshold !== '' ? parseFloat(body.lowStockThreshold) : null;
  const emailNotify = !!body.emailNotify;
  let categoryId = body.categoryId != null && body.categoryId !== '' ? parseInt(String(body.categoryId), 10) : null;
  let supplierId = body.supplierId != null && body.supplierId !== '' ? parseInt(String(body.supplierId), 10) : null;
  if (!Number.isInteger(projectId) || projectId < 1) {
    return res.status(400).json({ message: 'Valid projectId is required.' });
  }
  if (!name) {
    return res.status(400).json({ message: 'Material name is required.' });
  }
  if (!Number.isFinite(quantityInitial) || quantityInitial < 0) {
    return res.status(400).json({ message: 'Valid quantity is required.' });
  }
  if (Number.isNaN(categoryId) || categoryId < 1) categoryId = null;
  if (Number.isNaN(supplierId) || supplierId < 1) supplierId = null;

  const createdByName = getManagerDisplayName(req.manager);
  const createdById = req.manager.id;
  const status = computeStatus(quantityRemaining, lowStockThreshold);

  try {
    await assertProjectBelongsToCompany(projectId, companyId);
    const result = await pool.query(
      `INSERT INTO materials (
        project_id, company_id, name, category_id, supplier_id, unit,
        quantity_initial, quantity_used, quantity_remaining, low_stock_threshold, status, email_notify,
        created_by_id, created_by_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id, name, category_id, supplier_id, unit, quantity_initial, quantity_used, quantity_remaining, low_stock_threshold, status, email_notify`,
      [
        projectId,
        companyId,
        name,
        categoryId,
        supplierId,
        unit,
        quantityInitial,
        quantityUsed,
        quantityRemaining,
        lowStockThreshold,
        status,
        emailNotify,
        createdById,
        createdByName,
      ]
    );
    const r = result.rows[0];
    await recordConsumptionSnapshot(r.id, projectId, companyId, quantityRemaining);
    return res.status(201).json({
      id: r.id,
      name: r.name,
      categoryId: r.category_id,
      supplierId: r.supplier_id,
      unit: r.unit,
      quantityInitial: Number(r.quantity_initial),
      quantityUsed: Number(r.quantity_used),
      quantityRemaining: Number(r.quantity_remaining),
      lowStockThreshold: r.low_stock_threshold != null ? Number(r.low_stock_threshold) : null,
      status: r.status,
      emailNotify: !!r.email_notify,
    });
  } catch (err) {
    if (err.message === 'Project not found or access denied.') {
      return res.status(403).json({ message: err.message });
    }
    if (err.code === '42P01') {
      return res.status(503).json({ message: 'Material tables not set up. Run scripts/create_material_tables.sql' });
    }
    console.error('materials createMaterial:', err);
    return res.status(500).json({ message: err.message || 'Failed to create material.' });
  }
}

/** PUT /api/materials/:id */
async function updateMaterial(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ message: 'Invalid material id.' });
  }
  const body = req.body || {};
  const updatedByName = getManagerDisplayName(req.manager);
  const updatedById = req.manager.id;

  try {
    const existing = await pool.query(
      'SELECT id, project_id, name, category_id, supplier_id, unit, quantity_initial, quantity_used, quantity_remaining, low_stock_threshold, email_notify FROM materials WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL',
      [id, companyId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Material not found.' });
    }
    const row = existing.rows[0];

    let name = row.name || '';
    let categoryId = row.category_id;
    let supplierId = row.supplier_id;
    let unit = row.unit || 'kg';
    let quantityInitial = Number(row.quantity_initial);
    let quantityUsed = Number(row.quantity_used);
    let quantityRemaining = Number(row.quantity_remaining);
    let lowStockThreshold = row.low_stock_threshold != null ? Number(row.low_stock_threshold) : null;
    let emailNotify = row.email_notify;

    if (body.name !== undefined) name = String(body.name).trim() || name;
    if (body.categoryId !== undefined) categoryId = body.categoryId === '' || body.categoryId == null ? null : parseInt(String(body.categoryId), 10);
    if (body.supplierId !== undefined) supplierId = body.supplierId === '' || body.supplierId == null ? null : parseInt(String(body.supplierId), 10);
    if (body.unit !== undefined) unit = String(body.unit).trim() || 'kg';
    if (body.quantityInitial !== undefined) quantityInitial = parseFloat(body.quantityInitial);
    if (body.quantityUsed !== undefined) quantityUsed = parseFloat(body.quantityUsed);
    if (body.quantityRemaining !== undefined) quantityRemaining = parseFloat(body.quantityRemaining);
    if (body.lowStockThreshold !== undefined) lowStockThreshold = body.lowStockThreshold === '' || body.lowStockThreshold == null ? null : parseFloat(body.lowStockThreshold);
    if (body.emailNotify !== undefined) emailNotify = !!body.emailNotify;

    if (!Number.isFinite(quantityInitial) || quantityInitial < 0) quantityInitial = 0;
    if (!Number.isFinite(quantityUsed) || quantityUsed < 0) quantityUsed = 0;
    if (!Number.isFinite(quantityRemaining)) quantityRemaining = quantityInitial - quantityUsed;
    if (quantityRemaining < 0) quantityRemaining = 0;

    const status = computeStatus(quantityRemaining, lowStockThreshold);

    await pool.query(
      `UPDATE materials SET
        name = $1, category_id = $2, supplier_id = $3, unit = $4,
        quantity_initial = $5, quantity_used = $6, quantity_remaining = $7, low_stock_threshold = $8, status = $9, email_notify = $10,
        updated_at = NOW(), updated_by_id = $11, updated_by_name = $12
       WHERE id = $13 AND company_id = $14 AND deleted_at IS NULL`,
      [
        name,
        categoryId,
        supplierId,
        unit,
        quantityInitial,
        quantityUsed,
        quantityRemaining,
        lowStockThreshold,
        status,
        emailNotify,
        updatedById,
        updatedByName,
        id,
        companyId,
      ]
    );
    await recordConsumptionSnapshot(id, row.project_id, companyId, quantityRemaining);
    return res.status(200).json({
      id,
      name,
      categoryId,
      supplierId,
      unit,
      quantityInitial,
      quantityUsed,
      quantityRemaining,
      lowStockThreshold,
      status,
      emailNotify,
    });
  } catch (err) {
    console.error('materials updateMaterial:', err);
    return res.status(500).json({ message: err.message || 'Failed to update material.' });
  }
}

/** DELETE /api/materials/:id (soft delete) */
async function deleteMaterial(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ message: 'Invalid material id.' });
  }
  const deletedByName = getManagerDisplayName(req.manager);
  const deletedById = req.manager.id;
  try {
    const result = await pool.query(
      `UPDATE materials SET deleted_at = NOW(), deleted_by_id = $1, deleted_by_name = $2
       WHERE id = $3 AND company_id = $4 AND deleted_at IS NULL
       RETURNING id`,
      [deletedById, deletedByName, id, companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Material not found.' });
    }
    return res.status(204).send();
  } catch (err) {
    console.error('materials deleteMaterial:', err);
    return res.status(500).json({ message: err.message || 'Failed to delete material.' });
  }
}

/** GET /api/materials/forecast?projectId= – last week usage from material_consumption, this week = same as last week */
async function getForecast(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  const projectId = req.query.projectId;
  if (!projectId) {
    return res.json({ thisWeek: 0, lastWeek: 0 });
  }
  try {
    await assertProjectBelongsToCompany(projectId, companyId);
  } catch (err) {
    return res.status(403).json({ message: err.message });
  }
  try {
    const result = await pool.query(
      `WITH last_week_start AS (
         SELECT (date_trunc('week', current_date)::date - 7) AS monday
       ),
       snapshots AS (
         SELECT mc.material_id, mc.snapshot_date, mc.quantity_remaining
         FROM material_consumption mc
         WHERE mc.project_id = $1 AND mc.company_id = $2
           AND mc.snapshot_date >= (SELECT monday FROM last_week_start) - 1
           AND mc.snapshot_date <= (SELECT monday FROM last_week_start) + 6
       ),
       with_prev AS (
         SELECT
           material_id,
           snapshot_date,
           quantity_remaining AS curr_remaining,
           LAG(quantity_remaining) OVER (PARTITION BY material_id ORDER BY snapshot_date) AS prev_remaining
         FROM snapshots
       )
       SELECT COALESCE(SUM(prev_remaining - curr_remaining), 0)::numeric AS last_week_usage
       FROM with_prev
       WHERE prev_remaining IS NOT NULL AND curr_remaining IS NOT NULL
         AND snapshot_date >= (SELECT monday FROM last_week_start)`,
      [projectId, companyId]
    );
    const lastWeek = Number(result.rows[0]?.last_week_usage) || 0;
    const thisWeek = lastWeek;
    return res.json({ thisWeek, lastWeek });
  } catch (err) {
    if (err.code === '42P01') {
      return res.json({ thisWeek: 0, lastWeek: 0 });
    }
    console.error('materials getForecast:', err);
    return res.json({ thisWeek: 0, lastWeek: 0 });
  }
}

module.exports = {
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
};
