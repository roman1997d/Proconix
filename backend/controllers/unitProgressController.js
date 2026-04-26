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

function sanitizePublicTimelineEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  return {
    stage: entry.stage || '',
    status: entry.status || '',
    reason: entry.reason || '',
    comment: entry.comment || '',
    user: entry.user || '',
    date: entry.date || '',
    photos: Array.isArray(entry.photos)
      ? entry.photos.map((photo) => {
          if (typeof photo === 'string') return { name: photo, src: '' };
          if (photo && typeof photo === 'object') {
            return {
              name: photo.name || 'photo',
              src: photo.src || '',
            };
          }
          return { name: 'photo', src: '' };
        })
      : [],
  };
}

async function getPublicTimeline(req, res) {
  const unitId = normalizeUnitId(req.params.unitId);
  if (!unitId) {
    return res.status(400).json({ success: false, message: 'Invalid unit id.' });
  }

  try {
    const result = await pool.query('SELECT workspace FROM unit_progress_state');
    for (const row of result.rows) {
      const workspace = row.workspace;
      if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace)) continue;
      const units = Array.isArray(workspace.units) ? workspace.units : [];
      const unit = units.find((u) => Number(u && u.id) === unitId);
      if (!unit) continue;
      const timeline = Array.isArray(unit.timeline)
        ? unit.timeline.map(sanitizePublicTimelineEntry).filter(Boolean)
        : [];
      return res.json({
        success: true,
        unit: {
          id: normalizeUnitId(unit.id),
          name: unit.name || `Unit ${unit.id}`,
        },
        timeline,
      });
    }
    return res.status(404).json({ success: false, message: 'Unit not found.' });
  } catch (error) {
    if (error.code === '42P01') {
      return res.status(503).json({
        success: false,
        code: 'unit_progress_tables_missing',
        message: 'Unit Progress table missing. Run scripts/create_unit_progress_tables.sql',
      });
    }
    console.error('unitProgress getPublicTimeline:', error);
    return res.status(500).json({ success: false, message: 'Failed to load public timeline.' });
  }
}

function normalizeUnitId(value) {
  if (value == null) return '';
  return String(value).trim();
}

function getUnitFromWorkspace(workspace, unitId) {
  if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace)) return null;
  const units = Array.isArray(workspace.units) ? workspace.units : [];
  const target = normalizeUnitId(unitId);
  if (!target) return null;
  return units.find((u) => normalizeUnitId(u && u.id) === target) || null;
}

function sanitizeIncomingProgress(body) {
  const payload = body && typeof body === 'object' ? body : {};
  const stage = String(payload.stage || '').trim();
  const status = String(payload.status || '').trim();
  const reason = String(payload.reason || '').trim();
  const comment = String(payload.comment || '').trim();
  const photosRaw = Array.isArray(payload.photos) ? payload.photos : [];
  const photos = photosRaw
    .map((photo) => {
      if (!photo || typeof photo !== 'object') return null;
      const name = String(photo.name || '').trim() || 'photo';
      const src = String(photo.src || '').trim();
      if (!src) return null;
      return { name, src };
    })
    .filter(Boolean)
    .slice(0, 5);

  if (!stage) throw new Error('Stage is required.');
  if (!status) throw new Error('Status is required.');
  if (!comment) throw new Error('Comment is required.');
  if (status === 'Blocked' && !reason) throw new Error('Reason is required for blocked status.');

  return {
    stage,
    status,
    reason: status === 'Blocked' ? reason : '',
    comment,
    photos,
  };
}

async function getPrivateTimelineManager(req, res) {
  const companyId = getManagerCompanyId(req);
  const unitId = normalizeUnitId(req.params.unitId);
  if (companyId == null || !unitId) {
    return res.status(400).json({ success: false, message: 'Invalid request.' });
  }
  try {
    const workspace = await getWorkspaceByCompanyId(companyId);
    const unit = getUnitFromWorkspace(workspace, unitId);
    if (!unit) return res.status(404).json({ success: false, message: 'Unit not found.' });
    return res.json({
      success: true,
      unit: { id: Number(unit.id), name: unit.name || `Unit ${unit.id}` },
      timeline: Array.isArray(unit.timeline) ? unit.timeline : [],
    });
  } catch (error) {
    console.error('unitProgress getPrivateTimelineManager:', error);
    return res.status(500).json({ success: false, message: 'Failed to load private timeline.' });
  }
}

async function getPrivateTimelineSupervisor(req, res) {
  const companyId = getSupervisorCompanyId(req);
  const unitId = normalizeUnitId(req.params.unitId);
  if (companyId == null || !unitId) {
    return res.status(400).json({ success: false, message: 'Invalid request.' });
  }
  try {
    const workspace = await getWorkspaceByCompanyId(companyId);
    const unit = getUnitFromWorkspace(workspace, unitId);
    if (!unit) return res.status(404).json({ success: false, message: 'Unit not found.' });
    const supervisorProjectId = req.supervisor && req.supervisor.project_id != null
      ? Number(req.supervisor.project_id)
      : null;
    const unitProjectId = unit && unit.project_id != null ? Number(unit.project_id) : null;
    if (supervisorProjectId == null || unitProjectId == null || supervisorProjectId !== unitProjectId) {
      return res.status(403).json({
        success: false,
        message: 'Supervisor does not have access to this project timeline.',
      });
    }
    return res.json({
      success: true,
      unit: { id: Number(unit.id), name: unit.name || `Unit ${unit.id}` },
      timeline: Array.isArray(unit.timeline) ? unit.timeline : [],
    });
  } catch (error) {
    console.error('unitProgress getPrivateTimelineSupervisor:', error);
    return res.status(500).json({ success: false, message: 'Failed to load private timeline.' });
  }
}

async function appendPrivateProgressManager(req, res) {
  const companyId = getManagerCompanyId(req);
  const unitId = normalizeUnitId(req.params.unitId);
  if (companyId == null || !unitId) {
    return res.status(400).json({ success: false, message: 'Invalid request.' });
  }
  try {
    const progress = sanitizeIncomingProgress(req.body);
    const workspace = await getWorkspaceByCompanyId(companyId);
    const unit = getUnitFromWorkspace(workspace, unitId);
    if (!unit) return res.status(404).json({ success: false, message: 'Unit not found.' });
    if (!Array.isArray(unit.timeline)) unit.timeline = [];
    const userName = [req.manager && req.manager.name, req.manager && req.manager.surname].filter(Boolean).join(' ').trim()
      || (req.manager && req.manager.email)
      || 'Manager';
    unit.timeline.push({
      ...progress,
      user: userName,
      date: new Date().toISOString(),
    });
    workspace.updated_at = new Date().toISOString();
    await upsertWorkspace(companyId, workspace, 'manager', req.manager && req.manager.id ? req.manager.id : null);
    return res.json({ success: true, timeline: unit.timeline });
  } catch (error) {
    if (error.message && error.message.endsWith('required.')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error('unitProgress appendPrivateProgressManager:', error);
    return res.status(500).json({ success: false, message: 'Failed to append progress.' });
  }
}

async function appendPrivateProgressSupervisor(req, res) {
  const companyId = getSupervisorCompanyId(req);
  const unitId = normalizeUnitId(req.params.unitId);
  if (companyId == null || !unitId) {
    return res.status(400).json({ success: false, message: 'Invalid request.' });
  }
  try {
    const progress = sanitizeIncomingProgress(req.body);
    const workspace = await getWorkspaceByCompanyId(companyId);
    const unit = getUnitFromWorkspace(workspace, unitId);
    if (!unit) return res.status(404).json({ success: false, message: 'Unit not found.' });
    const supervisorProjectId = req.supervisor && req.supervisor.project_id != null
      ? Number(req.supervisor.project_id)
      : null;
    const unitProjectId = unit && unit.project_id != null ? Number(unit.project_id) : null;
    if (supervisorProjectId == null || unitProjectId == null || supervisorProjectId !== unitProjectId) {
      return res.status(403).json({
        success: false,
        message: 'Supervisor does not have access to this project timeline.',
      });
    }
    if (!Array.isArray(unit.timeline)) unit.timeline = [];
    const userName = (req.supervisor && req.supervisor.name) || (req.supervisor && req.supervisor.email) || 'Supervisor';
    unit.timeline.push({
      ...progress,
      user: userName,
      date: new Date().toISOString(),
    });
    workspace.updated_at = new Date().toISOString();
    await upsertWorkspace(
      companyId,
      workspace,
      'supervisor',
      req.supervisor && req.supervisor.id ? req.supervisor.id : null
    );
    return res.json({ success: true, timeline: unit.timeline });
  } catch (error) {
    if (error.message && error.message.endsWith('required.')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error('unitProgress appendPrivateProgressSupervisor:', error);
    return res.status(500).json({ success: false, message: 'Failed to append progress.' });
  }
}

module.exports = {
  getWorkspace,
  putWorkspace,
  getWorkspaceSupervisor,
  putWorkspaceSupervisor,
  getPublicTimeline,
  getPrivateTimelineManager,
  getPrivateTimelineSupervisor,
  appendPrivateProgressManager,
  appendPrivateProgressSupervisor,
};
