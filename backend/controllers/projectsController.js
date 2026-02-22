/**
 * Projects API per Proconix spec.
 * Managers: create, edit, deactivate, view all company projects.
 * Operatives: view only their assigned project (users.project_id).
 * All SQL parameterized; company scoped.
 */

const { pool } = require('../db/pool');

const ACCESS_DENIED_MESSAGE = 'Access Denied. You are not authorized to view this project.';

function getCompanyId(req) {
  if (req.manager && req.manager.company_id != null) return req.manager.company_id;
  return null;
}

function generateProjectPassKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = '';
  for (let i = 0; i < 10; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

/**
 * POST /api/projects/create
 * Body: project_name, address?, start_date?, planned_end_date?, number_of_floors?, description?
 * Backend adds: company_id, created_by_who, project_pass_key.
 */
async function create(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(403).json({ success: false, message: ACCESS_DENIED_MESSAGE });
  }

  const b = req.body || {};
  const projectName = (b.project_name && String(b.project_name).trim()) || '';
  const address = (b.address && String(b.address).trim()) || null;
  const startDate = b.start_date || null;
  const plannedEndDate = b.planned_end_date || null;
  let numberOfFloors = null;
  if (b.number_of_floors != null && b.number_of_floors !== '') {
    const n = parseInt(b.number_of_floors, 10);
    if (Number.isInteger(n) && n >= 0) numberOfFloors = n;
  }
  const description = (b.description && String(b.description).trim()) || null;

  if (!projectName) {
    return res.status(400).json({ success: false, message: 'Project name is required.' });
  }

  const createdByWho = req.manager.name && req.manager.surname
    ? `${req.manager.name} ${req.manager.surname}`.trim()
    : (req.manager.name || req.manager.email || null);
  const projectPassKey = generateProjectPassKey();

  try {
    const result = await pool.query(
      `INSERT INTO projects (
        company_id, project_pass_key, created_by_who, project_name, address,
        start_date, planned_end_date, number_of_floors, description, active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
      RETURNING id, company_id, project_pass_key, created_by_who, project_name, address,
        start_date, planned_end_date, number_of_floors, description, active, created_at, deactivate_by_who`,
      [companyId, projectPassKey, createdByWho, projectName, address, startDate, plannedEndDate, numberOfFloors, description]
    );
    return res.status(201).json({ success: true, project: result.rows[0] });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ success: false, message: 'Invalid company_id.' });
    }
    if (err.code === '42703' || err.code === '42P01') {
      try {
        const legacy = await pool.query(
          `INSERT INTO projects (company_id, name, address, start_date, description)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, company_id, name, address, start_date, description, created_at`,
          [companyId, projectName, address, startDate, description]
        );
        const row = legacy.rows[0];
        const project = {
          id: row.id,
          company_id: row.company_id,
          project_pass_key: null,
          created_by_who: createdByWho,
          project_name: row.name,
          address: row.address,
          start_date: row.start_date,
          planned_end_date: null,
          number_of_floors: null,
          description: row.description,
          active: true,
          created_at: row.created_at,
          deactivate_by_who: null,
        };
        return res.status(201).json({ success: true, project });
      } catch (legacyErr) {
        console.error('projectsController create (legacy):', legacyErr);
        return res.status(500).json({ success: false, message: 'Failed to create project. ' + (legacyErr.message || '') });
      }
    }
    console.error('projectsController create:', err);
    return res.status(500).json({ success: false, message: 'Failed to create project. ' + (err.message || '') });
  }
}

/**
 * GET /api/projects/list
 * Returns all projects for the manager's company.
 */
async function list(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(403).json({ success: false, message: ACCESS_DENIED_MESSAGE });
  }

  try {
    const result = await pool.query(
      `SELECT id, company_id, project_pass_key, created_by_who, project_name, address,
              start_date, planned_end_date, number_of_floors, description, active, created_at, deactivate_by_who
       FROM projects
       WHERE company_id = $1
       ORDER BY created_at DESC`,
      [companyId]
    );
    return res.status(200).json({ success: true, projects: result.rows });
  } catch (err) {
    if (err.code === '42703' || err.code === '42P01') {
      try {
        const legacy = await pool.query(
          `SELECT id, company_id, name, address, start_date, description, created_at
           FROM projects WHERE company_id = $1 ORDER BY created_at DESC`,
          [companyId]
        );
        const projects = legacy.rows.map((row) => ({
          id: row.id,
          company_id: row.company_id,
          project_pass_key: null,
          created_by_who: null,
          project_name: row.name,
          address: row.address,
          start_date: row.start_date,
          planned_end_date: null,
          number_of_floors: null,
          description: row.description,
          active: true,
          created_at: row.created_at,
          deactivate_by_who: null,
        }));
        return res.status(200).json({ success: true, projects });
      } catch (legacyErr) {
        console.error('projectsController list (legacy):', legacyErr);
        return res.status(500).json({ success: false, message: 'Failed to load projects.' });
      }
    }
    console.error('projectsController list:', err);
    return res.status(500).json({ success: false, message: 'Failed to load projects.' });
  }
}

/**
 * GET /api/projects/:id
 * Manager: allowed if project.company_id === manager.company_id.
 * Operative: allowed only if project.id === operative's users.project_id.
 */
async function getOne(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid project id.' });
  }

  try {
    if (req.userType === 'manager') {
      const companyId = getCompanyId(req);
      if (companyId == null) {
        return res.status(403).json({ success: false, message: ACCESS_DENIED_MESSAGE });
      }
      let result;
      try {
        result = await pool.query(
          `SELECT id, company_id, project_pass_key, created_by_who, project_name, address,
                  start_date, planned_end_date, number_of_floors, description, active, created_at, deactivate_by_who
           FROM projects WHERE id = $1 AND company_id = $2`,
          [id, companyId]
        );
      } catch (colErr) {
        if (colErr.code === '42703' || colErr.code === '42P01') {
          result = await pool.query(
            'SELECT id, company_id, name, address, start_date, description, created_at FROM projects WHERE id = $1 AND company_id = $2',
            [id, companyId]
          );
          if (result.rows.length > 0) {
            const row = result.rows[0];
            result.rows[0] = {
              id: row.id,
              company_id: row.company_id,
              project_pass_key: null,
              created_by_who: null,
              project_name: row.name,
              address: row.address,
              start_date: row.start_date,
              planned_end_date: null,
              number_of_floors: null,
              description: row.description,
              active: true,
              created_at: row.created_at,
              deactivate_by_who: null,
            };
          }
        } else throw colErr;
      }
      if (result.rows.length === 0) {
        return res.status(403).json({ success: false, message: ACCESS_DENIED_MESSAGE });
      }
      return res.status(200).json({ success: true, project: result.rows[0] });
    }

    if (req.userType === 'operative') {
      const userRow = await pool.query(
        'SELECT project_id FROM users WHERE id = $1 AND company_id = $2',
        [req.operative.id, req.operative.company_id]
      );
      const assignedProjectId = userRow.rows[0] && userRow.rows[0].project_id != null ? userRow.rows[0].project_id : null;
      if (assignedProjectId !== id) {
        return res.status(403).json({ success: false, message: ACCESS_DENIED_MESSAGE });
      }
      let result;
      try {
        result = await pool.query(
          `SELECT id, company_id, project_pass_key, created_by_who, project_name, address,
                  start_date, planned_end_date, number_of_floors, description, active, created_at, deactivate_by_who
           FROM projects WHERE id = $1`,
          [id]
        );
      } catch (colErr) {
        if (colErr.code === '42703' || colErr.code === '42P01') {
          result = await pool.query(
            'SELECT id, company_id, name, address, start_date, description, created_at FROM projects WHERE id = $1',
            [id]
          );
          if (result.rows.length > 0) {
            const row = result.rows[0];
            result.rows[0] = {
              id: row.id,
              company_id: row.company_id,
              project_pass_key: null,
              created_by_who: null,
              project_name: row.name,
              address: row.address,
              start_date: row.start_date,
              planned_end_date: null,
              number_of_floors: null,
              description: row.description,
              active: true,
              created_at: row.created_at,
              deactivate_by_who: null,
            };
          }
        } else throw colErr;
      }
      if (result.rows.length === 0) {
        return res.status(403).json({ success: false, message: ACCESS_DENIED_MESSAGE });
      }
      return res.status(200).json({ success: true, project: result.rows[0] });
    }

    return res.status(403).json({ success: false, message: ACCESS_DENIED_MESSAGE });
  } catch (err) {
    console.error('projectsController getOne:', err);
    return res.status(500).json({ success: false, message: 'Failed to load project.' });
  }
}

/**
 * PUT /api/projects/:id/update
 * Body: project_name?, address?, start_date?, planned_end_date?, number_of_floors?, description?
 */
async function update(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(403).json({ success: false, message: ACCESS_DENIED_MESSAGE });
  }

  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid project id.' });
  }

  const b = req.body || {};
  const projectName = (b.project_name && String(b.project_name).trim()) || '';
  const address = b.address != null ? String(b.address).trim() : null;
  const startDate = b.start_date || null;
  const plannedEndDate = b.planned_end_date || null;
  let numberOfFloors = null;
  if (b.number_of_floors != null && b.number_of_floors !== '') {
    const n = parseInt(b.number_of_floors, 10);
    if (Number.isInteger(n) && n >= 0) numberOfFloors = n;
  }
  const description = b.description != null ? String(b.description).trim() : null;

  if (!projectName) {
    return res.status(400).json({ success: false, message: 'Project name is required.' });
  }

  try {
    const result = await pool.query(
      `UPDATE projects
       SET project_name = $1, address = COALESCE($2, address), start_date = COALESCE($3, start_date),
           planned_end_date = COALESCE($4, planned_end_date), number_of_floors = COALESCE($5, number_of_floors),
           description = COALESCE($6, description)
       WHERE id = $7 AND company_id = $8
       RETURNING id, company_id, project_pass_key, created_by_who, project_name, address,
                 start_date, planned_end_date, number_of_floors, description, active, created_at, deactivate_by_who`,
      [projectName, address || null, startDate, plannedEndDate, numberOfFloors, description, id, companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: ACCESS_DENIED_MESSAGE });
    }
    return res.status(200).json({ success: true, project: result.rows[0] });
  } catch (err) {
    console.error('projectsController update:', err);
    return res.status(500).json({ success: false, message: 'Failed to update project.' });
  }
}

/**
 * PUT /api/projects/:id/deactivate
 * Sets active = false and deactivate_by_who = manager name.
 */
async function deactivate(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(403).json({ success: false, message: ACCESS_DENIED_MESSAGE });
  }

  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid project id.' });
  }

  const deactivateByWho = req.manager.name && req.manager.surname
    ? `${req.manager.name} ${req.manager.surname}`.trim()
    : (req.manager.name || req.manager.email || 'Manager');

  try {
    const result = await pool.query(
      `UPDATE projects
       SET active = false, deactivate_by_who = $1
       WHERE id = $2 AND company_id = $3
       RETURNING id, company_id, project_name, active, deactivate_by_who`,
      [deactivateByWho, id, companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: ACCESS_DENIED_MESSAGE });
    }
    return res.status(200).json({ success: true, project: result.rows[0], message: 'Project deactivated.' });
  } catch (err) {
    console.error('projectsController deactivate:', err);
    return res.status(500).json({ success: false, message: 'Failed to deactivate project.' });
  }
}

/**
 * GET /api/projects/:id/assignments
 * Returns operatives/managers assigned to this project (from project_assignments).
 */
async function getAssignments(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(403).json({ success: false, message: ACCESS_DENIED_MESSAGE });
  }
  const projectId = parseInt(req.params.id, 10);
  if (!Number.isInteger(projectId) || projectId < 1) {
    return res.status(400).json({ success: false, message: 'Invalid project id.' });
  }
  try {
    const project = await pool.query('SELECT id FROM projects WHERE id = $1 AND company_id = $2', [projectId, companyId]);
    if (project.rows.length === 0) {
      return res.status(404).json({ success: false, message: ACCESS_DENIED_MESSAGE });
    }
    const result = await pool.query(
      `SELECT pa.id, pa.user_id, pa.role, pa.assigned_at, u.name AS user_name
       FROM project_assignments pa
       JOIN users u ON u.id = pa.user_id AND u.company_id = $1
       WHERE pa.project_id = $2
       ORDER BY pa.assigned_at`,
      [companyId, projectId]
    );
    return res.status(200).json({ success: true, assignments: result.rows });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(200).json({ success: true, assignments: [] });
    }
    console.error('projectsController getAssignments:', err);
    return res.status(500).json({ success: false, message: 'Failed to load assignments.' });
  }
}

/**
 * POST /api/projects/:id/assign
 * Body: user_id, role. Assigns operative to project (project_assignments).
 */
async function assign(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(403).json({ success: false, message: ACCESS_DENIED_MESSAGE });
  }
  const projectId = parseInt(req.params.id, 10);
  if (!Number.isInteger(projectId) || projectId < 1) {
    return res.status(400).json({ success: false, message: 'Invalid project id.' });
  }
  const userId = req.body && req.body.user_id != null ? parseInt(req.body.user_id, 10) : null;
  const role = (req.body && req.body.role && String(req.body.role).trim()) || null;
  if (!userId || !Number.isInteger(userId)) {
    return res.status(400).json({ success: false, message: 'Valid user_id is required.' });
  }
  try {
    const project = await pool.query('SELECT id FROM projects WHERE id = $1 AND company_id = $2', [projectId, companyId]);
    if (project.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }
    const user = await pool.query('SELECT id, name FROM users WHERE id = $1 AND company_id = $2', [userId, companyId]);
    if (user.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'User not found in your company.' });
    }
    try {
      await pool.query(
        `INSERT INTO project_assignments (project_id, user_id, role)
         VALUES ($1, $2, $3)
         RETURNING id, project_id, user_id, role, assigned_at`,
        [projectId, userId, role]
      );
    } catch (insertErr) {
      if (insertErr.code === '23505') {
        await pool.query(
          `UPDATE project_assignments SET role = $1 WHERE project_id = $2 AND user_id = $3`,
          [role, projectId, userId]
        );
      } else {
        throw insertErr;
      }
    }
    try {
      await pool.query(
        'UPDATE users SET project_id = $1 WHERE id = $2 AND company_id = $3',
        [projectId, userId, companyId]
      );
    } catch (updateUserErr) {
      if (updateUserErr.code === '42703') {
        await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS project_id INT');
        await pool.query(
          'UPDATE users SET project_id = $1 WHERE id = $2 AND company_id = $3',
          [projectId, userId, companyId]
        );
      } else {
        throw updateUserErr;
      }
    }
    const row = (await pool.query(
      `SELECT pa.id, pa.user_id, pa.role, pa.assigned_at, u.name AS user_name
       FROM project_assignments pa
       JOIN users u ON u.id = pa.user_id
       WHERE pa.project_id = $1 AND pa.user_id = $2`,
      [projectId, userId]
    )).rows[0];
    return res.status(201).json({ success: true, assignment: row });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({
        success: false,
        message: 'Assignments table missing. Run in your database: scripts/update_projects_and_assignments.sql',
      });
    }
    if (err.code === '23503') {
      return res.status(400).json({ success: false, message: 'Invalid project or user.' });
    }
    console.error('projectsController assign:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to assign.',
    });
  }
}

/**
 * DELETE /api/projects/assignment/:assignmentId
 * Removes an assignment (operative from project).
 */
async function removeAssignment(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(403).json({ success: false, message: ACCESS_DENIED_MESSAGE });
  }
  const assignmentId = parseInt(req.params.assignmentId, 10);
  if (!Number.isInteger(assignmentId) || assignmentId < 1) {
    return res.status(400).json({ success: false, message: 'Invalid assignment id.' });
  }
  try {
    const getRow = await pool.query(
      `SELECT pa.user_id FROM project_assignments pa
       JOIN projects p ON p.id = pa.project_id AND p.company_id = $1
       WHERE pa.id = $2`,
      [companyId, assignmentId]
    );
    if (getRow.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Assignment not found.' });
    }
    const userId = getRow.rows[0].user_id;
    await pool.query(
      `DELETE FROM project_assignments pa
       USING projects p
       WHERE pa.id = $1 AND pa.project_id = p.id AND p.company_id = $2`,
      [assignmentId, companyId]
    );
    await pool.query(
      'UPDATE users SET project_id = NULL WHERE id = $1 AND company_id = $2',
      [userId, companyId]
    );
    return res.status(200).json({ success: true, message: 'Assignment removed.' });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(500).json({ success: false, message: 'Assignments table not found.' });
    }
    console.error('projectsController removeAssignment:', err);
    return res.status(500).json({ success: false, message: 'Failed to remove assignment.' });
  }
}

module.exports = {
  create,
  list,
  getOne,
  update,
  deactivate,
  getAssignments,
  assign,
  removeAssignment,
};
