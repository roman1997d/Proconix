/**
 * Unit Progress Tracking workspace API.
 * Stores full workspace JSON per company in unit_progress_state.
 */

const { pool } = require('../db/pool');

function getManagerCompanyId(req) {
  return req.manager && req.manager.company_id != null ? Number(req.manager.company_id) : null;
}

function getSupervisorCompanyId(req) {
  return req.supervisor && req.supervisor.company_id != null ? Number(req.supervisor.company_id) : null;
}

function defaultWorkspace() {
  return {
    towers: [],
    floors: [],
    units: [],
    updated_at: new Date().toISOString(),
  };
}

function sanitizeWorkspace(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('workspace must be an object');
  }
  const towers = Array.isArray(input.towers) ? input.towers : [];
  const floors = Array.isArray(input.floors) ? input.floors : [];
  const units = Array.isArray(input.units) ? input.units : [];
  return {
    ...input,
    towers,
    floors,
    units,
    updated_at: new Date().toISOString(),
  };
}

async function getWorkspaceByCompanyId(companyId) {
  const result = await pool.query(
    'SELECT workspace FROM unit_progress_state WHERE company_id = $1',
    [companyId]
  );
  if (!result.rows.length) return defaultWorkspace();
  const rowWorkspace = result.rows[0].workspace;
  if (!rowWorkspace || typeof rowWorkspace !== 'object' || Array.isArray(rowWorkspace)) {
    return defaultWorkspace();
  }
  return rowWorkspace;
}

async function upsertWorkspace(companyId, workspace, actorKind, actorId) {
  await pool.query(
    `INSERT INTO unit_progress_state (company_id, workspace, updated_by_kind, updated_by_id, updated_at)
     VALUES ($1, $2::jsonb, $3, $4, NOW())
     ON CONFLICT (company_id)
     DO UPDATE SET
       workspace = EXCLUDED.workspace,
       updated_by_kind = EXCLUDED.updated_by_kind,
       updated_by_id = EXCLUDED.updated_by_id,
       updated_at = NOW()`,
    [companyId, JSON.stringify(workspace), actorKind, actorId]
  );
}

async function getWorkspace(req, res) {
  const companyId = getManagerCompanyId(req);
  if (companyId == null) {
    return res.status(400).json({ success: false, message: 'Manager has no company_id.' });
  }
  try {
    const workspace = await getWorkspaceByCompanyId(companyId);
    return res.json({ success: true, workspace });
  } catch (error) {
    if (error.code === '42P01') {
      return res.status(503).json({
        success: false,
        code: 'unit_progress_tables_missing',
        message: 'Unit Progress table missing. Run scripts/create_unit_progress_tables.sql',
      });
    }
    console.error('unitProgress getWorkspace:', error);
    return res.status(500).json({ success: false, message: 'Failed to load Unit Progress workspace.' });
  }
}

async function putWorkspace(req, res) {
  const companyId = getManagerCompanyId(req);
  if (companyId == null) {
    return res.status(400).json({ success: false, message: 'Manager has no company_id.' });
  }
  try {
    const workspace = sanitizeWorkspace(req.body && req.body.workspace ? req.body.workspace : req.body);
    await upsertWorkspace(companyId, workspace, 'manager', req.manager && req.manager.id ? req.manager.id : null);
    return res.json({ success: true, workspace });
  } catch (error) {
    if (error.message === 'workspace must be an object') {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.code === '42P01') {
      return res.status(503).json({
        success: false,
        code: 'unit_progress_tables_missing',
        message: 'Unit Progress table missing. Run scripts/create_unit_progress_tables.sql',
      });
    }
    console.error('unitProgress putWorkspace:', error);
    return res.status(500).json({ success: false, message: 'Failed to save Unit Progress workspace.' });
  }
}

async function getWorkspaceSupervisor(req, res) {
  const companyId = getSupervisorCompanyId(req);
  if (companyId == null) {
    return res.status(400).json({ success: false, message: 'Supervisor has no company_id.' });
  }
  try {
    const workspace = await getWorkspaceByCompanyId(companyId);
    return res.json({ success: true, workspace });
  } catch (error) {
    if (error.code === '42P01') {
      return res.status(503).json({
        success: false,
        code: 'unit_progress_tables_missing',
        message: 'Unit Progress table missing. Run scripts/create_unit_progress_tables.sql',
      });
    }
    console.error('unitProgress getWorkspaceSupervisor:', error);
    return res.status(500).json({ success: false, message: 'Failed to load Unit Progress workspace.' });
  }
}

async function putWorkspaceSupervisor(req, res) {
  const companyId = getSupervisorCompanyId(req);
  if (companyId == null) {
    return res.status(400).json({ success: false, message: 'Supervisor has no company_id.' });
  }
  try {
    const workspace = sanitizeWorkspace(req.body && req.body.workspace ? req.body.workspace : req.body);
    await upsertWorkspace(
      companyId,
      workspace,
      'supervisor',
      req.supervisor && req.supervisor.id ? req.supervisor.id : null
    );
    return res.json({ success: true, workspace });
  } catch (error) {
    if (error.message === 'workspace must be an object') {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.code === '42P01') {
      return res.status(503).json({
        success: false,
        code: 'unit_progress_tables_missing',
        message: 'Unit Progress table missing. Run scripts/create_unit_progress_tables.sql',
      });
    }
    console.error('unitProgress putWorkspaceSupervisor:', error);
    return res.status(500).json({ success: false, message: 'Failed to save Unit Progress workspace.' });
  }
}

module.exports = {
  getWorkspace,
  putWorkspace,
  getWorkspaceSupervisor,
  putWorkspaceSupervisor,
};
