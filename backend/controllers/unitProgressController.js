/**
 * Unit Progress Tracking workspace API.
 * Stores full workspace JSON per company in unit_progress_state.
 */

const { pool } = require('../db/pool');
const { sendUnitDeleteVerificationEmail, sendFloorDeleteVerificationEmail } = require('../lib/sendCallbackRequestEmail');

/** Pending delete confirmations: key `${companyId}|${unitId}` → challenge */
const unitDeleteChallenges = new Map();

/** Pending floor delete confirmations */
const floorDeleteChallenges = new Map();

const UNIT_DELETE_OTP_TTL_MS = 10 * 60 * 1000;
const UNIT_DELETE_MAX_ATTEMPTS = 5;

function normalizeFloorId(value) {
  if (value == null) return '';
  return String(value).trim();
}

function floorDeleteChallengeKey(companyId, floorId) {
  return `${companyId}|fl:${normalizeFloorId(floorId)}`;
}

function unitDeleteChallengeKey(companyId, unitId) {
  return `${companyId}|${normalizeUnitId(unitId)}`;
}

function parseDeleteUnitCode(body) {
  const otpRaw = String((body && body.code) || (body && body.otp) || '').trim();
  const sixDigitsMatch = otpRaw.match(/\d{6}/);
  return sixDigitsMatch ? sixDigitsMatch[0] : String(otpRaw).replace(/\D/g, '');
}

async function getPrimaryManagerEmailForCompany(companyId) {
  const r = await pool.query(
    `SELECT email FROM manager WHERE company_id = $1 AND (active = true OR active IS NULL) ORDER BY id ASC LIMIT 1`,
    [companyId]
  );
  const email = r.rows[0] && r.rows[0].email ? String(r.rows[0].email).trim() : '';
  return email || null;
}

function supervisorHasUnitProjectAccess(req, unit) {
  const supervisorProjectId = req.supervisor && req.supervisor.project_id != null
    ? Number(req.supervisor.project_id)
    : null;
  const unitProjectId = unit && unit.project_id != null ? Number(unit.project_id) : null;
  return supervisorProjectId != null && unitProjectId != null && supervisorProjectId === unitProjectId;
}

/** Every unit on this floor must belong to the supervisor's project (or floor empty). */
function supervisorCanDeleteFloor(req, workspace, floor) {
  const supervisorProjectId = req.supervisor && req.supervisor.project_id != null
    ? Number(req.supervisor.project_id)
    : null;
  if (supervisorProjectId == null) return false;
  const tower = floor.tower;
  const floorNum = Number(floor.number);
  const units = (Array.isArray(workspace.units) ? workspace.units : []).filter(
    (u) => String(u.tower) === String(tower) && Number(u.floor) === floorNum
  );
  return units.every((u) => {
    const pid = u.project_id != null ? Number(u.project_id) : null;
    return pid === supervisorProjectId;
  });
}

function getManagerCompanyId(req) {
  return req.manager && req.manager.company_id != null ? Number(req.manager.company_id) : null;
}

function getSupervisorCompanyId(req) {
  return req.supervisor && req.supervisor.company_id != null ? Number(req.supervisor.company_id) : null;
}

function getOperativeCompanyId(req) {
  return req.operative && req.operative.company_id != null ? Number(req.operative.company_id) : null;
}

function normalizeScopedProjectId(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function getScopedProjectIdFromReq(req) {
  const q = req && req.query ? req.query.project_id : undefined;
  const b = req && req.body ? req.body.project_id : undefined;
  return normalizeScopedProjectId(q != null ? q : b);
}

async function getOperativeAccessProfile(req) {
  const opId = req && req.operative && req.operative.id != null ? Number(req.operative.id) : null;
  if (!Number.isInteger(opId) || opId < 1) {
    return { ok: false, message: 'Operative session is invalid.' };
  }
  const result = await pool.query(
    'SELECT id, company_id, project_id, name, email FROM users WHERE id = $1',
    [opId]
  );
  if (!result.rows.length) {
    return { ok: false, message: 'Operative user not found.' };
  }
  const row = result.rows[0];
  const companyId = row.company_id != null ? Number(row.company_id) : null;
  const projectId = row.project_id != null ? Number(row.project_id) : null;
  const displayName = String(row.name || '').trim() || String(row.email || '').trim() || 'Operative';
  if (companyId == null) {
    return { ok: false, message: 'Operative has no company assigned.' };
  }
  if (projectId == null) {
    return { ok: false, message: 'Operative has no project assigned.' };
  }
  return { ok: true, opId, companyId, projectId, displayName };
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

/** GET ?slim=1 — strip photo base64 so initial load is fast (client hydrates per unit). */
function slimWorkspaceForList(workspace) {
  if (!workspace || typeof workspace !== 'object') return workspace;
  const units = Array.isArray(workspace.units)
    ? workspace.units.map((u) => {
        if (!u || typeof u !== 'object') return u;
        const timeline = Array.isArray(u.timeline)
          ? u.timeline.map((entry) => {
              if (!entry || typeof entry !== 'object') return entry;
              const photos = Array.isArray(entry.photos)
                ? entry.photos.map((p) => {
                    if (typeof p === 'string') return p;
                    if (p && typeof p === 'object') {
                      return { name: p.name || 'photo', src: '' };
                    }
                    return p;
                  })
                : [];
              return { ...entry, photos };
            })
          : [];
        return { ...u, timeline };
      })
    : [];
  return { ...workspace, units };
}

function timelineEntryKey(entry) {
  if (!entry || typeof entry !== 'object') return '';
  if (entry.entryType === 'qa_job' && entry.qaJobId != null && String(entry.qaJobId).trim() !== '') {
    return `qa_job:${String(entry.qaJobId)}`;
  }
  const d = entry.date != null ? String(entry.date) : '';
  const st = entry.stage != null ? String(entry.stage) : '';
  const c = entry.comment != null ? String(entry.comment) : '';
  const u = entry.user != null ? String(entry.user) : '';
  return `${d}|${st}|${c}|${u}`;
}

function mergePhotosPreserveSrc(prevPhotos, incPhotos) {
  const prev = Array.isArray(prevPhotos) ? prevPhotos : [];
  const inc = Array.isArray(incPhotos) ? incPhotos : [];
  if (!inc.length && prev.length) {
    return prev.map((p) => (typeof p === 'object' && p ? { ...p } : p));
  }
  return inc.map((p, i) => {
    if (p && typeof p === 'object') {
      const src = String(p.src || '').trim();
      if (src) return p;
      const pp = prev[i];
      if (pp && typeof pp === 'object' && String(pp.src || '').trim()) {
        return { name: p.name || pp.name || 'photo', src: pp.src };
      }
      const byName = prev.find((x) => x && typeof x === 'object' && x.name === p.name);
      if (byName && String(byName.src || '').trim()) {
        return { name: p.name || byName.name, src: byName.src };
      }
    }
    return p;
  });
}

function mergeTimelineEntries(prevTl, incTl, removedQaJobIdsRaw) {
  const prev = Array.isArray(prevTl) ? prevTl : [];
  const inc = Array.isArray(incTl) ? incTl : [];
  const removedQaIds = new Set();
  if (Array.isArray(removedQaJobIdsRaw)) {
    removedQaJobIdsRaw.forEach((rid) => {
      const n = Number(rid);
      if (Number.isInteger(n) && n >= 1) removedQaIds.add(n);
    });
  }
  const prevByKey = new Map();
  prev.forEach((e) => {
    const k = timelineEntryKey(e);
    if (k && !prevByKey.has(k)) prevByKey.set(k, e);
  });
  const incKeys = new Set();
  inc.forEach((e) => {
    const k = timelineEntryKey(e);
    if (k) incKeys.add(k);
  });
  const mergedInc = inc.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const prevEntry = prevByKey.get(timelineEntryKey(entry));
    if (!prevEntry) return entry;
    return {
      ...entry,
      photos: mergePhotosPreserveSrc(prevEntry.photos, entry.photos),
    };
  });
  /*
   * The client timeline may be stale (e.g. created a QA job server-side → new row exists in DB
   * but the browser PUT still lacks it). Preserve qa_job rows from DB unless explicitly removed,
   * and never resurrect rows the user deliberately removed (_removedQaJobIds).
   */
  const prevQaAnchors = prev.filter((e) => {
    if (!e || typeof e !== 'object' || String(e.entryType || '').trim() !== 'qa_job') return false;
    const jid = Number(e.qaJobId);
    if (!Number.isInteger(jid)) return false;
    if (removedQaIds.has(jid)) return false;
    const k = timelineEntryKey(e);
    return !!(k && !incKeys.has(k));
  });
  let out = [...mergedInc, ...prevQaAnchors];
  out = out.filter((e) => {
    if (!e || typeof e !== 'object' || String(e.entryType || '').trim() !== 'qa_job') return true;
    const jid = Number(e.qaJobId);
    if (!Number.isInteger(jid)) return true;
    return !removedQaIds.has(jid);
  });
  return out;
}

/**
 * PUT after slim GET may send empty photo src; merge from DB copy so images are not wiped.
 */
function mergeWorkspacePreserveTimelinePhotos(existing, incoming) {
  const sanitized = sanitizeWorkspace(incoming);
  const exUnits = Array.isArray(existing.units) ? existing.units : [];
  const byId = new Map();
  exUnits.forEach((u) => {
    const id = normalizeUnitId(u && u.id);
    if (id) byId.set(id, u);
  });
  sanitized.units = sanitized.units.map((u) => {
    const id = normalizeUnitId(u && u.id);
    const prev = byId.get(id);
    if (!prev || !Array.isArray(prev.timeline)) return u;
    const removedQaRaw = u && Array.isArray(u._removedQaJobIds) ? u._removedQaJobIds : [];
    return {
      ...u,
      timeline: mergeTimelineEntries(prev.timeline, u.timeline, removedQaRaw),
    };
  });
  return sanitized;
}

async function getWorkspaceByCompanyId(companyId, projectId) {
  const pid = normalizeScopedProjectId(projectId);
  let rowWorkspace = null;
  try {
    const scoped = await pool.query(
      'SELECT workspace FROM unit_progress_state WHERE company_id = $1 AND project_id = $2',
      [companyId, pid]
    );
    if (scoped.rows.length) rowWorkspace = scoped.rows[0].workspace;
  } catch (error) {
    if (error && error.code !== '42703') throw error;
    const legacy = await pool.query(
      'SELECT workspace FROM unit_progress_state WHERE company_id = $1',
      [companyId]
    );
    if (legacy.rows.length) rowWorkspace = legacy.rows[0].workspace;
  }
  if (!rowWorkspace) return defaultWorkspace();
  if (!rowWorkspace || typeof rowWorkspace !== 'object' || Array.isArray(rowWorkspace)) {
    return defaultWorkspace();
  }
  return rowWorkspace;
}

async function upsertWorkspace(companyId, projectId, workspace, actorKind, actorId) {
  const pid = normalizeScopedProjectId(projectId);
  try {
    await pool.query(
      `INSERT INTO unit_progress_state (company_id, project_id, workspace, updated_by_kind, updated_by_id, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, NOW())
       ON CONFLICT (company_id, project_id)
       DO UPDATE SET
         workspace = EXCLUDED.workspace,
         updated_by_kind = EXCLUDED.updated_by_kind,
         updated_by_id = EXCLUDED.updated_by_id,
         updated_at = NOW()`,
      [companyId, pid, JSON.stringify(workspace), actorKind, actorId]
    );
  } catch (error) {
    if (!(error && (error.code === '42703' || error.code === '42P10'))) throw error;
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
}

async function getWorkspace(req, res) {
  const companyId = getManagerCompanyId(req);
  const projectId = getScopedProjectIdFromReq(req);
  if (companyId == null) {
    return res.status(400).json({ success: false, message: 'Manager has no company_id.' });
  }
  try {
    const workspace = await getWorkspaceByCompanyId(companyId, projectId);
    const slim =
      String(req.query.slim || '').trim() === '1' ||
      String(req.query.slim || '').toLowerCase() === 'true';
    const payload = slim ? slimWorkspaceForList(workspace) : workspace;
    return res.json({ success: true, workspace: payload });
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
  const projectId = getScopedProjectIdFromReq(req);
  if (companyId == null) {
    return res.status(400).json({ success: false, message: 'Manager has no company_id.' });
  }
  try {
    const existing = await getWorkspaceByCompanyId(companyId, projectId);
    const incoming = sanitizeWorkspace(req.body && req.body.workspace ? req.body.workspace : req.body);
    const workspace = mergeWorkspacePreserveTimelinePhotos(existing, incoming);
    await upsertWorkspace(companyId, projectId, workspace, 'manager', req.manager && req.manager.id ? req.manager.id : null);
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
  const projectId = getScopedProjectIdFromReq(req);
  if (companyId == null) {
    return res.status(400).json({ success: false, message: 'Supervisor has no company_id.' });
  }
  try {
    const workspace = await getWorkspaceByCompanyId(companyId, projectId);
    const slim =
      String(req.query.slim || '').trim() === '1' ||
      String(req.query.slim || '').toLowerCase() === 'true';
    const payload = slim ? slimWorkspaceForList(workspace) : workspace;
    return res.json({ success: true, workspace: payload });
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
  const projectId = getScopedProjectIdFromReq(req);
  if (companyId == null) {
    return res.status(400).json({ success: false, message: 'Supervisor has no company_id.' });
  }
  try {
    const existing = await getWorkspaceByCompanyId(companyId, projectId);
    const incoming = sanitizeWorkspace(req.body && req.body.workspace ? req.body.workspace : req.body);
    const workspace = mergeWorkspacePreserveTimelinePhotos(existing, incoming);
    await upsertWorkspace(
      companyId,
      projectId,
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

/**
 * Append a read-only QA job reference to this unit's private timeline (workspace JSON).
 * Does not expose internal job ids on the public QR timeline (those entries are stripped there).
 */
async function appendQaJobLinkToUnitTimeline(opts) {
  const {
    companyId,
    unitId: unitIdRaw,
    projectId,
    qaJobId,
    qaJobNumber,
    qaJobTitle,
    actorKind,
    actorId,
    actorLabel,
  } = opts || {};
  const cid = companyId != null ? Number(companyId) : null;
  if (!Number.isFinite(cid)) return { ok: false, reason: 'bad_company' };
  const unitId = normalizeUnitId(unitIdRaw);
  const jid = qaJobId != null ? Number(qaJobId) : NaN;
  if (!unitId || !Number.isInteger(jid) || jid < 1) return { ok: false, reason: 'bad_args' };

  const scopedProjectId = normalizeScopedProjectId(projectId);
  let workspace = await getWorkspaceByCompanyId(cid, scopedProjectId);
  const unit = getUnitFromWorkspace(workspace, unitId);
  if (!unit) return { ok: false, reason: 'unit_not_found' };

  const pid = parseInt(String(projectId), 10);
  const unitPid = unit.project_id != null && String(unit.project_id).trim() !== '' ? Number(unit.project_id) : null;
  if (
    Number.isFinite(unitPid)
    && Number.isFinite(pid)
    && unitPid !== pid
  ) {
    return { ok: false, reason: 'project_mismatch' };
  }

  if (!Array.isArray(unit.timeline)) unit.timeline = [];

  const num = qaJobNumber != null ? String(qaJobNumber).trim() : '';
  const title = qaJobTitle != null ? String(qaJobTitle).trim() : '';
  const parts = [];
  if (num) parts.push(`Ref ${num}`);
  if (title) parts.push(title);
  const comment = parts.length ? parts.join(' · ') : `QA job #${jid}`;

  unit.timeline.push({
    entryType: 'qa_job',
    qaJobId: jid,
    qaJobNumber: num,
    qaJobTitle: title,
    qaProjectId: Number.isFinite(pid) ? pid : null,
    stage: 'Quality Assurance',
    status: 'QA job',
    reason: '',
    comment,
    photos: [],
    user: actorLabel && String(actorLabel).trim() ? String(actorLabel).trim() : 'Quality Assurance',
    date: new Date().toISOString(),
  });
  workspace = sanitizeWorkspace(workspace);
  await upsertWorkspace(
    cid,
    scopedProjectId,
    workspace,
    actorKind === 'supervisor' ? 'supervisor' : 'manager',
    actorId != null && Number.isFinite(Number(actorId)) ? Number(actorId) : null
  );
  return { ok: true };
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
      const unit = units.find((u) => normalizeUnitId(u && u.id) === unitId);
      if (!unit) continue;
      const timeline = Array.isArray(unit.timeline)
        ? unit.timeline
            .filter((ent) => !ent || ent.entryType !== 'qa_job')
            .map(sanitizePublicTimelineEntry)
            .filter(Boolean)
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
  const projectId = getScopedProjectIdFromReq(req);
  const unitId = normalizeUnitId(req.params.unitId);
  if (companyId == null || !unitId) {
    return res.status(400).json({ success: false, message: 'Invalid request.' });
  }
  try {
    const workspace = await getWorkspaceByCompanyId(companyId, projectId);
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
  const projectId = getScopedProjectIdFromReq(req);
  const unitId = normalizeUnitId(req.params.unitId);
  if (companyId == null || !unitId) {
    return res.status(400).json({ success: false, message: 'Invalid request.' });
  }
  try {
    const workspace = await getWorkspaceByCompanyId(companyId, projectId);
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
  const projectId = getScopedProjectIdFromReq(req);
  const unitId = normalizeUnitId(req.params.unitId);
  if (companyId == null || !unitId) {
    return res.status(400).json({ success: false, message: 'Invalid request.' });
  }
  try {
    const progress = sanitizeIncomingProgress(req.body);
    const workspace = await getWorkspaceByCompanyId(companyId, projectId);
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
    await upsertWorkspace(companyId, projectId, workspace, 'manager', req.manager && req.manager.id ? req.manager.id : null);
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
  const projectId = getScopedProjectIdFromReq(req);
  const unitId = normalizeUnitId(req.params.unitId);
  if (companyId == null || !unitId) {
    return res.status(400).json({ success: false, message: 'Invalid request.' });
  }
  try {
    const progress = sanitizeIncomingProgress(req.body);
    const workspace = await getWorkspaceByCompanyId(companyId, projectId);
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
      projectId,
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

function buildOperativeUnitLabel(unit) {
  const tower = unit && unit.tower != null ? String(unit.tower).trim() : '';
  const floor = unit && unit.floor != null ? String(unit.floor).trim() : '';
  const unitName = unit && unit.name != null ? String(unit.name).trim() : '';
  const parts = [tower ? `Tower ${tower}` : '', floor ? `Floor ${floor}` : '', unitName || 'Unit'];
  return parts.filter(Boolean).join(' • ');
}

async function getOperativeDailyRecordUnits(req, res) {
  const fallbackCompanyId = getOperativeCompanyId(req);
  if (fallbackCompanyId == null) {
    return res.status(400).json({ success: false, message: 'Operative has no company_id.' });
  }
  try {
    const profile = await getOperativeAccessProfile(req);
    if (!profile.ok) return res.status(403).json({ success: false, message: profile.message });
    const workspace = await getWorkspaceByCompanyId(profile.companyId, profile.projectId);
    const units = (Array.isArray(workspace.units) ? workspace.units : [])
      .filter((u) => {
        const unitProjectId = u && u.project_id != null ? Number(u.project_id) : null;
        return unitProjectId != null && unitProjectId === profile.projectId;
      })
      .map((u) => ({
        id: normalizeUnitId(u && u.id),
        name: String((u && u.name) || '').trim() || `Unit ${normalizeUnitId(u && u.id)}`,
        tower: u && u.tower != null ? u.tower : '',
        floor: u && u.floor != null ? u.floor : '',
        label: buildOperativeUnitLabel(u),
      }))
      .filter((u) => !!u.id);
    return res.json({ success: true, units });
  } catch (error) {
    console.error('unitProgress getOperativeDailyRecordUnits:', error);
    return res.status(500).json({ success: false, message: 'Failed to load units for daily records.' });
  }
}

async function getPrivateTimelineOperative(req, res) {
  const unitId = normalizeUnitId(req.params.unitId);
  if (!unitId) return res.status(400).json({ success: false, message: 'Invalid request.' });
  try {
    const profile = await getOperativeAccessProfile(req);
    if (!profile.ok) return res.status(403).json({ success: false, message: profile.message });
    const workspace = await getWorkspaceByCompanyId(profile.companyId, profile.projectId);
    const unit = getUnitFromWorkspace(workspace, unitId);
    if (!unit) return res.status(404).json({ success: false, message: 'Unit not found.' });
    const unitProjectId = unit && unit.project_id != null ? Number(unit.project_id) : null;
    if (unitProjectId == null || unitProjectId !== profile.projectId) {
      return res.status(403).json({ success: false, message: 'Operative does not have access to this unit.' });
    }
    const timeline = (Array.isArray(unit.timeline) ? unit.timeline : []).filter((entry) => {
      const authorKind = String((entry && entry.author_kind) || '').trim();
      const authorId = entry && entry.author_id != null ? Number(entry.author_id) : null;
      return authorKind === 'operative' && authorId === profile.opId;
    });
    return res.json({
      success: true,
      unit: { id: normalizeUnitId(unit.id), name: unit.name || `Unit ${unit.id}` },
      timeline,
    });
  } catch (error) {
    console.error('unitProgress getPrivateTimelineOperative:', error);
    return res.status(500).json({ success: false, message: 'Failed to load private timeline.' });
  }
}

async function appendPrivateProgressOperative(req, res) {
  const unitId = normalizeUnitId(req.params.unitId);
  if (!unitId) return res.status(400).json({ success: false, message: 'Invalid request.' });
  try {
    const profile = await getOperativeAccessProfile(req);
    if (!profile.ok) return res.status(403).json({ success: false, message: profile.message });
    const progress = sanitizeIncomingProgress(req.body);
    const workspace = await getWorkspaceByCompanyId(profile.companyId, profile.projectId);
    const unit = getUnitFromWorkspace(workspace, unitId);
    if (!unit) return res.status(404).json({ success: false, message: 'Unit not found.' });
    const unitProjectId = unit && unit.project_id != null ? Number(unit.project_id) : null;
    if (unitProjectId == null || unitProjectId !== profile.projectId) {
      return res.status(403).json({ success: false, message: 'Operative does not have access to this unit.' });
    }
    if (!Array.isArray(unit.timeline)) unit.timeline = [];
    const entryId = `opr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    unit.timeline.push({
      ...progress,
      entry_id: entryId,
      author_kind: 'operative',
      author_id: profile.opId,
      user: profile.displayName,
      date: new Date().toISOString(),
    });
    workspace.updated_at = new Date().toISOString();
    await upsertWorkspace(profile.companyId, profile.projectId, workspace, 'operative', profile.opId);
    const ownTimeline = unit.timeline.filter((entry) => {
      const authorKind = String((entry && entry.author_kind) || '').trim();
      const authorId = entry && entry.author_id != null ? Number(entry.author_id) : null;
      return authorKind === 'operative' && authorId === profile.opId;
    });
    return res.json({ success: true, timeline: ownTimeline });
  } catch (error) {
    if (error.message && error.message.endsWith('required.')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error('unitProgress appendPrivateProgressOperative:', error);
    return res.status(500).json({ success: false, message: 'Failed to append progress.' });
  }
}

async function deletePrivateProgressOperative(req, res) {
  const unitId = normalizeUnitId(req.params.unitId);
  const entryId = String((req.body && req.body.entryId) || '').trim();
  if (!unitId || !entryId) {
    return res.status(400).json({ success: false, message: 'Valid unit id and entry id are required.' });
  }
  try {
    const profile = await getOperativeAccessProfile(req);
    if (!profile.ok) return res.status(403).json({ success: false, message: profile.message });
    const workspace = await getWorkspaceByCompanyId(profile.companyId, profile.projectId);
    const unit = getUnitFromWorkspace(workspace, unitId);
    if (!unit) return res.status(404).json({ success: false, message: 'Unit not found.' });
    const unitProjectId = unit && unit.project_id != null ? Number(unit.project_id) : null;
    if (unitProjectId == null || unitProjectId !== profile.projectId) {
      return res.status(403).json({ success: false, message: 'Operative does not have access to this unit.' });
    }
    const before = Array.isArray(unit.timeline) ? unit.timeline.length : 0;
    unit.timeline = (Array.isArray(unit.timeline) ? unit.timeline : []).filter((entry) => {
      const isTarget = String((entry && entry.entry_id) || '').trim() === entryId;
      if (!isTarget) return true;
      const authorKind = String((entry && entry.author_kind) || '').trim();
      const authorId = entry && entry.author_id != null ? Number(entry.author_id) : null;
      return !(authorKind === 'operative' && authorId === profile.opId);
    });
    if (unit.timeline.length === before) {
      return res.status(404).json({ success: false, message: 'Timeline entry not found.' });
    }
    workspace.updated_at = new Date().toISOString();
    await upsertWorkspace(profile.companyId, profile.projectId, workspace, 'operative', profile.opId);
    const ownTimeline = unit.timeline.filter((entry) => {
      const authorKind = String((entry && entry.author_kind) || '').trim();
      const authorId = entry && entry.author_id != null ? Number(entry.author_id) : null;
      return authorKind === 'operative' && authorId === profile.opId;
    });
    return res.json({ success: true, timeline: ownTimeline });
  } catch (error) {
    console.error('unitProgress deletePrivateProgressOperative:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete progress entry.' });
  }
}

async function updatePrivateProgressOperative(req, res) {
  const unitId = normalizeUnitId(req.params.unitId);
  const entryId = String((req.body && req.body.entryId) || '').trim();
  if (!unitId || !entryId) {
    return res.status(400).json({ success: false, message: 'Valid unit id and entry id are required.' });
  }
  try {
    const profile = await getOperativeAccessProfile(req);
    if (!profile.ok) return res.status(403).json({ success: false, message: profile.message });
    const progress = sanitizeIncomingProgress(req.body);
    const workspace = await getWorkspaceByCompanyId(profile.companyId, profile.projectId);
    const unit = getUnitFromWorkspace(workspace, unitId);
    if (!unit) return res.status(404).json({ success: false, message: 'Unit not found.' });
    const unitProjectId = unit && unit.project_id != null ? Number(unit.project_id) : null;
    if (unitProjectId == null || unitProjectId !== profile.projectId) {
      return res.status(403).json({ success: false, message: 'Operative does not have access to this unit.' });
    }
    let updated = false;
    unit.timeline = (Array.isArray(unit.timeline) ? unit.timeline : []).map((entry) => {
      const isTarget = String((entry && entry.entry_id) || '').trim() === entryId;
      if (!isTarget) return entry;
      const authorKind = String((entry && entry.author_kind) || '').trim();
      const authorId = entry && entry.author_id != null ? Number(entry.author_id) : null;
      if (!(authorKind === 'operative' && authorId === profile.opId)) return entry;
      updated = true;
      const nextPhotos =
        Array.isArray(progress.photos) && progress.photos.length
          ? progress.photos
          : (Array.isArray(entry.photos) ? entry.photos : []);
      return {
        ...entry,
        ...progress,
        photos: nextPhotos,
      };
    });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Timeline entry not found.' });
    }
    workspace.updated_at = new Date().toISOString();
    await upsertWorkspace(profile.companyId, profile.projectId, workspace, 'operative', profile.opId);
    const ownTimeline = unit.timeline.filter((entry) => {
      const authorKind = String((entry && entry.author_kind) || '').trim();
      const authorId = entry && entry.author_id != null ? Number(entry.author_id) : null;
      return authorKind === 'operative' && authorId === profile.opId;
    });
    return res.json({ success: true, timeline: ownTimeline });
  } catch (error) {
    if (error.message && error.message.endsWith('required.')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error('unitProgress updatePrivateProgressOperative:', error);
    return res.status(500).json({ success: false, message: 'Failed to update progress entry.' });
  }
}

function removeUnitFromWorkspace(workspace, unitId) {
  const target = normalizeUnitId(unitId);
  if (!target || !workspace || typeof workspace !== 'object' || !Array.isArray(workspace.units)) {
    return false;
  }
  const before = workspace.units.length;
  workspace.units = workspace.units.filter((u) => normalizeUnitId(u && u.id) !== target);
  return workspace.units.length < before;
}

function getFloorFromWorkspace(workspace, floorId) {
  const id = normalizeFloorId(floorId);
  if (!id) return null;
  const floors = Array.isArray(workspace.floors) ? workspace.floors : [];
  return floors.find((f) => normalizeFloorId(f && f.id) === id) || null;
}

function removeFloorFromWorkspace(workspace, floorId) {
  const floor = getFloorFromWorkspace(workspace, floorId);
  if (!floor) return false;
  const tower = floor.tower;
  const floorNum = Number(floor.number);
  workspace.units = (Array.isArray(workspace.units) ? workspace.units : []).filter(
    (u) => !(String(u.tower) === String(tower) && Number(u.floor) === floorNum)
  );
  const fid = normalizeFloorId(floorId);
  workspace.floors = (Array.isArray(workspace.floors) ? workspace.floors : []).filter(
    (f) => normalizeFloorId(f && f.id) !== fid
  );
  return true;
}

async function requestDeleteUnitManager(req, res) {
  const companyId = getManagerCompanyId(req);
  const projectId = getScopedProjectIdFromReq(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const unitId = normalizeUnitId(body.unitId);
  if (companyId == null || !unitId) {
    return res.status(400).json({ success: false, message: 'Valid unit id is required.' });
  }
  const toEmail = req.manager && req.manager.email ? String(req.manager.email).trim() : '';
  if (!toEmail) {
    return res.status(400).json({ success: false, message: 'Manager email is missing; cannot send verification code.' });
  }
  try {
    const workspace = await getWorkspaceByCompanyId(companyId, projectId);
    const unit = getUnitFromWorkspace(workspace, unitId);
    if (!unit) {
      return res.status(404).json({ success: false, message: 'Unit not found.' });
    }
    const now = Date.now();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const key = unitDeleteChallengeKey(companyId, unitId);
    unitDeleteChallenges.set(key, {
      code,
      expiresAt: now + UNIT_DELETE_OTP_TTL_MS,
      attempts: 0,
    });
    const unitName = unit.name || `Unit ${unit.id}`;
    await sendUnitDeleteVerificationEmail({ to: toEmail, code, unitName });
    return res.json({
      success: true,
      message: 'Verification code sent to your manager email.',
      otp_expires_in_sec: Math.floor(UNIT_DELETE_OTP_TTL_MS / 1000),
    });
  } catch (error) {
    unitDeleteChallenges.delete(unitDeleteChallengeKey(companyId, unitId));
    if (error.code === 'SMTP_NOT_CONFIGURED') {
      return res.status(503).json({
        success: false,
        message: 'Email is not configured on the server; cannot send verification code.',
      });
    }
    console.error('unitProgress requestDeleteUnitManager:', error);
    return res.status(500).json({ success: false, message: 'Failed to send verification email.' });
  }
}

async function confirmDeleteUnitManager(req, res) {
  const companyId = getManagerCompanyId(req);
  const projectId = getScopedProjectIdFromReq(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const unitId = normalizeUnitId(body.unitId);
  const otpInput = parseDeleteUnitCode(body);
  if (companyId == null || !unitId) {
    return res.status(400).json({ success: false, message: 'Valid unit id is required.' });
  }
  if (!otpInput) {
    return res.status(400).json({ success: false, message: 'Verification code is required.' });
  }
  const key = unitDeleteChallengeKey(companyId, unitId);
  const challenge = unitDeleteChallenges.get(key);
  const now = Date.now();
  if (!challenge || !challenge.expiresAt || challenge.expiresAt <= now) {
    unitDeleteChallenges.delete(key);
    return res.status(400).json({
      success: false,
      message: 'Code expired or missing. Request a new verification code.',
    });
  }
  challenge.attempts += 1;
  if (challenge.attempts > UNIT_DELETE_MAX_ATTEMPTS) {
    unitDeleteChallenges.delete(key);
    return res.status(429).json({
      success: false,
      message: 'Too many attempts. Request a new verification code.',
    });
  }
  const expected = String(challenge.code || '').replace(/\D/g, '');
  if (expected !== otpInput) {
    return res.status(403).json({ success: false, message: 'Invalid verification code.' });
  }
  try {
    const existing = await getWorkspaceByCompanyId(companyId, projectId);
    const unit = getUnitFromWorkspace(existing, unitId);
    if (!unit) {
      unitDeleteChallenges.delete(key);
      return res.status(404).json({ success: false, message: 'Unit not found.' });
    }
    removeUnitFromWorkspace(existing, unitId);
    existing.updated_at = new Date().toISOString();
    await upsertWorkspace(companyId, projectId, existing, 'manager', req.manager && req.manager.id ? req.manager.id : null);
    unitDeleteChallenges.delete(key);
    return res.json({ success: true, workspace: existing });
  } catch (error) {
    if (error.code === '42P01') {
      return res.status(503).json({
        success: false,
        code: 'unit_progress_tables_missing',
        message: 'Unit Progress table missing. Run scripts/create_unit_progress_tables.sql',
      });
    }
    console.error('unitProgress confirmDeleteUnitManager:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete unit.' });
  }
}

async function requestDeleteUnitSupervisor(req, res) {
  const companyId = getSupervisorCompanyId(req);
  const projectId = getScopedProjectIdFromReq(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const unitId = normalizeUnitId(body.unitId);
  if (companyId == null || !unitId) {
    return res.status(400).json({ success: false, message: 'Valid unit id is required.' });
  }
  try {
    const workspace = await getWorkspaceByCompanyId(companyId, projectId);
    const unit = getUnitFromWorkspace(workspace, unitId);
    if (!unit) {
      return res.status(404).json({ success: false, message: 'Unit not found.' });
    }
    if (!supervisorHasUnitProjectAccess(req, unit)) {
      return res.status(403).json({
        success: false,
        message: 'Supervisor does not have access to this project.',
      });
    }
    const toEmail = await getPrimaryManagerEmailForCompany(companyId);
    if (!toEmail) {
      return res.status(400).json({
        success: false,
        message: 'No active manager email found for this company.',
      });
    }
    const now = Date.now();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const key = unitDeleteChallengeKey(companyId, unitId);
    unitDeleteChallenges.set(key, {
      code,
      expiresAt: now + UNIT_DELETE_OTP_TTL_MS,
      attempts: 0,
    });
    const unitName = unit.name || `Unit ${unit.id}`;
    await sendUnitDeleteVerificationEmail({ to: toEmail, code, unitName });
    return res.json({
      success: true,
      message: 'Verification code sent to the company manager email.',
      otp_expires_in_sec: Math.floor(UNIT_DELETE_OTP_TTL_MS / 1000),
    });
  } catch (error) {
    unitDeleteChallenges.delete(unitDeleteChallengeKey(companyId, unitId));
    if (error.code === 'SMTP_NOT_CONFIGURED') {
      return res.status(503).json({
        success: false,
        message: 'Email is not configured on the server; cannot send verification code.',
      });
    }
    console.error('unitProgress requestDeleteUnitSupervisor:', error);
    return res.status(500).json({ success: false, message: 'Failed to send verification email.' });
  }
}

async function confirmDeleteUnitSupervisor(req, res) {
  const companyId = getSupervisorCompanyId(req);
  const projectId = getScopedProjectIdFromReq(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const unitId = normalizeUnitId(body.unitId);
  const otpInput = parseDeleteUnitCode(body);
  if (companyId == null || !unitId) {
    return res.status(400).json({ success: false, message: 'Valid unit id is required.' });
  }
  if (!otpInput) {
    return res.status(400).json({ success: false, message: 'Verification code is required.' });
  }
  const key = unitDeleteChallengeKey(companyId, unitId);
  const challenge = unitDeleteChallenges.get(key);
  const now = Date.now();
  if (!challenge || !challenge.expiresAt || challenge.expiresAt <= now) {
    unitDeleteChallenges.delete(key);
    return res.status(400).json({
      success: false,
      message: 'Code expired or missing. Request a new verification code.',
    });
  }
  challenge.attempts += 1;
  if (challenge.attempts > UNIT_DELETE_MAX_ATTEMPTS) {
    unitDeleteChallenges.delete(key);
    return res.status(429).json({
      success: false,
      message: 'Too many attempts. Request a new verification code.',
    });
  }
  const expected = String(challenge.code || '').replace(/\D/g, '');
  if (expected !== otpInput) {
    return res.status(403).json({ success: false, message: 'Invalid verification code.' });
  }
  try {
    const existing = await getWorkspaceByCompanyId(companyId, projectId);
    const unit = getUnitFromWorkspace(existing, unitId);
    if (!unit) {
      unitDeleteChallenges.delete(key);
      return res.status(404).json({ success: false, message: 'Unit not found.' });
    }
    if (!supervisorHasUnitProjectAccess(req, unit)) {
      unitDeleteChallenges.delete(key);
      return res.status(403).json({
        success: false,
        message: 'Supervisor does not have access to this project.',
      });
    }
    removeUnitFromWorkspace(existing, unitId);
    existing.updated_at = new Date().toISOString();
    await upsertWorkspace(
      companyId,
      projectId,
      existing,
      'supervisor',
      req.supervisor && req.supervisor.id ? req.supervisor.id : null
    );
    unitDeleteChallenges.delete(key);
    return res.json({ success: true, workspace: existing });
  } catch (error) {
    if (error.code === '42P01') {
      return res.status(503).json({
        success: false,
        code: 'unit_progress_tables_missing',
        message: 'Unit Progress table missing. Run scripts/create_unit_progress_tables.sql',
      });
    }
    console.error('unitProgress confirmDeleteUnitSupervisor:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete unit.' });
  }
}

function floorDescriptionFromFloor(floor) {
  if (!floor || typeof floor !== 'object') return 'Unknown floor';
  const t = floor.tower != null ? String(floor.tower) : '?';
  const n = floor.number != null ? String(floor.number) : '?';
  return `Tower ${t}, floor ${n}`;
}

async function requestDeleteFloorManager(req, res) {
  const companyId = getManagerCompanyId(req);
  const projectId = getScopedProjectIdFromReq(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const floorId = normalizeFloorId(body.floorId);
  if (companyId == null || !floorId) {
    return res.status(400).json({ success: false, message: 'Valid floor id is required.' });
  }
  const toEmail = req.manager && req.manager.email ? String(req.manager.email).trim() : '';
  if (!toEmail) {
    return res.status(400).json({ success: false, message: 'Manager email is missing; cannot send verification code.' });
  }
  try {
    const workspace = await getWorkspaceByCompanyId(companyId, projectId);
    const floor = getFloorFromWorkspace(workspace, floorId);
    if (!floor) {
      return res.status(404).json({ success: false, message: 'Floor not found.' });
    }
    const now = Date.now();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const key = floorDeleteChallengeKey(companyId, floorId);
    floorDeleteChallenges.set(key, {
      code,
      expiresAt: now + UNIT_DELETE_OTP_TTL_MS,
      attempts: 0,
    });
    const floorDescription = floorDescriptionFromFloor(floor);
    await sendFloorDeleteVerificationEmail({ to: toEmail, code, floorDescription });
    return res.json({
      success: true,
      message: 'Verification code sent to your manager email.',
      otp_expires_in_sec: Math.floor(UNIT_DELETE_OTP_TTL_MS / 1000),
    });
  } catch (error) {
    floorDeleteChallenges.delete(floorDeleteChallengeKey(companyId, floorId));
    if (error.code === 'SMTP_NOT_CONFIGURED') {
      return res.status(503).json({
        success: false,
        message: 'Email is not configured on the server; cannot send verification code.',
      });
    }
    console.error('unitProgress requestDeleteFloorManager:', error);
    return res.status(500).json({ success: false, message: 'Failed to send verification email.' });
  }
}

async function confirmDeleteFloorManager(req, res) {
  const companyId = getManagerCompanyId(req);
  const projectId = getScopedProjectIdFromReq(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const floorId = normalizeFloorId(body.floorId);
  const otpInput = parseDeleteUnitCode(body);
  if (companyId == null || !floorId) {
    return res.status(400).json({ success: false, message: 'Valid floor id is required.' });
  }
  if (!otpInput) {
    return res.status(400).json({ success: false, message: 'Verification code is required.' });
  }
  const key = floorDeleteChallengeKey(companyId, floorId);
  const challenge = floorDeleteChallenges.get(key);
  const now = Date.now();
  if (!challenge || !challenge.expiresAt || challenge.expiresAt <= now) {
    floorDeleteChallenges.delete(key);
    return res.status(400).json({
      success: false,
      message: 'Code expired or missing. Request a new verification code.',
    });
  }
  challenge.attempts += 1;
  if (challenge.attempts > UNIT_DELETE_MAX_ATTEMPTS) {
    floorDeleteChallenges.delete(key);
    return res.status(429).json({
      success: false,
      message: 'Too many attempts. Request a new verification code.',
    });
  }
  const expected = String(challenge.code || '').replace(/\D/g, '');
  if (expected !== otpInput) {
    return res.status(403).json({ success: false, message: 'Invalid verification code.' });
  }
  try {
    const existing = await getWorkspaceByCompanyId(companyId, projectId);
    const floor = getFloorFromWorkspace(existing, floorId);
    if (!floor) {
      floorDeleteChallenges.delete(key);
      return res.status(404).json({ success: false, message: 'Floor not found.' });
    }
    removeFloorFromWorkspace(existing, floorId);
    existing.updated_at = new Date().toISOString();
    await upsertWorkspace(companyId, projectId, existing, 'manager', req.manager && req.manager.id ? req.manager.id : null);
    floorDeleteChallenges.delete(key);
    return res.json({ success: true, workspace: existing });
  } catch (error) {
    if (error.code === '42P01') {
      return res.status(503).json({
        success: false,
        code: 'unit_progress_tables_missing',
        message: 'Unit Progress table missing. Run scripts/create_unit_progress_tables.sql',
      });
    }
    console.error('unitProgress confirmDeleteFloorManager:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete floor.' });
  }
}

async function requestDeleteFloorSupervisor(req, res) {
  const companyId = getSupervisorCompanyId(req);
  const projectId = getScopedProjectIdFromReq(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const floorId = normalizeFloorId(body.floorId);
  if (companyId == null || !floorId) {
    return res.status(400).json({ success: false, message: 'Valid floor id is required.' });
  }
  try {
    const workspace = await getWorkspaceByCompanyId(companyId, projectId);
    const floor = getFloorFromWorkspace(workspace, floorId);
    if (!floor) {
      return res.status(404).json({ success: false, message: 'Floor not found.' });
    }
    if (!supervisorCanDeleteFloor(req, workspace, floor)) {
      return res.status(403).json({
        success: false,
        message: 'Supervisor cannot delete this floor (units from another project may be on this floor).',
      });
    }
    const toEmail = await getPrimaryManagerEmailForCompany(companyId);
    if (!toEmail) {
      return res.status(400).json({
        success: false,
        message: 'No active manager email found for this company.',
      });
    }
    const now = Date.now();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const key = floorDeleteChallengeKey(companyId, floorId);
    floorDeleteChallenges.set(key, {
      code,
      expiresAt: now + UNIT_DELETE_OTP_TTL_MS,
      attempts: 0,
    });
    const floorDescription = floorDescriptionFromFloor(floor);
    await sendFloorDeleteVerificationEmail({ to: toEmail, code, floorDescription });
    return res.json({
      success: true,
      message: 'Verification code sent to the company manager email.',
      otp_expires_in_sec: Math.floor(UNIT_DELETE_OTP_TTL_MS / 1000),
    });
  } catch (error) {
    floorDeleteChallenges.delete(floorDeleteChallengeKey(companyId, floorId));
    if (error.code === 'SMTP_NOT_CONFIGURED') {
      return res.status(503).json({
        success: false,
        message: 'Email is not configured on the server; cannot send verification code.',
      });
    }
    console.error('unitProgress requestDeleteFloorSupervisor:', error);
    return res.status(500).json({ success: false, message: 'Failed to send verification email.' });
  }
}

async function confirmDeleteFloorSupervisor(req, res) {
  const companyId = getSupervisorCompanyId(req);
  const projectId = getScopedProjectIdFromReq(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const floorId = normalizeFloorId(body.floorId);
  const otpInput = parseDeleteUnitCode(body);
  if (companyId == null || !floorId) {
    return res.status(400).json({ success: false, message: 'Valid floor id is required.' });
  }
  if (!otpInput) {
    return res.status(400).json({ success: false, message: 'Verification code is required.' });
  }
  const key = floorDeleteChallengeKey(companyId, floorId);
  const challenge = floorDeleteChallenges.get(key);
  const now = Date.now();
  if (!challenge || !challenge.expiresAt || challenge.expiresAt <= now) {
    floorDeleteChallenges.delete(key);
    return res.status(400).json({
      success: false,
      message: 'Code expired or missing. Request a new verification code.',
    });
  }
  challenge.attempts += 1;
  if (challenge.attempts > UNIT_DELETE_MAX_ATTEMPTS) {
    floorDeleteChallenges.delete(key);
    return res.status(429).json({
      success: false,
      message: 'Too many attempts. Request a new verification code.',
    });
  }
  const expected = String(challenge.code || '').replace(/\D/g, '');
  if (expected !== otpInput) {
    return res.status(403).json({ success: false, message: 'Invalid verification code.' });
  }
  try {
    const existing = await getWorkspaceByCompanyId(companyId, projectId);
    const floor = getFloorFromWorkspace(existing, floorId);
    if (!floor) {
      floorDeleteChallenges.delete(key);
      return res.status(404).json({ success: false, message: 'Floor not found.' });
    }
    if (!supervisorCanDeleteFloor(req, existing, floor)) {
      floorDeleteChallenges.delete(key);
      return res.status(403).json({
        success: false,
        message: 'Supervisor cannot delete this floor (units from another project may be on this floor).',
      });
    }
    removeFloorFromWorkspace(existing, floorId);
    existing.updated_at = new Date().toISOString();
    await upsertWorkspace(
      companyId,
      projectId,
      existing,
      'supervisor',
      req.supervisor && req.supervisor.id ? req.supervisor.id : null
    );
    floorDeleteChallenges.delete(key);
    return res.json({ success: true, workspace: existing });
  } catch (error) {
    if (error.code === '42P01') {
      return res.status(503).json({
        success: false,
        code: 'unit_progress_tables_missing',
        message: 'Unit Progress table missing. Run scripts/create_unit_progress_tables.sql',
      });
    }
    console.error('unitProgress confirmDeleteFloorSupervisor:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete floor.' });
  }
}

module.exports = {
  appendQaJobLinkToUnitTimeline,
  getWorkspace,
  putWorkspace,
  getWorkspaceSupervisor,
  putWorkspaceSupervisor,
  getPublicTimeline,
  getPrivateTimelineManager,
  getPrivateTimelineSupervisor,
  getPrivateTimelineOperative,
  appendPrivateProgressManager,
  appendPrivateProgressSupervisor,
  appendPrivateProgressOperative,
  updatePrivateProgressOperative,
  deletePrivateProgressOperative,
  getOperativeDailyRecordUnits,
  requestDeleteUnitManager,
  confirmDeleteUnitManager,
  requestDeleteUnitSupervisor,
  confirmDeleteUnitSupervisor,
  requestDeleteFloorManager,
  confirmDeleteFloorManager,
  requestDeleteFloorSupervisor,
  confirmDeleteFloorSupervisor,
};
