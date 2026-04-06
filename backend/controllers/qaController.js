/**
 * Quality Assurance API – templates and jobs.
 * All routes require manager auth (requireManagerAuth).
 * Jobs are scoped to manager's company via project.company_id.
 */

const { pool } = require('../db/pool');

function getQaCompanyId(req) {
  if (req.manager && req.manager.company_id != null) return req.manager.company_id;
  if (req.supervisor && req.supervisor.company_id != null) return req.supervisor.company_id;
  return null;
}

/** If req.supervisor is set, projectId must match their assigned project. Returns error message or null. */
function supervisorProjectMismatch(req, projectIdNum) {
  if (!req.supervisor) return null;
  const sp = req.supervisor.project_id;
  if (sp == null) return 'No project assigned to your account.';
  const a = parseInt(String(sp), 10);
  const b = parseInt(String(projectIdNum), 10);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a !== b) return 'Access denied.';
  return null;
}

function getCreatedBy(req) {
  if (req.manager) {
    const n = [req.manager.name, req.manager.surname].filter(Boolean).join(' ').trim();
    return n || req.manager.email || '';
  }
  if (req.supervisor && req.supervisor.name) return String(req.supervisor.name).trim();
  return '';
}

// ---- Templates (scoped by logged-in company and selected project) ----

async function listTemplates(req, res) {
  const companyId = getQaCompanyId(req);
  if (companyId == null) return res.status(403).json({ message: 'Access denied.' });
  const projectId = req.query.projectId != null ? parseInt(String(req.query.projectId), 10) : NaN;
  if (!Number.isInteger(projectId) || projectId < 1) {
    return res.status(400).json({ message: 'projectId is required.' });
  }
  const supTplErr = supervisorProjectMismatch(req, projectId);
  if (supTplErr) return res.status(403).json({ message: supTplErr });
  try {
    const projectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND company_id = $2',
      [projectId, companyId]
    );
    if (projectCheck.rows.length === 0) {
      return res.status(403).json({ message: 'Project not found or access denied.' });
    }

    const stepsResult = await pool.query(
      `SELECT id, template_id, sort_order, description, price_per_m2 AS "pricePerM2",
              price_per_unit AS "pricePerUnit", price_per_linear AS "pricePerLinear",
              step_external_id
       FROM qa_template_steps ORDER BY template_id, sort_order, id`
    );
    const stepsByTpl = {};
    stepsResult.rows.forEach((row) => {
      const tid = String(row.template_id);
      if (!stepsByTpl[tid]) stepsByTpl[tid] = [];
      stepsByTpl[tid].push({
        id: row.step_external_id || String(row.id),
        description: row.description || '',
        pricePerM2: row.pricePerM2 || '',
        pricePerUnit: row.pricePerUnit || '',
        pricePerLinear: row.pricePerLinear || '',
      });
    });

    const tplResult = await pool.query(
      `SELECT id, name, created_at AS "createdAt", created_by AS "createdBy"
       FROM qa_templates
       WHERE company_id = $1 AND project_id = $2
       ORDER BY id`,
      [companyId, projectId]
    );
    const list = tplResult.rows.map((t) => ({
      id: String(t.id),
      name: t.name || '',
      steps: stepsByTpl[String(t.id)] || [],
      createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : null,
      createdBy: t.createdBy || '',
    }));
    return res.status(200).json(list);
  } catch (err) {
    console.error('QA listTemplates:', err);
    return res.status(500).json({ message: err.message || 'Failed to list templates.' });
  }
}

async function getTemplate(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ message: 'Invalid template id.' });
  }
  const companyId = getQaCompanyId(req);
  if (companyId == null) return res.status(403).json({ message: 'Access denied.' });
  try {
    const tpl = await pool.query(
      `SELECT id, name, project_id, created_at AS "createdAt", created_by AS "createdBy"
       FROM qa_templates WHERE id = $1 AND company_id = $2`,
      [id, companyId]
    );
    if (tpl.rows.length === 0) return res.status(404).json({ message: 'Template not found.' });
    if (req.supervisor) {
      const m = supervisorProjectMismatch(req, tpl.rows[0].project_id);
      if (m) return res.status(403).json({ message: m });
    }
    const row = tpl.rows[0];

    const steps = await pool.query(
      `SELECT id, step_external_id, description, price_per_m2 AS "pricePerM2",
              price_per_unit AS "pricePerUnit", price_per_linear AS "pricePerLinear"
       FROM qa_template_steps WHERE template_id = $1 ORDER BY sort_order, id`,
      [id]
    );
    const stepList = steps.rows.map((s) => ({
      id: s.step_external_id || String(s.id),
      description: s.description || '',
      pricePerM2: s.pricePerM2 || '',
      pricePerUnit: s.pricePerUnit || '',
      pricePerLinear: s.pricePerLinear || '',
    }));

    return res.status(200).json({
      id: String(row.id),
      name: row.name || '',
      steps: stepList,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      createdBy: row.createdBy || '',
    });
  } catch (err) {
    console.error('QA getTemplate:', err);
    return res.status(500).json({ message: err.message || 'Failed to get template.' });
  }
}

async function createTemplate(req, res) {
  const b = req.body || {};
  const name = (b.name && String(b.name).trim()) || '';
  const steps = Array.isArray(b.steps) ? b.steps : [];
  if (!name) return res.status(400).json({ message: 'Template name is required.' });
  const projectId = b.projectId != null ? parseInt(String(b.projectId), 10) : NaN;
  if (!Number.isInteger(projectId) || projectId < 1) {
    return res.status(400).json({ message: 'projectId is required.' });
  }
  const companyId = req.manager?.company_id;
  if (companyId == null) return res.status(403).json({ message: 'Access denied.' });

  const createdBy = getCreatedBy(req);

  try {
    const projectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND company_id = $2',
      [projectId, companyId]
    );
    if (projectCheck.rows.length === 0) {
      return res.status(403).json({ message: 'Project not found or access denied.' });
    }
    const insert = await pool.query(
      `INSERT INTO qa_templates (name, created_by, company_id, project_id) VALUES ($1, $2, $3, $4) RETURNING id, created_at, created_by`,
      [name, createdBy, companyId, projectId]
    );
    const templateId = insert.rows[0].id;
    const createdAt = insert.rows[0].created_at;

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i] || {};
      await pool.query(
        `INSERT INTO qa_template_steps (template_id, sort_order, description, price_per_m2, price_per_unit, price_per_linear, step_external_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          templateId,
          i,
          (s.description != null && String(s.description)) || '',
          (s.pricePerM2 != null && String(s.pricePerM2)) || '',
          (s.pricePerUnit != null && String(s.pricePerUnit)) || '',
          (s.pricePerLinear != null && String(s.pricePerLinear)) || '',
          (s.id && String(s.id)) || null,
        ]
      );
    }

    const stepsResult = await pool.query(
      `SELECT id, step_external_id, description, price_per_m2 AS "pricePerM2",
              price_per_unit AS "pricePerUnit", price_per_linear AS "pricePerLinear"
       FROM qa_template_steps WHERE template_id = $1 ORDER BY sort_order, id`,
      [templateId]
    );
    const stepList = stepsResult.rows.map((s) => ({
      id: s.step_external_id || String(s.id),
      description: s.description || '',
      pricePerM2: s.pricePerM2 || '',
      pricePerUnit: s.pricePerUnit || '',
      pricePerLinear: s.pricePerLinear || '',
    }));

    return res.status(201).json({
      id: String(templateId),
      name,
      steps: stepList,
      createdAt: createdAt ? new Date(createdAt).toISOString() : null,
      createdBy,
    });
  } catch (err) {
    console.error('QA createTemplate:', err);
    return res.status(500).json({ message: err.message || 'Failed to create template.' });
  }
}

async function updateTemplate(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ message: 'Invalid template id.' });
  }
  const companyId = req.manager?.company_id;
  if (companyId == null) return res.status(403).json({ message: 'Access denied.' });
  const b = req.body || {};
  const name = (b.name && String(b.name).trim()) || '';
  const steps = Array.isArray(b.steps) ? b.steps : [];
  if (!name) return res.status(400).json({ message: 'Template name is required.' });

  try {
    const existing = await pool.query(
      'SELECT id, created_at, created_by FROM qa_templates WHERE id = $1 AND company_id = $2',
      [id, companyId]
    );
    if (existing.rows.length === 0) return res.status(404).json({ message: 'Template not found.' });
    const createdBy = existing.rows[0].created_by;
    const createdAt = existing.rows[0].created_at;

    await pool.query(
      'UPDATE qa_templates SET name = $1, updated_at = NOW(), updated_by = $2 WHERE id = $3',
      [name, getCreatedBy(req), id]
    );
    await pool.query('DELETE FROM qa_template_steps WHERE template_id = $1', [id]);

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i] || {};
      await pool.query(
        `INSERT INTO qa_template_steps (template_id, sort_order, description, price_per_m2, price_per_unit, price_per_linear, step_external_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          i,
          (s.description != null && String(s.description)) || '',
          (s.pricePerM2 != null && String(s.pricePerM2)) || '',
          (s.pricePerUnit != null && String(s.pricePerUnit)) || '',
          (s.pricePerLinear != null && String(s.pricePerLinear)) || '',
          (s.id && String(s.id)) || null,
        ]
      );
    }

    const stepsResult = await pool.query(
      `SELECT id, step_external_id, description, price_per_m2 AS "pricePerM2",
              price_per_unit AS "pricePerUnit", price_per_linear AS "pricePerLinear"
       FROM qa_template_steps WHERE template_id = $1 ORDER BY sort_order, id`,
      [id]
    );
    const stepList = stepsResult.rows.map((s) => ({
      id: s.step_external_id || String(s.id),
      description: s.description || '',
      pricePerM2: s.pricePerM2 || '',
      pricePerUnit: s.pricePerUnit || '',
      pricePerLinear: s.pricePerLinear || '',
    }));

    return res.status(200).json({
      id: String(id),
      name,
      steps: stepList,
      createdAt: createdAt ? new Date(createdAt).toISOString() : null,
      createdBy: createdBy || '',
    });
  } catch (err) {
    console.error('QA updateTemplate:', err);
    return res.status(500).json({ message: err.message || 'Failed to update template.' });
  }
}

async function deleteTemplate(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ message: 'Invalid template id.' });
  }
  const companyId = req.manager?.company_id;
  if (companyId == null) return res.status(403).json({ message: 'Access denied.' });
  try {
    const r = await pool.query('DELETE FROM qa_templates WHERE id = $1 AND company_id = $2 RETURNING id', [id, companyId]);
    if (r.rowCount === 0) return res.status(404).json({ message: 'Template not found.' });
    return res.status(204).send();
  } catch (err) {
    console.error('QA deleteTemplate:', err);
    return res.status(500).json({ message: err.message || 'Failed to delete template.' });
  }
}

// ---- Personnel from users table (company operatives/supervisors) ----

async function getPersonnel(req, res) {
  const companyId = getQaCompanyId(req);
  if (companyId == null) return res.status(403).json({ message: 'Access denied.' });

  try {
    const usersResult = await pool.query(
      `SELECT id, name, email, role FROM users WHERE company_id = $1 AND active = true ORDER BY name, email`,
      [companyId]
    );

    const supervisors = [];
    const workers = [];
    const roleCategory = (role) => (role && String(role).trim()) || 'other';

    usersResult.rows.forEach((r) => {
      const item = { id: String(r.id), name: (r.name && r.name.trim()) || r.email || String(r.id), category: roleCategory(r.role) };
      const isSupervisor = r.role && String(r.role).toLowerCase().includes('supervisor');
      if (isSupervisor) supervisors.push({ id: item.id, name: item.name });
      workers.push(item);
    });

    if (supervisors.length === 0) {
      usersResult.rows.forEach((r) => {
        supervisors.push({ id: String(r.id), name: (r.name && r.name.trim()) || r.email || String(r.id) });
      });
    }

    return res.status(200).json({ supervisors, workers });
  } catch (err) {
    console.error('QA getPersonnel:', err);
    return res.status(500).json({ message: err.message || 'Failed to load personnel.' });
  }
}

// ---- Helpers for jobs ----

async function getStatusIdByCode(code) {
  if (!code) return null;
  const r = await pool.query('SELECT id FROM qa_job_statuses WHERE code = $1', [String(code).toLowerCase()]);
  return r.rows.length ? r.rows[0].id : null;
}

async function getCostTypeIdByCode(code) {
  if (!code) return null;
  const r = await pool.query('SELECT id FROM qa_cost_types WHERE code = $1', [String(code).toLowerCase()]);
  return r.rows.length ? r.rows[0].id : null;
}

async function getFloorIdByCode(code) {
  if (!code) return null;
  const c = String(code).trim().toLowerCase();
  const r = await pool.query('SELECT id FROM qa_floors WHERE LOWER(code) = $1 AND project_id IS NULL LIMIT 1', [c]);
  return r.rows.length ? r.rows[0].id : null;
}

/** Ensure project belongs to manager's company */
async function assertProjectAccess(pool, projectId, companyId) {
  const r = await pool.query('SELECT id FROM projects WHERE id = $1 AND company_id = $2', [projectId, companyId]);
  if (r.rows.length === 0) throw new Error('Project not found or access denied.');
}

function jobRowToJson(row, templateIds, workerIds, floorCode, costCode, statusCode, responsibleUserId) {
  const responsibleId = responsibleUserId != null ? String(responsibleUserId) : (row.responsible_id != null ? String(row.responsible_id) : '');
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    jobNumber: row.job_number || '',
    floor: floorCode || row.floor_code || '',
    location: row.location || '',
    sqm: row.sqm || '',
    linearMeters: row.linear_meters || '',
    specification: row.specification || '',
    description: row.description || '',
    targetCompletionDate: row.target_completion_date ? row.target_completion_date.toISOString().slice(0, 10) : '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    createdBy: row.created_by || '',
    templateIds: templateIds || [],
    costIncluded: !!row.cost_included,
    costType: costCode || '',
    costValue: row.cost_value || '',
    responsibleId,
    workerIds: workerIds || [],
    status: statusCode || 'new',
  };
}

// ---- Jobs ----

async function listJobs(req, res) {
  const projectId = req.query.projectId;
  if (!projectId) return res.status(400).json({ message: 'projectId is required.' });
  const pid = parseInt(projectId, 10);
  if (!Number.isInteger(pid)) return res.status(400).json({ message: 'Invalid projectId.' });

  const companyId = getQaCompanyId(req);
  if (companyId == null) return res.status(403).json({ message: 'Access denied.' });
  const supJobErr = supervisorProjectMismatch(req, pid);
  if (supJobErr) return res.status(403).json({ message: supJobErr });

  try {
    await assertProjectAccess(pool, pid, companyId);
  } catch (e) {
    return res.status(403).json({ message: e.message || 'Access denied.' });
  }

  try {
    const jobs = await pool.query(
      `SELECT j.id, j.project_id, j.job_number, j.floor_id, j.floor_code, j.location, j.sqm, j.linear_meters,
              j.specification, j.description, j.target_completion_date, j.cost_included, j.cost_type_id,
              j.cost_value, j.responsible_id, j.responsible_user_id, j.status_id, j.created_at, j.created_by
       FROM qa_jobs j
       WHERE j.project_id = $1 ORDER BY j.job_number`,
      [pid]
    );

    const statusIds = [...new Set(jobs.rows.map((r) => r.status_id))].filter(Boolean);
    const costIds = [...new Set(jobs.rows.map((r) => r.cost_type_id))].filter(Boolean);
    const floorIds = [...new Set(jobs.rows.map((r) => r.floor_id))].filter(Boolean);

    let statusMap = {};
    let costMap = {};
    let floorMap = {};
    if (statusIds.length) {
      const sr = await pool.query('SELECT id, code FROM qa_job_statuses WHERE id = ANY($1)', [statusIds]);
      sr.rows.forEach((r) => { statusMap[r.id] = r.code; });
    }
    if (costIds.length) {
      const cr = await pool.query('SELECT id, code FROM qa_cost_types WHERE id = ANY($1)', [costIds]);
      cr.rows.forEach((r) => { costMap[r.id] = r.code; });
    }
    if (floorIds.length) {
      const fr = await pool.query('SELECT id, code FROM qa_floors WHERE id = ANY($1)', [floorIds]);
      fr.rows.forEach((r) => { floorMap[r.id] = r.code; });
    }

    const jobIds = jobs.rows.map((j) => j.id);
    const [tplLinks, workerUserLinks] = await Promise.all([
      jobIds.length ? pool.query('SELECT job_id, template_id FROM qa_job_templates WHERE job_id = ANY($1)', [jobIds]) : { rows: [] },
      jobIds.length ? pool.query('SELECT job_id, user_id FROM qa_job_user_workers WHERE job_id = ANY($1)', [jobIds]).catch(() => ({ rows: [] })) : { rows: [] },
    ]);
    const tplByJob = {};
    const workerByJob = {};
    tplLinks.rows.forEach((r) => {
      if (!tplByJob[r.job_id]) tplByJob[r.job_id] = [];
      tplByJob[r.job_id].push(String(r.template_id));
    });
    (workerUserLinks.rows || []).forEach((r) => {
      if (!workerByJob[r.job_id]) workerByJob[r.job_id] = [];
      workerByJob[r.job_id].push(String(r.user_id));
    });

    const list = jobs.rows.map((row) =>
      jobRowToJson(
        row,
        tplByJob[row.id] || [],
        workerByJob[row.id] || [],
        row.floor_id ? floorMap[row.floor_id] : null,
        row.cost_type_id ? costMap[row.cost_type_id] : null,
        row.status_id ? statusMap[row.status_id] : null,
        row.responsible_user_id
      )
    );
    return res.status(200).json(list);
  } catch (err) {
    console.error('QA listJobs:', err);
    return res.status(500).json({ message: err.message || 'Failed to list jobs.' });
  }
}

async function getJob(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ message: 'Invalid job id.' });
  }
  const companyId = getQaCompanyId(req);
  if (companyId == null) return res.status(403).json({ message: 'Access denied.' });

  try {
    const job = await pool.query(
      `SELECT j.id, j.project_id, j.job_number, j.floor_id, j.floor_code, j.location, j.sqm, j.linear_meters,
              j.specification, j.description, j.target_completion_date, j.cost_included, j.cost_type_id,
              j.cost_value, j.responsible_id, j.responsible_user_id, j.status_id, j.created_at, j.created_by
       FROM qa_jobs j
       INNER JOIN projects p ON p.id = j.project_id AND p.company_id = $1
       WHERE j.id = $2`,
      [companyId, id]
    );
    if (job.rows.length === 0) return res.status(404).json({ message: 'Job not found.' });
    if (req.supervisor) {
      const m = supervisorProjectMismatch(req, job.rows[0].project_id);
      if (m) return res.status(403).json({ message: m });
    }
    const row = job.rows[0];

    const [tplLinks, workerUserLinks, statusRow, costRow, floorRow] = await Promise.all([
      pool.query('SELECT template_id FROM qa_job_templates WHERE job_id = $1', [id]),
      pool.query('SELECT user_id FROM qa_job_user_workers WHERE job_id = $1', [id]).catch(() => ({ rows: [] })),
      row.status_id ? pool.query('SELECT code FROM qa_job_statuses WHERE id = $1', [row.status_id]) : { rows: [] },
      row.cost_type_id ? pool.query('SELECT code FROM qa_cost_types WHERE id = $1', [row.cost_type_id]) : { rows: [] },
      row.floor_id ? pool.query('SELECT code FROM qa_floors WHERE id = $1', [row.floor_id]) : { rows: [] },
    ]);
    const templateIds = tplLinks.rows.map((r) => String(r.template_id));
    const workerIds = (workerUserLinks.rows || []).map((r) => String(r.user_id));
    const statusCode = statusRow.rows[0] ? statusRow.rows[0].code : null;
    const costCode = costRow.rows[0] ? costRow.rows[0].code : null;
    const floorCode = floorRow.rows[0] ? floorRow.rows[0].code : row.floor_code;

    return res.status(200).json(
      jobRowToJson(row, templateIds, workerIds, floorCode, costCode, statusCode, row.responsible_user_id)
    );
  } catch (err) {
    console.error('QA getJob:', err);
    return res.status(500).json({ message: err.message || 'Failed to get job.' });
  }
}

async function getNextJobNumber(req, res) {
  const projectId = req.query.projectId;
  if (!projectId) return res.status(400).json({ message: 'projectId is required.' });
  const pid = parseInt(projectId, 10);
  if (!Number.isInteger(pid)) return res.status(400).json({ message: 'Invalid projectId.' });

  const companyId = getQaCompanyId(req);
  if (companyId == null) return res.status(403).json({ message: 'Access denied.' });
  const supNErr = supervisorProjectMismatch(req, pid);
  if (supNErr) return res.status(403).json({ message: supNErr });

  try {
    await assertProjectAccess(pool, pid, companyId);
    const r = await pool.query(
      `SELECT job_number FROM qa_jobs WHERE project_id = $1 ORDER BY id DESC LIMIT 1`,
      [pid]
    );
    let next = 1;
    if (r.rows.length > 0 && r.rows[0].job_number) {
      const m = /^J-0*(\d+)$/.exec(r.rows[0].job_number);
      if (m) next = parseInt(m[1], 10) + 1;
    }
    const jobNumber = 'J-' + String(next).padStart(6, '0');
    return res.status(200).json({ jobNumber });
  } catch (e) {
    return res.status(403).json({ message: e.message || 'Access denied.' });
  }
}

async function createJob(req, res) {
  const b = req.body || {};
  const projectId = b.projectId != null ? parseInt(String(b.projectId), 10) : NaN;
  if (!Number.isInteger(projectId)) return res.status(400).json({ message: 'projectId is required.' });

  const companyId = getQaCompanyId(req);
  if (companyId == null) return res.status(403).json({ message: 'Access denied.' });
  const supCErr = supervisorProjectMismatch(req, projectId);
  if (supCErr) return res.status(403).json({ message: supCErr });

  try {
    await assertProjectAccess(pool, projectId, companyId);
  } catch (e) {
    return res.status(403).json({ message: e.message || 'Access denied.' });
  }

  const jobNumber = (b.jobNumber && String(b.jobNumber).trim()) || null;
  const statusCode = (b.status && String(b.status)) || 'new';
  const statusId = await getStatusIdByCode(statusCode);
  if (!statusId) return res.status(400).json({ message: 'Invalid status.' });

  const costCode = b.costType || null;
  const costTypeId = costCode ? await getCostTypeIdByCode(costCode) : null;
  const floorRaw = b.floor != null ? String(b.floor).trim() : null;
  const floorId = floorRaw ? await getFloorIdByCode(floorRaw) : null;
  const createdBy = getCreatedBy(req);

  let finalJobNumber = jobNumber && String(jobNumber).trim() ? String(jobNumber).trim() : null;
  if (!finalJobNumber) {
    const r = await pool.query('SELECT job_number FROM qa_jobs WHERE project_id = $1 ORDER BY id DESC LIMIT 1', [projectId]);
    if (r.rows.length === 0) finalJobNumber = 'J-000001';
    else {
      const m = /^J-0*(\d+)$/.exec(r.rows[0].job_number);
      finalJobNumber = 'J-' + String((m ? parseInt(m[1], 10) : 0) + 1).padStart(6, '0');
    }
  }

  const responsibleUserId = b.responsibleId ? parseInt(String(b.responsibleId), 10) : null;
  const workerIds = Array.isArray(b.workerIds) ? b.workerIds : [];
  if (responsibleUserId != null || workerIds.length > 0) {
    const userIds = [responsibleUserId, ...workerIds].filter((x) => x != null && Number.isInteger(parseInt(String(x), 10)));
    if (userIds.length) {
      const check = await pool.query('SELECT id FROM users WHERE id = ANY($1) AND company_id = $2', [userIds, companyId]);
      const allowed = new Set(check.rows.map((r) => r.id));
      if (responsibleUserId != null && !allowed.has(responsibleUserId)) return res.status(400).json({ message: 'Responsible person must be from your company.' });
      for (const uid of workerIds) {
        const id = parseInt(String(uid), 10);
        if (Number.isInteger(id) && !allowed.has(id)) return res.status(400).json({ message: 'All workers must be from your company.' });
      }
    }
  }

  try {
    const insert = await pool.query(
      `INSERT INTO qa_jobs (
        project_id, job_number, floor_id, floor_code, location, sqm, linear_meters,
        specification, description, target_completion_date, cost_included, cost_type_id, cost_value,
        responsible_user_id, status_id, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id, project_id, job_number, floor_id, floor_code, location, sqm, linear_meters,
        specification, description, target_completion_date, cost_included, cost_type_id, cost_value,
        responsible_user_id, status_id, created_at, created_by`,
      [
        projectId,
        finalJobNumber,
        floorId,
        floorRaw || null,
        (b.location != null && String(b.location)) || null,
        (b.sqm != null && String(b.sqm)) || null,
        (b.linearMeters != null && String(b.linearMeters)) || null,
        (b.specification != null && String(b.specification)) || null,
        (b.description != null && String(b.description)) || null,
        b.targetCompletionDate || null,
        !!b.costIncluded,
        costTypeId,
        (b.costValue != null && String(b.costValue)) || null,
        responsibleUserId,
        statusId,
        createdBy,
      ]
    );
    const row = insert.rows[0];
    const jobId = row.id;

    const templateIds = Array.isArray(b.templateIds) ? b.templateIds : [];
    for (const tid of templateIds) {
      const t = parseInt(String(tid), 10);
      if (Number.isInteger(t)) await pool.query('INSERT INTO qa_job_templates (job_id, template_id) VALUES ($1, $2) ON CONFLICT (job_id, template_id) DO NOTHING', [jobId, t]);
    }
    for (const uid of workerIds) {
      const u = parseInt(String(uid), 10);
      if (Number.isInteger(u)) await pool.query('INSERT INTO qa_job_user_workers (job_id, user_id) VALUES ($1, $2) ON CONFLICT (job_id, user_id) DO NOTHING', [jobId, u]).catch(() => {});
    }

    const [tplLinks, workerUserLinks] = await Promise.all([
      pool.query('SELECT template_id FROM qa_job_templates WHERE job_id = $1', [jobId]),
      pool.query('SELECT user_id FROM qa_job_user_workers WHERE job_id = $1', [jobId]).catch(() => ({ rows: [] })),
    ]);
    const outTemplateIds = tplLinks.rows.map((r) => String(r.template_id));
    const outWorkerIds = (workerUserLinks.rows || []).map((r) => String(r.user_id));

    // --- Auto sync into Task & Planning (Gantt + Kanban) ---
    // Make QA jobs visible in Planning and keep them in sync on updates/deletes.
    try {
      const managerId =
        req.manager && req.manager.id
          ? req.manager.id
          : req.supervisor && req.supervisor.id
            ? req.supervisor.id
            : null;
      await syncPlanningForQaJob(companyId, jobId, managerId);
    } catch (err) {
      // Do not fail QA job creation; only log planning sync errors.
      console.error('Auto planning sync from QA createJob failed:', err);
    }

    return res.status(201).json(
      jobRowToJson(
        row,
        outTemplateIds,
        outWorkerIds,
        row.floor_id ? (await pool.query('SELECT code FROM qa_floors WHERE id = $1', [row.floor_id])).rows[0]?.code : row.floor_code,
        costCode,
        statusCode
      )
    );
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ message: 'Job number already exists for this project.' });
    console.error('QA createJob:', err);
    return res.status(500).json({ message: err.message || 'Failed to create job.' });
  }
}

async function syncPlanningForQaJob(companyId, qaJobId, managerId) {
  // Creates/updates a Planning daily plan + a Planning task so the QA job is visible
  // on Gantt + Kanban.
  //
  // Requires:
  // - planning_plans, planning_plan_tasks
  // - planning_plan_tasks.qa_job_id (set by migration)

  const toYmdLocal = (d) => {
    if (!d) return null;
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return null;
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const dbDateToYmd = (v) => {
    if (!v) return null;
    if (v instanceof Date) {
      if (Number.isNaN(v.getTime())) return null;
      return toYmdLocal(v);
    }
    // Assume string-ish DB DATE -> "YYYY-MM-DD"
    var s = String(v).slice(0, 10);
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) {
      return `${m[1]}-${m[2]}-${m[3]}`;
    }
    // Fallback parse
    const dt = new Date(v);
    if (Number.isNaN(dt.getTime())) return null;
    return toYmdLocal(dt);
  };

  // Load QA job with company-scoping + status code.
  const qaRes = await pool.query(
    `SELECT
        j.id,
        j.project_id,
        j.job_number,
        j.floor_code,
        j.location,
        j.specification,
        j.description,
        j.target_completion_date,
        j.responsible_user_id,
        j.status_id,
        j.created_at,
        s.code AS status_code
     FROM qa_jobs j
     INNER JOIN projects p ON p.id = j.project_id AND p.company_id = $1
     INNER JOIN qa_job_statuses s ON s.id = j.status_id
     WHERE j.id = $2`,
    [companyId, qaJobId]
  );

  if (!qaRes.rows.length) return { skipped: true };
  const qa = qaRes.rows[0];

  const deadlineYmdResolved = dbDateToYmd(qa.target_completion_date);
  const pickupYmdResolved = toYmdLocal(qa.created_at || new Date());

  if (!deadlineYmdResolved || !pickupYmdResolved) return { skipped: true };

  const planningStatus = qa.status_code === 'completed'
    ? 'completed'
    : qa.status_code === 'active'
      ? 'in_progress'
      : 'not_started';

  // Map assigned users -> names for planning (TEXT[]).
  const responsibleUid = qa.responsible_user_id != null ? parseInt(String(qa.responsible_user_id), 10) : null;
  const workerRes = await pool.query(
    `SELECT u.user_id
     FROM qa_job_user_workers u
     WHERE u.job_id = $1`,
    [qaJobId]
  );
  const workerUidNums = (workerRes.rows || [])
    .map((r) => parseInt(String(r.user_id), 10))
    .filter((n) => Number.isInteger(n));

  const allUids = [...new Set([responsibleUid, ...workerUidNums].filter((x) => Number.isInteger(x)))];
  let assignedNames = [];
  if (allUids.length) {
    const userRes = await pool.query(
      'SELECT id, name FROM users WHERE id = ANY($1::int[]) AND company_id = $2',
      [allUids, companyId]
    );
    assignedNames = (userRes.rows || [])
      .map((r) => r.name)
      .filter((n) => n != null && String(n).trim().length > 0);
  }
  if (!assignedNames.length) assignedNames = ['Unassigned'];

  // Create or reuse daily plan for the deadline day.
  const createdByInt = managerId != null ? managerId : null;
  let planId;
  const planRes = await pool.query(
    `SELECT id
     FROM planning_plans
     WHERE company_id = $1
       AND type = 'daily'
       AND start_date = $2
       AND end_date = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [companyId, deadlineYmdResolved]
  );
  if (planRes.rows.length) {
    planId = planRes.rows[0].id;
  } else {
    const insPlan = await pool.query(
      `INSERT INTO planning_plans (company_id, type, start_date, end_date, created_by, created_at)
       VALUES ($1, 'daily', $2, $2, $3, NOW())
       RETURNING id`,
      [companyId, deadlineYmdResolved, createdByInt]
    );
    planId = insPlan.rows[0].id;
  }

  // Build planning task fields.
  const title = qa.job_number ? String(qa.job_number) : `QA-${qaJobId}`;
  const descBits = [];
  if (qa.floor_code) descBits.push('Floor: ' + qa.floor_code);
  if (qa.location) descBits.push('Location: ' + qa.location);
  if (qa.target_completion_date) descBits.push('Target: ' + String(qa.target_completion_date).slice(0, 10));
  if (qa.description) descBits.push(String(qa.description));
  const taskDescription = descBits.join(' • ') || qa.description || null;

  const notesBits = [];
  if (qa.specification) notesBits.push('Specification: ' + qa.specification);
  const notes = notesBits.length ? notesBits.join(' • ') : null;

  const deadlineIso = `${deadlineYmdResolved}T12:00:00.000Z`;

  // Upsert planning task by qa_job_id.
  const existingTaskRes = await pool.query(
    `SELECT id, plan_id
     FROM planning_plan_tasks
     WHERE qa_job_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [qaJobId]
  );

  if (existingTaskRes.rows.length) {
    const taskId = existingTaskRes.rows[0].id;
    await pool.query(
      `UPDATE planning_plan_tasks
       SET
         plan_id = $2,
         title = $3,
         description = $4,
         assigned_to = $5,
         priority = $6,
         deadline = $7,
         pickup_start_date = $8,
         notes = $9,
         status = $10,
         send_to_assignees = $11
       WHERE id = $1`,
      [
        taskId,
        planId,
        title,
        taskDescription,
        assignedNames,
        'medium',
        deadlineIso,
        pickupYmdResolved,
        notes,
        planningStatus,
        true,
      ]
    );
    return { updated: true, taskId };
  }

  // Fallback for already-created tasks (before qa_job_id migration):
  // try to match by title (job_number) inside any planning plan of this company.
  const fallbackTaskRes = await pool.query(
    `SELECT t.id, t.plan_id
     FROM planning_plan_tasks t
     INNER JOIN planning_plans p ON p.id = t.plan_id
     WHERE p.company_id = $1
       AND t.title = $2
     ORDER BY t.created_at DESC
     LIMIT 1`,
    [companyId, title]
  );

  if (fallbackTaskRes.rows.length) {
    const taskId = fallbackTaskRes.rows[0].id;
    await pool.query(
      `UPDATE planning_plan_tasks
       SET
         qa_job_id = $1,
         plan_id = $2,
         title = $3,
         description = $4,
         assigned_to = $5,
         priority = $6,
         deadline = $7,
         pickup_start_date = $8,
         notes = $9,
         status = $10,
         send_to_assignees = $11
       WHERE id = $12`,
      [
        qaJobId,
        planId,
        title,
        taskDescription,
        assignedNames,
        'medium',
        deadlineIso,
        pickupYmdResolved,
        notes,
        planningStatus,
        true,
        taskId,
      ]
    );
    return { updated: true, taskId, backfilled: true };
  }

  // Insert new task.
  const insTask = await pool.query(
    `INSERT INTO planning_plan_tasks
      (plan_id, qa_job_id, title, description, assigned_to, priority, deadline, pickup_start_date, notes, status, send_to_assignees, created_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
     RETURNING id`,
    [
      planId,
      qaJobId,
      title,
      taskDescription,
      assignedNames,
      'medium',
      deadlineIso,
      pickupYmdResolved,
      notes,
      planningStatus,
      true,
    ]
  );

  return { created: true, taskId: insTask.rows[0].id };
}

async function updateJob(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid job id.' });
  const companyId = getQaCompanyId(req);
  if (companyId == null) return res.status(403).json({ message: 'Access denied.' });

  try {
    const existing = await pool.query(
      `SELECT j.id, j.project_id FROM qa_jobs j INNER JOIN projects p ON p.id = j.project_id AND p.company_id = $1 WHERE j.id = $2`,
      [companyId, id]
    );
    if (existing.rows.length === 0) return res.status(404).json({ message: 'Job not found.' });
    if (req.supervisor) {
      const m = supervisorProjectMismatch(req, existing.rows[0].project_id);
      if (m) return res.status(403).json({ message: m });
    }
  } catch (e) {
    return res.status(403).json({ message: e.message || 'Access denied.' });
  }

  const b = req.body || {};
  const updates = [];
  const values = [];
  let idx = 1;

  if (b.status !== undefined) {
    const statusId = await getStatusIdByCode(b.status);
    if (!statusId) return res.status(400).json({ message: 'Invalid status.' });
    updates.push(`status_id = $${idx++}`);
    values.push(statusId);
  }
  if (updates.length === 0) return res.status(400).json({ message: 'No fields to update.' });
  updates.push(`updated_at = NOW()`, `updated_by = $${idx++}`);
  values.push(getCreatedBy(req), id);

  try {
    await pool.query(
      `UPDATE qa_jobs SET ${updates.join(', ')} WHERE id = $${idx}`,
      values
    );
    // Keep Planning synchronized with this QA job update.
    try {
      const uid =
        req.manager && req.manager.id
          ? req.manager.id
          : req.supervisor && req.supervisor.id
            ? req.supervisor.id
            : null;
      await syncPlanningForQaJob(companyId, id, uid);
    } catch (syncErr) {
      console.error('Auto planning sync from QA updateJob failed:', syncErr);
    }
    return getJob(req, res);
  } catch (err) {
    console.error('QA updateJob:', err);
    return res.status(500).json({ message: err.message || 'Failed to update job.' });
  }
}

async function deleteJob(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid job id.' });
  const companyId = req.manager && req.manager.company_id;
  if (companyId == null) return res.status(403).json({ message: 'Access denied.' });

  try {
    // Capture job_number + impacted planning plan_ids before QA deletion.
    const jobRes = await pool.query(
      `SELECT j.job_number
       FROM qa_jobs j
       INNER JOIN projects p ON p.id = j.project_id AND p.company_id = $1
       WHERE j.id = $2`,
      [companyId, id]
    );
    const jobNumber = jobRes.rows.length ? jobRes.rows[0].job_number : null;

    const impactedPlanIdsRes = await pool.query(
      `SELECT DISTINCT plan_id
       FROM planning_plan_tasks
       WHERE qa_job_id = $1`,
      [id]
    );
    const impactedPlanIds = (impactedPlanIdsRes.rows || []).map((r) => r.plan_id).filter(Boolean);

    const r = await pool.query(
      `DELETE FROM qa_jobs j USING projects p WHERE j.project_id = p.id AND p.company_id = $1 AND j.id = $2 RETURNING j.id`,
      [companyId, id]
    );
    if (r.rowCount === 0) return res.status(404).json({ message: 'Job not found.' });

    // Delete corresponding planning task(s).
    await pool.query(
      `DELETE FROM planning_plan_tasks
       WHERE qa_job_id = $1`,
      [id]
    );
    // Fallback for old tasks created before qa_job_id migration.
    if (jobNumber) {
      await pool.query(
        `DELETE FROM planning_plan_tasks t
         USING planning_plans p
         WHERE p.id = t.plan_id
           AND p.company_id = $1
           AND t.qa_job_id IS NULL
           AND t.title = $2`,
        [companyId, jobNumber]
      );
    }

    // Cleanup empty plans (only those impacted by this QA job).
    if (impactedPlanIds.length) {
      await pool.query(
        `DELETE FROM planning_plans p
         WHERE p.company_id = $1
           AND p.id = ANY($2::int[])
           AND NOT EXISTS (
             SELECT 1 FROM planning_plan_tasks t WHERE t.plan_id = p.id
           )`,
        [companyId, impactedPlanIds]
      );
    }

    return res.status(204).send();
  } catch (err) {
    console.error('QA deleteJob:', err);
    return res.status(500).json({ message: err.message || 'Failed to delete job.' });
  }
}

module.exports = {
  getPersonnel,
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  listJobs,
  getJob,
  getNextJobNumber,
  createJob,
  updateJob,
  deleteJob,
};
