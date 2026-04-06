/**
 * Planning controller – Plan + PlanTasks (backend for Task_Planning module).
 *
 * Notes:
 * - All endpoints are manager-only (requireManagerAuth).
 * - Planning is scoped by req.manager.company_id.
 * - Frontend sends tasks with:
 *   - title, description
 *   - assigned_to (TEXT array)
 *   - priority (low|medium|high|critical)
 *   - deadline (ISO string)
 *   - pickup_start_date (optional; frontend uses startSpanDate)
 *   - notes
 *   - status (not_started|in_progress|paused|completed|declined)
 *   - send_to_assignees (boolean)
 */

const { pool } = require('../db/pool');
const { resolveCrewAssignmentForPlanning, notifyCompany } = require('./crewController');

const PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);
const STATUSES = new Set(['not_started', 'in_progress', 'paused', 'completed', 'declined']);

function getCompanyId(req) {
  return req.manager && req.manager.company_id != null ? req.manager.company_id : null;
}

function parseDateYYYYMMDD(value) {
  // Expect 'YYYY-MM-DD'
  if (!value || typeof value !== 'string') return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (!y || !mo || !d) return null;
  const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return value; // Keep same format for SQL DATE
}

function parseIsoTimestamp(value) {
  // Accept ISO strings
  if (!value || typeof value !== 'string') return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function sanitizeTextArray(value) {
  if (!Array.isArray(value)) return null;
  const clean = value
    .map((x) => (x == null ? '' : String(x).trim()))
    .filter((x) => x.length > 0);
  return clean.length ? clean : null;
}

function sanitizePriority(value) {
  const p = (value || '').toString();
  if (!PRIORITIES.has(p)) return 'medium';
  return p;
}

function sanitizeStatus(value) {
  const s = (value || '').toString();
  if (!STATUSES.has(s)) return 'not_started';
  return s;
}

async function ensurePlanOwnership(companyId, planId) {
  const r = await pool.query(
    `SELECT id, company_id FROM planning_plans WHERE id = $1 AND company_id = $2`,
    [planId, companyId]
  );
  return r.rows[0] || null;
}

/**
 * POST /api/planning/plans
 * Body:
 *  - type (daily|weekly|monthly)
 *  - start_date (YYYY-MM-DD)
 *  - end_date (YYYY-MM-DD)
 */
async function createPlan(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) return res.status(403).json({ success: false, message: 'Access denied.' });

  const b = req.body || {};
  const type = (b.type || 'daily').toString();
  const startDate = parseDateYYYYMMDD(b.start_date);
  const endDate = parseDateYYYYMMDD(b.end_date);
  const createdBy = req.manager && req.manager.id ? req.manager.id : null;

  if (!startDate || !endDate) {
    return res.status(400).json({ success: false, message: 'start_date and end_date are required (YYYY-MM-DD).' });
  }

  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return res.status(400).json({ success: false, message: 'Invalid plan date range.' });
  }

  const allowedTypes = new Set(['daily', 'weekly', 'monthly']);
  const safeType = allowedTypes.has(type) ? type : 'daily';

  try {
    const r = await pool.query(
      `INSERT INTO planning_plans (company_id, type, start_date, end_date, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, company_id, type, start_date, end_date, created_by, created_at`,
      [companyId, safeType, startDate, endDate, createdBy]
    );
    return res.status(201).json({ success: true, plan_id: r.rows[0].id, plan: r.rows[0] });
  } catch (err) {
    console.error('createPlan error:', err);
    return res.status(500).json({ success: false, message: 'Failed to create plan.' });
  }
}

/**
 * POST /api/planning/plan-tasks
 * Body:
 *  - plan_id
 *  - tasks: [{ title, description, assigned_to, priority, deadline, pickup_start_date, notes, status, send_to_assignees }]
 *
 * Strategy for now: delete existing tasks for plan_id and insert the provided list.
 */
async function upsertPlanTasks(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) return res.status(403).json({ success: false, message: 'Access denied.' });

  const b = req.body || {};
  const planId = parseInt(b.plan_id, 10);
  const tasks = Array.isArray(b.tasks) ? b.tasks : [];

  if (!Number.isInteger(planId) || planId < 1) {
    return res.status(400).json({ success: false, message: 'plan_id is required.' });
  }
  if (!tasks.length) {
    return res.status(400).json({ success: false, message: 'tasks array is required.' });
  }

  const plan = await ensurePlanOwnership(companyId, planId);
  if (!plan) return res.status(403).json({ success: false, message: 'Access denied.' });

  try {
    await pool.query('BEGIN');
    await pool.query(`DELETE FROM planning_plan_tasks WHERE plan_id = $1`, [planId]);

    const inserted = [];
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i] || {};
      const title = (t.title || '').toString().trim();
      const description = t.description != null ? String(t.description) : null;
      let assignedTo = sanitizeTextArray(t.assigned_to);
      let crewIdVal = null;
      let assignmentTypeVal = 'names';
      const rawCid = t.crew_id != null ? parseInt(t.crew_id, 10) : null;
      if (Number.isInteger(rawCid) && rawCid >= 1) {
        const resolved = await resolveCrewAssignmentForPlanning(companyId, rawCid, assignedTo);
        if (resolved === null) {
          throw new Error('Invalid crew or no active members for this crew assignment.');
        }
        assignedTo = sanitizeTextArray(resolved.assignedTo);
        crewIdVal = resolved.crewId;
        assignmentTypeVal = resolved.assignmentType || 'crew';
      }
      const priority = sanitizePriority(t.priority);
      const deadlineDt = parseIsoTimestamp(t.deadline);
      const extraInfo = t.extra_info && typeof t.extra_info === 'object' ? t.extra_info : {};
      let pickupStart =
        parseDateYYYYMMDD(t.pickup_start_date) ||
        parseDateYYYYMMDD(t.start_date_pickup) ||
        parseDateYYYYMMDD(extraInfo.start_date_pickup);
      const notes = t.notes != null ? String(t.notes) : null;
      const status = sanitizeStatus(t.status);
      const sendToAssignees = t.send_to_assignees === undefined ? true : t.send_to_assignees === true;

      if (!title) throw new Error('Task title is required.');
      if (!assignedTo) throw new Error('Task assigned_to must be a non-empty array.');
      if (!deadlineDt) throw new Error('Task deadline must be a valid ISO timestamp.');
      if (!pickupStart) {
        // fallback: use deadline date
        pickupStart = deadlineDt.toISOString().slice(0, 10);
      }

      const r = await pool.query(
        `INSERT INTO planning_plan_tasks
          (plan_id, title, description, assigned_to, priority, deadline, pickup_start_date, notes, status, send_to_assignees, created_at, crew_id, assignment_type)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, $12)
         RETURNING id`,
        [
          planId,
          title,
          description,
          assignedTo,
          priority,
          deadlineDt,
          pickupStart,
          notes,
          status,
          sendToAssignees,
          crewIdVal,
          assignmentTypeVal,
        ]
      );
      inserted.push(r.rows[0].id);
      if (crewIdVal) {
        try {
          const gr = await pool.query(`SELECT name FROM crews WHERE id = $1 AND company_id = $2`, [crewIdVal, companyId]);
          const cn = gr.rows[0] ? gr.rows[0].name : '';
          await notifyCompany(companyId, `Planning task "${title}" assigned to crew "${cn}".`);
        } catch (_) {
          /* ignore notification errors */
        }
      }
    }

    await pool.query('COMMIT');
    return res.status(200).json({ success: true, inserted_ids: inserted });
  } catch (err) {
    console.error('upsertPlanTasks error:', err);
    try {
      await pool.query('ROLLBACK');
    } catch (_) {
      // Ignore rollback errors
    }
    return res.status(500).json({ success: false, message: 'Failed to upsert plan tasks.' });
  }
}

/**
 * PATCH /api/planning/plan-tasks/:id
 * Allows updating status/priority/dates/send_to_assignees/assigned_to.
 */
async function patchPlanTask(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) return res.status(403).json({ success: false, message: 'Access denied.' });

  const taskId = parseInt(req.params.id, 10);
  if (!Number.isInteger(taskId) || taskId < 1) {
    return res.status(400).json({ success: false, message: 'Invalid task id.' });
  }

  const t = req.body || {};

  // Validate optional fields
  const updates = {};
  if (t.title != null) updates.title = String(t.title).trim();
  if (t.description != null) updates.description = String(t.description);
  if (Object.prototype.hasOwnProperty.call(t, 'crew_id')) {
    if (t.crew_id == null || t.crew_id === '') {
      updates.crew_id = null;
      updates.assignment_type = 'names';
    } else {
      const cid = parseInt(t.crew_id, 10);
      if (!Number.isInteger(cid) || cid < 1) {
        return res.status(400).json({ success: false, message: 'Invalid crew_id.' });
      }
      const baseAssigned = t.assigned_to != null ? sanitizeTextArray(t.assigned_to) : null;
      const resolved = await resolveCrewAssignmentForPlanning(companyId, cid, baseAssigned);
      if (resolved === null) {
        return res.status(400).json({ success: false, message: 'Invalid crew or no active members.' });
      }
      updates.assigned_to = resolved.assignedTo;
      updates.crew_id = resolved.crewId;
      updates.assignment_type = resolved.assignmentType || 'crew';
    }
  } else if (t.assigned_to != null) {
    const arr = sanitizeTextArray(t.assigned_to);
    if (!arr) return res.status(400).json({ success: false, message: 'assigned_to must be a non-empty array.' });
    updates.assigned_to = arr;
  }
  if (t.priority != null) updates.priority = sanitizePriority(t.priority);
  if (t.status != null) updates.status = sanitizeStatus(t.status);
  if (t.send_to_assignees != null) updates.send_to_assignees = !!t.send_to_assignees;
  if (t.notes != null) updates.notes = String(t.notes);
  if (t.deadline != null) {
    const dt = parseIsoTimestamp(t.deadline);
    if (!dt) return res.status(400).json({ success: false, message: 'Invalid deadline.' });
    updates.deadline = dt;
  }
  if (t.pickup_start_date != null) {
    const ps = parseDateYYYYMMDD(t.pickup_start_date);
    if (!ps) return res.status(400).json({ success: false, message: 'Invalid pickup_start_date.' });
    updates.pickup_start_date = ps;
  }

  const fields = Object.keys(updates);
  if (!fields.length) return res.status(400).json({ success: false, message: 'No valid fields to update.' });

  // Build SQL safely
  const setParts = [];
  const values = [];
  let idx = 1;
  fields.forEach((k) => {
    setParts.push(`${k} = $${idx}`);
    values.push(updates[k]);
    idx++;
  });

  values.push(taskId);

  try {
    // Ensure task belongs to manager's company through join
    const r = await pool.query(
      `UPDATE planning_plan_tasks
       SET ${setParts.join(', ')}
       WHERE id = $${idx}
         AND plan_id IN (SELECT id FROM planning_plans WHERE company_id = $${idx + 1})
       RETURNING id`,
      [...values, companyId]
    );

    if (!r.rows.length) return res.status(403).json({ success: false, message: 'Access denied.' });
    return res.status(200).json({ success: true, task_id: r.rows[0].id });
  } catch (err) {
    console.error('patchPlanTask error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update task.' });
  }
}

/**
 * DELETE /api/planning/plan-tasks/:id
 */
async function deletePlanTask(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) return res.status(403).json({ success: false, message: 'Access denied.' });

  const taskId = parseInt(req.params.id, 10);
  if (!Number.isInteger(taskId) || taskId < 1) {
    return res.status(400).json({ success: false, message: 'Invalid task id.' });
  }

  try {
    const r = await pool.query(
      `DELETE FROM planning_plan_tasks
       WHERE id = $1
         AND plan_id IN (SELECT id FROM planning_plans WHERE company_id = $2)
       RETURNING id`,
      [taskId, companyId]
    );
    if (!r.rows.length) return res.status(403).json({ success: false, message: 'Access denied.' });
    return res.status(200).json({ success: true, deleted: true, task_id: taskId });
  } catch (err) {
    console.error('deletePlanTask error:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete task.' });
  }
}

/**
 * GET /api/planning/list
 * Returns plans and tasks for manager company (simple structure).
 */
async function listPlans(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) return res.status(403).json({ success: false, message: 'Access denied.' });

  try {
    const plansRes = await pool.query(
      `SELECT id, company_id, type, start_date, end_date, created_by, created_at
       FROM planning_plans
       WHERE company_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [companyId]
    );

    const planIds = plansRes.rows.map((p) => p.id);
    // Must be an object with `.rows` so the logic below works even when planIds is empty.
    let tasksRes = { rows: [] };
    if (planIds.length) {
      tasksRes = await pool.query(
        `SELECT
           id, plan_id, title, description, assigned_to, priority, deadline,
           pickup_start_date, notes, status, send_to_assignees, created_at,
           crew_id, assignment_type
         FROM planning_plan_tasks
         WHERE plan_id = ANY($1::int[])
         ORDER BY created_at DESC`,
        [planIds]
      );
    }

    const tasksByPlan = {};
    tasksRes.rows.forEach((t) => {
      if (!tasksByPlan[t.plan_id]) tasksByPlan[t.plan_id] = [];
      tasksByPlan[t.plan_id].push({
        id: t.id,
        title: t.title,
        description: t.description,
        assigned_to: t.assigned_to || [],
        priority: t.priority,
        deadline: t.deadline,
        pickup_start_date: t.pickup_start_date,
        notes: t.notes,
        status: t.status,
        send_to_assignees: t.send_to_assignees,
        crew_id: t.crew_id != null ? t.crew_id : null,
        assignment_type: t.assignment_type || 'names',
      });
    });

    return res.status(200).json({
      success: true,
      plans: plansRes.rows.map((p) => ({
        id: p.id,
        type: p.type,
        start_date: p.start_date,
        end_date: p.end_date,
        created_by: p.created_by,
        created_at: p.created_at,
        tasks: tasksByPlan[p.id] || [],
      })),
    });
  } catch (err) {
    console.error('listPlans error:', err);
    return res.status(500).json({ success: false, message: 'Failed to list plans.' });
  }
}

/**
 * GET /api/planning/plan-tasks/:id/confirmation-photos
 * Photos uploaded by operatives (operative_task_photos) for this planning task.
 */
async function getPlanTaskConfirmationPhotos(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) return res.status(403).json({ success: false, message: 'Access denied.' });

  const taskId = parseInt(req.params.id, 10);
  if (!Number.isInteger(taskId) || taskId < 1) {
    return res.status(400).json({ success: false, message: 'Invalid task id.' });
  }

  try {
    const own = await pool.query(
      `SELECT 1 FROM planning_plan_tasks ppt
       INNER JOIN planning_plans pp ON pp.id = ppt.plan_id
       WHERE ppt.id = $1 AND pp.company_id = $2`,
      [taskId, companyId]
    );
    if (!own.rows.length) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }

    const r = await pool.query(
      `SELECT otp.file_url, otp.user_id, otp.created_at, u.name AS user_name
       FROM operative_task_photos otp
       LEFT JOIN users u ON u.id = otp.user_id
       WHERE otp.task_source = 'planning' AND otp.task_id = $1
       ORDER BY otp.created_at ASC`,
      [taskId]
    );
    return res.status(200).json({
      success: true,
      photos: (r.rows || []).map((row) => ({
        file_url: row.file_url,
        user_id: row.user_id,
        user_name: row.user_name || null,
        created_at: row.created_at,
      })),
    });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(200).json({ success: true, photos: [] });
    }
    console.error('getPlanTaskConfirmationPhotos error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load confirmation photos.' });
  }
}

/**
 * GET /api/planning/supervisor/list
 * Same shape as listPlans but only tasks visible to this supervisor:
 * assigned_to overlaps supervisor name or any user on the same project.
 */
async function listPlansForSupervisor(req, res) {
  const companyId = req.supervisor && req.supervisor.company_id != null ? req.supervisor.company_id : null;
  const supervisorId = req.supervisor && req.supervisor.id != null ? req.supervisor.id : null;
  if (companyId == null || supervisorId == null) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }

  let allowedNames = new Set();
  try {
    const selfRow = await pool.query('SELECT name, project_id FROM users WHERE id = $1 AND company_id = $2', [
      supervisorId,
      companyId,
    ]);
    if (!selfRow.rows.length) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    const supName = (selfRow.rows[0].name && String(selfRow.rows[0].name).trim()) || '';
    const projectId = selfRow.rows[0].project_id;
    if (supName) allowedNames.add(supName);
    if (projectId != null) {
      const crew = await pool.query(
        `SELECT name FROM users
         WHERE company_id = $1 AND project_id = $2
           AND (active_status IS NULL OR active_status = true)`,
        [companyId, projectId]
      );
      crew.rows.forEach((row) => {
        const n = row.name && String(row.name).trim();
        if (n) allowedNames.add(n);
      });
    }
  } catch (err) {
    console.error('listPlansForSupervisor names:', err);
    return res.status(500).json({ success: false, message: 'Failed to load supervisor scope.' });
  }

  function taskVisible(t) {
    const arr = Array.isArray(t.assigned_to) ? t.assigned_to : [];
    if (!arr.length) return false;
    return arr.some((a) => allowedNames.has(String(a || '').trim()));
  }

  try {
    const plansRes = await pool.query(
      `SELECT id, company_id, type, start_date, end_date, created_by, created_at
       FROM planning_plans
       WHERE company_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [companyId]
    );

    const planIds = plansRes.rows.map((p) => p.id);
    let tasksRes = { rows: [] };
    if (planIds.length) {
      tasksRes = await pool.query(
        `SELECT
           id, plan_id, title, description, assigned_to, priority, deadline,
           pickup_start_date, notes, status, send_to_assignees, created_at,
           crew_id, assignment_type
         FROM planning_plan_tasks
         WHERE plan_id = ANY($1::int[])
         ORDER BY created_at DESC`,
        [planIds]
      );
    }

    const tasksByPlan = {};
    tasksRes.rows.forEach((t) => {
      if (!taskVisible(t)) return;
      if (!tasksByPlan[t.plan_id]) tasksByPlan[t.plan_id] = [];
      tasksByPlan[t.plan_id].push({
        id: t.id,
        title: t.title,
        description: t.description,
        assigned_to: t.assigned_to || [],
        priority: t.priority,
        deadline: t.deadline,
        pickup_start_date: t.pickup_start_date,
        notes: t.notes,
        status: t.status,
        send_to_assignees: t.send_to_assignees,
        crew_id: t.crew_id != null ? t.crew_id : null,
        assignment_type: t.assignment_type || 'names',
      });
    });

    const plansOut = plansRes.rows
      .map((p) => ({
        id: p.id,
        type: p.type,
        start_date: p.start_date,
        end_date: p.end_date,
        created_by: p.created_by,
        created_at: p.created_at,
        tasks: tasksByPlan[p.id] || [],
      }))
      .filter((p) => p.tasks && p.tasks.length > 0);

    return res.status(200).json({
      success: true,
      plans: plansOut,
    });
  } catch (err) {
    console.error('listPlansForSupervisor error:', err);
    return res.status(500).json({ success: false, message: 'Failed to list plans.' });
  }
}

/**
 * GET /api/planning/supervisor/plan-tasks/:id/confirmation-photos
 */
async function getPlanTaskConfirmationPhotosSupervisor(req, res) {
  const companyId = req.supervisor && req.supervisor.company_id != null ? req.supervisor.company_id : null;
  if (companyId == null) return res.status(403).json({ success: false, message: 'Access denied.' });

  const taskId = parseInt(req.params.id, 10);
  if (!Number.isInteger(taskId) || taskId < 1) {
    return res.status(400).json({ success: false, message: 'Invalid task id.' });
  }

  try {
    const own = await pool.query(
      `SELECT ppt.id FROM planning_plan_tasks ppt
       INNER JOIN planning_plans pp ON pp.id = ppt.plan_id
       WHERE ppt.id = $1 AND pp.company_id = $2`,
      [taskId, companyId]
    );
    if (!own.rows.length) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }

    const r = await pool.query(
      `SELECT otp.file_url, otp.user_id, otp.created_at, u.name AS user_name
       FROM operative_task_photos otp
       LEFT JOIN users u ON u.id = otp.user_id
       WHERE otp.task_source = 'planning' AND otp.task_id = $1
       ORDER BY otp.created_at ASC`,
      [taskId]
    );
    return res.status(200).json({
      success: true,
      photos: (r.rows || []).map((row) => ({
        file_url: row.file_url,
        user_id: row.user_id,
        user_name: row.user_name || null,
        created_at: row.created_at,
      })),
    });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(200).json({ success: true, photos: [] });
    }
    console.error('getPlanTaskConfirmationPhotosSupervisor error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load confirmation photos.' });
  }
}

module.exports = {
  createPlan,
  upsertPlanTasks,
  patchPlanTask,
  deletePlanTask,
  listPlans,
  getPlanTaskConfirmationPhotos,
  listPlansForSupervisor,
  getPlanTaskConfirmationPhotosSupervisor,
};

