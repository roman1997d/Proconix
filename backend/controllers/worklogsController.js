/**
 * Work Logs API: list, get one, update, approve, reject, archive.
 * Manager-only; scoped by company_id.
 */

const { pool } = require('../db/pool');

const VALID_STATUSES = ['pending', 'edited', 'waiting_worker', 'approved', 'rejected', 'completed'];

function getCompanyId(req) {
  if (req.manager && req.manager.company_id != null) return req.manager.company_id;
  return null;
}

function nextJobDisplayId(companyId) {
  return pool.query(
    `SELECT COALESCE(MAX(
      CASE WHEN job_display_id ~ '^WL-[0-9]+$'
        THEN NULLIF(REGEXP_REPLACE(job_display_id, '^WL-', ''), '')::INT
        ELSE 0
      END
    ), 0) + 1 AS n FROM work_logs WHERE company_id = $1`,
    [companyId]
  ).then(r => {
    const n = r.rows[0] && r.rows[0].n ? parseInt(r.rows[0].n, 10) : 1;
    return 'WL-' + String(n).padStart(3, '0');
  }).catch(() => Promise.resolve('WL-001'));
}

function parseJsonField(val, defaultVal) {
  if (val == null) return defaultVal;
  if (Array.isArray(val)) return val;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val || '[]'); } catch (_) { return defaultVal; }
}

function rowToJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    jobId: row.job_display_id,
    workerName: row.worker_name,
    project: row.project,
    block: row.block,
    floor: row.floor,
    apartment: row.apartment,
    zone: row.zone,
    workType: row.work_type,
    quantity: row.quantity != null ? Number(row.quantity) : null,
    unitPrice: row.unit_price != null ? Number(row.unit_price) : null,
    total: row.total != null ? Number(row.total) : null,
    status: row.status,
    description: row.description,
    photoUrls: parseJsonField(row.photo_urls, []),
    submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
    editHistory: parseJsonField(row.edit_history, []),
    workWasEdited: Boolean(row.work_was_edited),
    invoiceFilePath: row.invoice_file_path,
    archived: Boolean(row.archived),
  };
}

/**
 * GET /api/worklogs?worker=&dateFrom=&dateTo=&location=&status=&search=
 */
async function list(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(403).json({ success: false, message: 'Access denied. Company not found.' });
  }

  const worker = (req.query.worker && String(req.query.worker).trim()) || '';
  const dateFrom = (req.query.dateFrom && String(req.query.dateFrom).trim()) || '';
  const dateTo = (req.query.dateTo && String(req.query.dateTo).trim()) || '';
  const location = (req.query.location && String(req.query.location).trim()) || '';
  const status = (req.query.status && String(req.query.status).trim()) || '';
  const search = (req.query.search && String(req.query.search).trim()) || '';

  try {
    let query = `
      SELECT id, company_id, job_display_id, worker_name, project, block, floor, apartment, zone,
             work_type, quantity, unit_price, total, status, description, submitted_at,
             work_was_edited, edit_history, photo_urls, invoice_file_path, archived
      FROM work_logs
      WHERE company_id = $1 AND archived = false
    `;
    const params = [companyId];
    let idx = 2;

    if (worker) {
      query += ` AND worker_name = $${idx}`;
      params.push(worker);
      idx++;
    }
    if (status) {
      query += ` AND status = $${idx}`;
      params.push(status);
      idx++;
    }
    if (dateFrom) {
      query += ` AND submitted_at >= $${idx}::date`;
      params.push(dateFrom);
      idx++;
    }
    if (dateTo) {
      query += ` AND submitted_at <= ($${idx}::date + INTERVAL '1 day')`;
      params.push(dateTo);
      idx++;
    }
    if (location) {
      query += ` AND (
        LOWER(COALESCE(project,'') || ' ' || COALESCE(block,'') || ' ' || COALESCE(floor,'') || ' ' || COALESCE(apartment,'') || ' ' || COALESCE(zone,'')) LIKE $${idx}
      )`;
      params.push('%' + location.toLowerCase() + '%');
      idx++;
    }
    if (search) {
      query += ` AND (
        LOWER(COALESCE(job_display_id,'')) LIKE $${idx}
        OR LOWER(COALESCE(description,'')) LIKE $${idx}
      )`;
      params.push('%' + search.toLowerCase() + '%');
      idx++;
    }

    query += ` ORDER BY submitted_at DESC`;

    const result = await pool.query(query, params);
    const jobs = result.rows.map(rowToJob);
    return res.json({ success: true, jobs });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(200).json({ success: true, jobs: [] });
    }
    console.error('worklogsController list:', err);
    return res.status(500).json({ success: false, message: 'Failed to list work logs.' });
  }
}

/**
 * GET /api/worklogs/workers - distinct worker names for filter dropdown
 */
async function workers(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }

  try {
    const result = await pool.query(
      `SELECT DISTINCT worker_name FROM work_logs WHERE company_id = $1 AND archived = false ORDER BY worker_name`,
      [companyId]
    );
    const names = result.rows.map(r => r.worker_name).filter(Boolean);
    return res.json({ success: true, workers: names });
  } catch (err) {
    if (err.code === '42P01') return res.json({ success: true, workers: [] });
    console.error('worklogsController workers:', err);
    return res.status(500).json({ success: false, message: 'Failed to list workers.' });
  }
}

/**
 * GET /api/worklogs/:id
 */
async function getOne(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }

  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid job id.' });
  }

  try {
    const result = await pool.query(
      `SELECT id, company_id, job_display_id, worker_name, project, block, floor, apartment, zone,
              work_type, quantity, unit_price, total, status, description, submitted_at,
              work_was_edited, edit_history, photo_urls, invoice_file_path, archived
       FROM work_logs WHERE id = $1 AND company_id = $2`,
      [id, companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Job not found.' });
    }
    return res.json({ success: true, job: rowToJob(result.rows[0]) });
  } catch (err) {
    if (err.code === '42P01') return res.status(404).json({ success: false, message: 'Job not found.' });
    console.error('worklogsController getOne:', err);
    return res.status(500).json({ success: false, message: 'Failed to get job.' });
  }
}

/**
 * PATCH /api/worklogs/:id - update quantity, unit_price, total; append edit_history; set work_was_edited, status = waiting_worker
 */
async function update(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }

  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid job id.' });
  }

  const editor = req.manager.name && req.manager.surname
    ? `${req.manager.name} ${req.manager.surname}`.trim()
    : (req.manager.name || req.manager.email || 'Manager');
  const body = req.body || {};
  const quantity = body.quantity != null ? parseFloat(body.quantity) : null;
  const unitPrice = body.unitPrice != null ? parseFloat(body.unitPrice) : null;
  const total = body.total != null ? parseFloat(body.total) : null;

  try {
    const getResult = await pool.query(
      'SELECT id, quantity, unit_price, total, edit_history FROM work_logs WHERE id = $1 AND company_id = $2',
      [id, companyId]
    );
    if (getResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Job not found.' });
    }
    const row = getResult.rows[0];
    let editHistory = row.edit_history;
    if (typeof editHistory === 'string') editHistory = JSON.parse(editHistory || '[]');
    if (!Array.isArray(editHistory)) editHistory = [];

    const updates = [];
    const values = [];
    let vIdx = 1;

    if (quantity != null && Number(quantity) !== Number(row.quantity)) {
      editHistory.push({ field: 'quantity', oldVal: row.quantity, newVal: quantity, editor, at: new Date().toISOString() });
      updates.push(`quantity = $${vIdx}`);
      values.push(quantity);
      vIdx++;
    }
    if (unitPrice != null && Number(unitPrice) !== Number(row.unit_price)) {
      editHistory.push({ field: 'unitPrice', oldVal: row.unit_price, newVal: unitPrice, editor, at: new Date().toISOString() });
      updates.push(`unit_price = $${vIdx}`);
      values.push(unitPrice);
      vIdx++;
    }
    if (total != null && Number(total) !== Number(row.total)) {
      editHistory.push({ field: 'total', oldVal: row.total, newVal: total, editor, at: new Date().toISOString() });
      updates.push(`total = $${vIdx}`);
      values.push(total);
      vIdx++;
    }

    if (updates.length === 0) {
      const job = rowToJob(await pool.query('SELECT * FROM work_logs WHERE id = $1', [id]).then(r => r.rows[0]));
      return res.json({ success: true, job });
    }

    updates.push('work_was_edited = true', 'status = $' + vIdx, 'edit_history = $' + (vIdx + 1), 'updated_at = NOW()');
    values.push('waiting_worker', JSON.stringify(editHistory));
    const idPlaceholder = vIdx + 2;
    const companyPlaceholder = vIdx + 3;
    await pool.query(
      `UPDATE work_logs SET ${updates.join(', ')} WHERE id = $${idPlaceholder} AND company_id = $${companyPlaceholder}`,
      [...values, id, companyId]
    );

    const updated = await pool.query('SELECT * FROM work_logs WHERE id = $1', [id]);
    return res.json({ success: true, job: rowToJob(updated.rows[0]) });
  } catch (err) {
    console.error('worklogsController update:', err);
    return res.status(500).json({ success: false, message: 'Failed to update job.' });
  }
}

/**
 * POST /api/worklogs/:id/approve
 */
async function approve(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) return res.status(403).json({ success: false, message: 'Access denied.' });

  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, message: 'Invalid job id.' });

  try {
    const result = await pool.query(
      'UPDATE work_logs SET status = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3 RETURNING *',
      ['approved', id, companyId]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Job not found.' });
    return res.json({ success: true, job: rowToJob(result.rows[0]) });
  } catch (err) {
    console.error('worklogsController approve:', err);
    return res.status(500).json({ success: false, message: 'Failed to approve job.' });
  }
}

/**
 * POST /api/worklogs/:id/reject
 */
async function reject(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) return res.status(403).json({ success: false, message: 'Access denied.' });

  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, message: 'Invalid job id.' });

  try {
    const result = await pool.query(
      'UPDATE work_logs SET status = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3 RETURNING *',
      ['rejected', id, companyId]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Job not found.' });
    return res.json({ success: true, job: rowToJob(result.rows[0]) });
  } catch (err) {
    console.error('worklogsController reject:', err);
    return res.status(500).json({ success: false, message: 'Failed to reject job.' });
  }
}

/**
 * POST /api/worklogs/:id/archive
 */
async function archive(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) return res.status(403).json({ success: false, message: 'Access denied.' });

  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, message: 'Invalid job id.' });

  try {
    const result = await pool.query(
      'UPDATE work_logs SET archived = true, updated_at = NOW() WHERE id = $1 AND company_id = $2 RETURNING *',
      [id, companyId]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Job not found.' });
    return res.json({ success: true, job: rowToJob(result.rows[0]) });
  } catch (err) {
    console.error('worklogsController archive:', err);
    return res.status(500).json({ success: false, message: 'Failed to archive job.' });
  }
}

/**
 * POST /api/worklogs/archive-bulk - body: { jobIds: number[] }
 */
async function archiveBulk(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) return res.status(403).json({ success: false, message: 'Access denied.' });

  const jobIds = Array.isArray(req.body.jobIds) ? req.body.jobIds.map(id => parseInt(id, 10)).filter(id => Number.isInteger(id) && id > 0) : [];
  if (jobIds.length === 0) return res.status(400).json({ success: false, message: 'No valid job ids.' });

  try {
    const result = await pool.query(
      `UPDATE work_logs SET archived = true, updated_at = NOW()
       WHERE company_id = $1 AND id = ANY($2::int[])
       RETURNING id`,
      [companyId, jobIds]
    );
    return res.json({ success: true, archived: result.rows.length });
  } catch (err) {
    console.error('worklogsController archiveBulk:', err);
    return res.status(500).json({ success: false, message: 'Failed to archive jobs.' });
  }
}

/**
 * POST /api/worklogs - create a job (e.g. for seeding or operative submit)
 * Body: workerName, project?, block?, floor?, apartment?, zone?, workType?, quantity?, unitPrice?, total?, description?, photoUrls?, invoiceFilePath?
 */
async function create(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) return res.status(403).json({ success: false, message: 'Access denied.' });

  const b = req.body || {};
  const workerName = (b.workerName && String(b.workerName).trim()) || (b.worker_name && String(b.worker_name).trim()) || '';
  if (!workerName) return res.status(400).json({ success: false, message: 'Worker name is required.' });

  try {
    const jobDisplayId = await nextJobDisplayId(companyId);
    const quantity = b.quantity != null ? parseFloat(b.quantity) : null;
    const unitPrice = b.unitPrice != null ? parseFloat(b.unitPrice) : (b.unit_price != null ? parseFloat(b.unit_price) : null);
    const total = b.total != null ? parseFloat(b.total) : (quantity != null && unitPrice != null ? quantity * unitPrice : null);
    const photoUrls = Array.isArray(b.photoUrls) ? b.photoUrls : (b.photo_urls ? (Array.isArray(b.photo_urls) ? b.photo_urls : []) : []);
    const status = VALID_STATUSES.includes(b.status) ? b.status : 'pending';

    const result = await pool.query(
      `INSERT INTO work_logs (
        company_id, job_display_id, worker_name, project, block, floor, apartment, zone,
        work_type, quantity, unit_price, total, status, description, photo_urls, invoice_file_path
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id, job_display_id, worker_name, project, block, floor, apartment, zone,
        work_type, quantity, unit_price, total, status, description, submitted_at, work_was_edited, edit_history, photo_urls, invoice_file_path, archived`,
      [
        companyId, jobDisplayId, workerName,
        (b.project && String(b.project).trim()) || null,
        (b.block && String(b.block).trim()) || null,
        (b.floor != null ? String(b.floor) : null) || null,
        (b.apartment && String(b.apartment).trim()) || null,
        (b.zone && String(b.zone).trim()) || null,
        (b.workType && String(b.workType).trim()) || (b.work_type && String(b.work_type).trim()) || null,
        quantity, unitPrice, total, status,
        (b.description && String(b.description).trim()) || null,
        JSON.stringify(photoUrls),
        (b.invoiceFilePath && String(b.invoiceFilePath).trim()) || (b.invoice_file_path && String(b.invoice_file_path).trim()) || null,
      ]
    );
    return res.status(201).json({ success: true, job: rowToJob(result.rows[0]) });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(500).json({ success: false, message: 'Work logs table does not exist. Run scripts/create_work_logs_table.sql' });
    }
    console.error('worklogsController create:', err);
    return res.status(500).json({ success: false, message: 'Failed to create job.' });
  }
}

module.exports = {
  list,
  workers,
  getOne,
  update,
  approve,
  reject,
  archive,
  archiveBulk,
  create,
};
