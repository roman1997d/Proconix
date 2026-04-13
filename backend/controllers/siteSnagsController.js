/**
 * Site Snags — workspace API: projects & people from DB; drawings/snags/measurements/highlights persisted relationally.
 */

const { pool } = require('../db/pool');

function getCompanyId(req) {
  return req.manager && req.manager.company_id != null ? req.manager.company_id : null;
}

/** target_date is PostgreSQL DATE — only YYYY-MM-DD is safe. Client may send locale strings (e.g. "Fri Mar 27"). */
function normalizeTargetDateForPg(value) {
  if (value == null || value === '') return null;
  const str = String(value).trim();
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function fetchProjectsForCompany(companyId) {
  try {
    const r = await pool.query(
      `SELECT id, project_name AS project_name, address, active, created_at
       FROM projects WHERE company_id = $1 ORDER BY created_at DESC`,
      [companyId]
    );
    return r.rows.map((row) => ({
      id: row.id,
      name: row.project_name || '',
      address: row.address,
      active: row.active,
    }));
  } catch (err) {
    if (err.code === '42703') {
      const r2 = await pool.query(
        `SELECT id, name AS project_name, address, created_at
         FROM projects WHERE company_id = $1 ORDER BY created_at DESC`,
        [companyId]
      );
      return r2.rows.map((row) => ({
        id: row.id,
        name: row.project_name || '',
        address: row.address,
        active: true,
      }));
    }
    throw err;
  }
}

async function fetchPeopleForCompany(companyId) {
  const people = [];
  const ur = await pool.query(
    `SELECT id, name, email, role FROM users
     WHERE company_id = $1
     ORDER BY COALESCE(NULLIF(TRIM(name), ''), email)`,
    [companyId]
  );
  ur.rows.forEach((row) => {
    const label = (row.name && String(row.name).trim()) || row.email || 'User ' + row.id;
    people.push({ kind: 'user', id: row.id, label, email: row.email || '', role: row.role || null });
  });
  const mr = await pool.query(
    `SELECT id, name, surname, email FROM manager
     WHERE company_id = $1
     ORDER BY id`,
    [companyId]
  );
  mr.rows.forEach((row) => {
    const label = [row.name, row.surname].filter(Boolean).join(' ').trim() || row.email || 'Manager ' + row.id;
    people.push({ kind: 'manager', id: row.id, label, email: row.email || '', role: 'manager' });
  });
  return people;
}

function rowToSnag(row) {
  return {
    id: row.id,
    locationId: row.drawing_id,
    nx: Number(row.nx),
    ny: Number(row.ny),
    title: row.title,
    description: row.description || '',
    status: row.status,
    category: row.category || '',
    assigneeUserId: row.assignee_user_id != null ? Number(row.assignee_user_id) : null,
    assigneeManagerId: row.assignee_manager_id != null ? Number(row.assignee_manager_id) : null,
    assignee: row.assignee_display || '',
    targetDate: row.target_date ? String(row.target_date).split('T')[0] : '',
    mockPlanningTaskId: row.mock_planning_task_id || null,
    archived: !!row.archived,
    photosBefore: Array.isArray(row.photos_before) ? row.photos_before : [],
    photosAfter: Array.isArray(row.photos_after) ? row.photos_after : [],
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

function buildMockTasksFromSnags(snags) {
  return snags
    .filter((s) => s.mockPlanningTaskId)
    .map((s) => ({
      id: s.mockPlanningTaskId,
      snagId: s.id,
      title: 'Resolve: ' + (s.title || 'Snag'),
      status:
        s.status === 'closed'
          ? 'closed'
          : s.status === 'verified'
            ? 'verified'
            : 'active',
      createdAt: s.createdAt,
    }));
}

async function getWorkspace(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(400).json({ success: false, message: 'Manager has no company_id.' });
  }
  try {
    const [projects, people] = await Promise.all([
      fetchProjectsForCompany(companyId),
      fetchPeopleForCompany(companyId),
    ]);

    const prefs = await pool.query('SELECT show_archived FROM site_snag_prefs WHERE company_id = $1', [companyId]);
    const showArchived = prefs.rows[0] ? !!prefs.rows[0].show_archived : false;

    let dr;
    try {
      dr = await pool.query(
        `SELECT id, project_id, name, block, floor, image_data, pixels_to_mm, drawing_gallery_version_id
         FROM site_snag_drawings WHERE company_id = $1 ORDER BY created_at`,
        [companyId]
      );
    } catch (err) {
      if (err.code === '42703') {
        dr = await pool.query(
          `SELECT id, project_id, name, block, floor, image_data, pixels_to_mm
           FROM site_snag_drawings WHERE company_id = $1 ORDER BY created_at`,
          [companyId]
        );
      } else {
        throw err;
      }
    }
    const locations = dr.rows.map((row) => ({
      id: row.id,
      projectId: String(row.project_id),
      name: row.name,
      block: row.block,
      floor: row.floor,
      imageDataUrl: row.image_data || '',
      pixelsToMm: row.pixels_to_mm != null ? Number(row.pixels_to_mm) : 1,
      drawingGalleryVersionId:
        row.drawing_gallery_version_id != null ? Number(row.drawing_gallery_version_id) : null,
    }));

    const drawingIds = locations.map((l) => l.id);
    let snags = [];
    if (drawingIds.length) {
      const sr = await pool.query(
        `SELECT id, drawing_id, nx, ny, title, description, status, category,
                assignee_user_id, assignee_manager_id, assignee_display, target_date,
                mock_planning_task_id, archived, photos_before, photos_after, created_at, updated_at
         FROM site_snags WHERE drawing_id = ANY($1::varchar[])`,
        [drawingIds]
      );
      snags = sr.rows.map(rowToSnag);
    }

    const measurementsByLocation = {};
    const highlightsByLocation = {};
    if (drawingIds.length) {
      const [mr, hr] = await Promise.all([
        pool.query(
          'SELECT id, drawing_id, payload, sort_order FROM site_snag_measurements WHERE drawing_id = ANY($1::varchar[]) ORDER BY sort_order, id',
          [drawingIds]
        ),
        pool.query(
          'SELECT id, drawing_id, payload, sort_order FROM site_snag_highlights WHERE drawing_id = ANY($1::varchar[]) ORDER BY sort_order, id',
          [drawingIds]
        ),
      ]);
      mr.rows.forEach((row) => {
        if (!measurementsByLocation[row.drawing_id]) measurementsByLocation[row.drawing_id] = [];
        const p = row.payload && typeof row.payload === 'object' ? row.payload : {};
        p.id = p.id || row.id;
        measurementsByLocation[row.drawing_id].push(p);
      });
      hr.rows.forEach((row) => {
        if (!highlightsByLocation[row.drawing_id]) highlightsByLocation[row.drawing_id] = [];
        const p = row.payload && typeof row.payload === 'object' ? row.payload : {};
        p.id = p.id || row.id;
        highlightsByLocation[row.drawing_id].push(p);
      });
    }

    const cc = await pool.query('SELECT name FROM site_snag_custom_category WHERE company_id = $1 ORDER BY name', [
      companyId,
    ]);
    const customCategories = cc.rows.map((r) => r.name);

    const rp = await pool.query(
      'SELECT preset_name FROM site_snag_removed_preset WHERE company_id = $1 ORDER BY preset_name',
      [companyId]
    );
    const removedPresetCategories = rp.rows.map((r) => r.preset_name);

    const mockTasks = buildMockTasksFromSnags(snags);

    return res.json({
      success: true,
      projects,
      people,
      showArchived,
      locations,
      snags,
      measurementsByLocation,
      highlightsByLocation,
      customCategories,
      removedPresetCategories,
      mockTasks,
    });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({
        success: false,
        code: 'site_snags_tables_missing',
        message: 'Site Snags tables missing. Run scripts/create_site_snags_tables.sql',
      });
    }
    console.error('siteSnags getWorkspace:', err);
    return res.status(500).json({ success: false, message: 'Failed to load Site Snags workspace.' });
  }
}

async function assertProjectIdsForCompany(client, companyId, projectIds) {
  if (!projectIds.length) return new Set();
  const r = await client.query(
    `SELECT id FROM projects WHERE company_id = $1 AND id = ANY($2::int[])`,
    [companyId, projectIds]
  );
  return new Set(r.rows.map((x) => x.id));
}

async function assertUserIdsForCompany(client, companyId, ids) {
  if (!ids.length) return new Set();
  const r = await client.query(
    `SELECT id FROM users WHERE company_id = $1 AND id = ANY($2::int[])`,
    [companyId, ids]
  );
  return new Set(r.rows.map((x) => x.id));
}

async function assertManagerIdsForCompany(client, companyId, ids) {
  if (!ids.length) return new Set();
  const r = await client.query(
    `SELECT id FROM manager WHERE company_id = $1 AND id = ANY($2::int[])`,
    [companyId, ids]
  );
  return new Set(r.rows.map((x) => x.id));
}

async function assertDrawingGalleryVersionForLocation(client, companyId, projectId, versionId) {
  const vid = parseInt(versionId, 10);
  if (!Number.isInteger(vid) || vid < 1) {
    return { ok: false, message: 'Invalid Drawing Gallery version id.' };
  }
  try {
    const r = await client.query(
      `SELECT v.id FROM drawing_version v
       INNER JOIN drawing_series s ON s.id = v.series_id
       WHERE v.id = $1 AND s.company_id = $2 AND s.project_id = $3`,
      [vid, companyId, projectId]
    );
    if (!r.rows.length) {
      return { ok: false, message: 'Drawing Gallery version does not match this project or company.' };
    }
    return { ok: true };
  } catch (e) {
    if (e.code === '42P01') {
      return { ok: false, message: 'Drawing Gallery tables are missing. Run scripts/create_drawing_gallery_tables.sql' };
    }
    throw e;
  }
}

function validateWorkspaceBody(body) {
  if (!body || typeof body !== 'object') return 'Invalid body.';
  if (!Array.isArray(body.locations)) return 'locations must be an array.';
  if (!Array.isArray(body.snags)) return 'snags must be an array.';
  if (typeof body.measurementsByLocation !== 'object' || body.measurementsByLocation === null) {
    return 'Invalid measurementsByLocation.';
  }
  if (typeof body.highlightsByLocation !== 'object' || body.highlightsByLocation === null) {
    return 'Invalid highlightsByLocation.';
  }
  if (!Array.isArray(body.customCategories)) return 'customCategories must be an array.';
  if (!Array.isArray(body.removedPresetCategories)) return 'removedPresetCategories must be an array.';
  return null;
}

async function putWorkspace(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(400).json({ success: false, message: 'Manager has no company_id.' });
  }
  const verr = validateWorkspaceBody(req.body);
  if (verr) return res.status(400).json({ success: false, message: verr });

  const {
    showArchived,
    locations,
    snags,
    measurementsByLocation,
    highlightsByLocation,
    customCategories,
    removedPresetCategories,
  } = req.body;

  const projectNums = [];
  locations.forEach((loc) => {
    const pid = parseInt(loc.projectId, 10);
    if (Number.isInteger(pid)) projectNums.push(pid);
  });
  const userIds = [];
  const managerIds = [];
  snags.forEach((s) => {
    if (s.assigneeUserId != null && Number.isInteger(Number(s.assigneeUserId))) {
      userIds.push(Number(s.assigneeUserId));
    }
    if (s.assigneeManagerId != null && Number.isInteger(Number(s.assigneeManagerId))) {
      managerIds.push(Number(s.assigneeManagerId));
    }
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const allowedProjects = await assertProjectIdsForCompany(client, companyId, [...new Set(projectNums)]);
    for (let i = 0; i < locations.length; i++) {
      const loc = locations[i];
      const pid = parseInt(loc.projectId, 10);
      if (!Number.isInteger(pid) || !allowedProjects.has(pid)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Invalid or foreign project_id for drawing "${loc.name || loc.id}".`,
        });
      }
    }

    const okUsers = await assertUserIdsForCompany(client, companyId, [...new Set(userIds)]);
    const okManagers = await assertManagerIdsForCompany(client, companyId, [...new Set(managerIds)]);
    for (let i = 0; i < snags.length; i++) {
      const s = snags[i];
      if (s.assigneeUserId != null) {
        const uid = Number(s.assigneeUserId);
        if (!okUsers.has(uid)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'Invalid assignee user id.' });
        }
      }
      if (s.assigneeManagerId != null) {
        const mid = Number(s.assigneeManagerId);
        if (!okManagers.has(mid)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'Invalid assignee manager id.' });
        }
      }
    }

    const drawingIdSet = new Set(locations.map((l) => String(l.id)));
    for (let i = 0; i < snags.length; i++) {
      if (!drawingIdSet.has(String(snags[i].locationId))) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Snag references unknown drawing id.' });
      }
    }

    for (let i = 0; i < locations.length; i++) {
      const loc = locations[i];
      const pid = parseInt(loc.projectId, 10);
      const hasImg = loc.imageDataUrl != null && String(loc.imageDataUrl).trim() !== '';
      let dgVid = null;
      if (loc.drawingGalleryVersionId != null && loc.drawingGalleryVersionId !== '') {
        const p = parseInt(loc.drawingGalleryVersionId, 10);
        if (Number.isInteger(p) && p >= 1) dgVid = p;
      }
      if (!hasImg && dgVid == null) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Drawing "${loc.name || loc.id}" needs an image or a Drawing Gallery version.`,
        });
      }
      if (dgVid != null) {
        const chk = await assertDrawingGalleryVersionForLocation(client, companyId, pid, dgVid);
        if (!chk.ok) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: chk.message });
        }
      }
    }

    await client.query('DELETE FROM site_snag_measurements WHERE drawing_id IN (SELECT id FROM site_snag_drawings WHERE company_id = $1)', [
      companyId,
    ]);
    await client.query('DELETE FROM site_snag_highlights WHERE drawing_id IN (SELECT id FROM site_snag_drawings WHERE company_id = $1)', [
      companyId,
    ]);
    await client.query('DELETE FROM site_snags WHERE drawing_id IN (SELECT id FROM site_snag_drawings WHERE company_id = $1)', [companyId]);
    await client.query('DELETE FROM site_snag_drawings WHERE company_id = $1', [companyId]);
    await client.query('DELETE FROM site_snag_custom_category WHERE company_id = $1', [companyId]);
    await client.query('DELETE FROM site_snag_removed_preset WHERE company_id = $1', [companyId]);

    await client.query(
      `INSERT INTO site_snag_prefs (company_id, show_archived) VALUES ($1, $2)
       ON CONFLICT (company_id) DO UPDATE SET show_archived = EXCLUDED.show_archived`,
      [companyId, !!showArchived]
    );

    const now = new Date();
    for (let i = 0; i < locations.length; i++) {
      const loc = locations[i];
      const pid = parseInt(loc.projectId, 10);
      const hasImg = loc.imageDataUrl != null && String(loc.imageDataUrl).trim() !== '';
      let dgVid = null;
      if (loc.drawingGalleryVersionId != null && loc.drawingGalleryVersionId !== '') {
        const p = parseInt(loc.drawingGalleryVersionId, 10);
        if (Number.isInteger(p) && p >= 1) dgVid = p;
      }
      try {
        await client.query(
          `INSERT INTO site_snag_drawings (id, company_id, project_id, name, block, floor, image_data, pixels_to_mm, drawing_gallery_version_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            String(loc.id),
            companyId,
            pid,
            String(loc.name || '').slice(0, 500),
            String(loc.block || '—').slice(0, 200),
            String(loc.floor || '—').slice(0, 200),
            hasImg ? String(loc.imageDataUrl) : null,
            loc.pixelsToMm != null && isFinite(Number(loc.pixelsToMm)) ? Number(loc.pixelsToMm) : 1,
            dgVid,
            now,
            now,
          ]
        );
      } catch (insErr) {
        if (insErr.code === '42703') {
          await client.query('ROLLBACK');
          return res.status(503).json({
            success: false,
            code: 'site_snags_drawing_gallery_column_missing',
            message:
              'Database migration required for Drawing Gallery link: run scripts/alter_site_snag_drawings_drawing_gallery.sql',
          });
        }
        throw insErr;
      }
    }

    for (let i = 0; i < snags.length; i++) {
      const s = snags[i];
      const au = s.assigneeUserId != null && Number.isInteger(Number(s.assigneeUserId)) ? Number(s.assigneeUserId) : null;
      const am = s.assigneeManagerId != null && Number.isInteger(Number(s.assigneeManagerId)) ? Number(s.assigneeManagerId) : null;
      if (au != null && am != null) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Snag cannot have both user and manager assignee.' });
      }
      await client.query(
        `INSERT INTO site_snags (
           id, drawing_id, nx, ny, title, description, status, category,
           assignee_user_id, assignee_manager_id, assignee_display, target_date,
           mock_planning_task_id, archived, photos_before, photos_after, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17,$18)`,
        [
          String(s.id),
          String(s.locationId),
          Number(s.nx) || 0,
          Number(s.ny) || 0,
          String(s.title || '').slice(0, 1000),
          s.description != null ? String(s.description) : null,
          String(s.status || 'open').slice(0, 50),
          s.category != null ? String(s.category).slice(0, 255) : null,
          au,
          am,
          s.assignee != null ? String(s.assignee).slice(0, 500) : null,
          normalizeTargetDateForPg(s.targetDate),
          s.mockPlanningTaskId != null ? String(s.mockPlanningTaskId).slice(0, 100) : null,
          !!s.archived,
          JSON.stringify(Array.isArray(s.photosBefore) ? s.photosBefore : []),
          JSON.stringify(Array.isArray(s.photosAfter) ? s.photosAfter : []),
          s.createdAt ? new Date(s.createdAt) : now,
          s.updatedAt ? new Date(s.updatedAt) : now,
        ]
      );
    }

    let msOrder = 0;
    const drawKeysM = Object.keys(measurementsByLocation || {});
    for (let di = 0; di < drawKeysM.length; di++) {
      const drawId = drawKeysM[di];
      const list = measurementsByLocation[drawId];
      if (!Array.isArray(list)) continue;
      for (let j = 0; j < list.length; j++) {
        const m = list[j];
        const mid = m && m.id ? String(m.id) : 'm-' + drawId + '-' + j + '-' + Date.now();
        const payload = Object.assign({}, m, { id: mid });
        await client.query(
          'INSERT INTO site_snag_measurements (id, drawing_id, payload, sort_order) VALUES ($1, $2, $3::jsonb, $4)',
          [mid, String(drawId), JSON.stringify(payload), msOrder++]
        );
      }
    }

    let hiOrder = 0;
    const drawKeysH = Object.keys(highlightsByLocation || {});
    for (let di = 0; di < drawKeysH.length; di++) {
      const drawId = drawKeysH[di];
      const list = highlightsByLocation[drawId];
      if (!Array.isArray(list)) continue;
      for (let j = 0; j < list.length; j++) {
        const h = list[j];
        const hid = h && h.id ? String(h.id) : 'h-' + drawId + '-' + j + '-' + Date.now();
        const payload = Object.assign({}, h, { id: hid });
        await client.query(
          'INSERT INTO site_snag_highlights (id, drawing_id, payload, sort_order) VALUES ($1, $2, $3::jsonb, $4)',
          [hid, String(drawId), JSON.stringify(payload), hiOrder++]
        );
      }
    }

    for (let i = 0; i < customCategories.length; i++) {
      const n = String(customCategories[i] || '').trim();
      if (!n) continue;
      await client.query(
        'INSERT INTO site_snag_custom_category (company_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [companyId, n.slice(0, 255)]
      );
    }
    for (let i = 0; i < removedPresetCategories.length; i++) {
      const n = String(removedPresetCategories[i] || '').trim();
      if (!n) continue;
      await client.query(
        'INSERT INTO site_snag_removed_preset (company_id, preset_name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [companyId, n.slice(0, 255)]
      );
    }

    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore */
    }
    if (err.code === '42P01') {
      return res.status(503).json({
        success: false,
        code: 'site_snags_tables_missing',
        message: 'Site Snags tables missing. Run scripts/create_site_snags_tables.sql',
      });
    }
    if (err.code === '23503') {
      return res.status(400).json({ success: false, message: 'Foreign key violation (project or assignee).' });
    }
    console.error('siteSnags putWorkspace:', err);
    return res.status(500).json({ success: false, message: 'Failed to save Site Snags workspace.' });
  } finally {
    client.release();
  }
}

/**
 * GET workspace filtered to supervisor's assigned project (operative token).
 */
async function getWorkspaceSupervisor(req, res) {
  const companyId = req.supervisor && req.supervisor.company_id != null ? req.supervisor.company_id : null;
  const projectId = req.supervisor && req.supervisor.project_id != null ? req.supervisor.project_id : null;
  if (companyId == null) {
    return res.status(400).json({ success: false, message: 'Invalid supervisor session.' });
  }
  if (projectId == null) {
    return res.json({
      success: true,
      projects: [],
      people: [],
      showArchived: false,
      locations: [],
      snags: [],
      measurementsByLocation: {},
      highlightsByLocation: {},
      customCategories: [],
      removedPresetCategories: [],
      mockTasks: [],
    });
  }

  let captured = null;
  const mockRes = {
    json: function (data) {
      captured = data;
    },
    status: function () {
      return { json: function () {} };
    },
  };

  try {
    await getWorkspace({ manager: { company_id: companyId } }, mockRes);
    if (!captured || !captured.success) {
      return res.status(500).json({ success: false, message: 'Failed to load workspace.' });
    }
    const base = captured;

    const projects = (base.projects || []).filter((p) => Number(p.id) === Number(projectId));
    const locations = (base.locations || []).filter((l) => String(l.projectId) === String(projectId));
    const drawingIds = new Set(locations.map((l) => String(l.id)));
    const snags = (base.snags || []).filter((s) => drawingIds.has(String(s.locationId)));
    const measurementsByLocation = {};
    const highlightsByLocation = {};
    Object.keys(base.measurementsByLocation || {}).forEach((k) => {
      if (drawingIds.has(String(k))) measurementsByLocation[k] = base.measurementsByLocation[k];
    });
    Object.keys(base.highlightsByLocation || {}).forEach((k) => {
      if (drawingIds.has(String(k))) highlightsByLocation[k] = base.highlightsByLocation[k];
    });

    return res.json({
      success: true,
      projects,
      people: base.people || [],
      showArchived: base.showArchived,
      locations,
      snags,
      measurementsByLocation,
      highlightsByLocation,
      customCategories: base.customCategories || [],
      removedPresetCategories: base.removedPresetCategories || [],
      mockTasks: buildMockTasksFromSnags(snags),
    });
  } catch (err) {
    console.error('getWorkspaceSupervisor:', err);
    return res.status(500).json({ success: false, message: 'Failed to load workspace.' });
  }
}

/**
 * PUT workspace for supervisor project only (does not delete other projects' drawings).
 */
async function putWorkspaceSupervisor(req, res) {
  const companyId = req.supervisor && req.supervisor.company_id != null ? req.supervisor.company_id : null;
  const projectId = req.supervisor && req.supervisor.project_id != null ? req.supervisor.project_id : null;
  if (companyId == null || projectId == null) {
    return res.status(400).json({ success: false, message: 'Supervisor has no project assigned.' });
  }

  const verr = validateWorkspaceBody(req.body);
  if (verr) return res.status(400).json({ success: false, message: verr });

  const {
    showArchived,
    locations,
    snags,
    measurementsByLocation,
    highlightsByLocation,
    customCategories,
    removedPresetCategories,
  } = req.body;

  for (let i = 0; i < locations.length; i++) {
    const pid = parseInt(locations[i].projectId, 10);
    if (!Number.isInteger(pid) || pid !== Number(projectId)) {
      return res.status(400).json({
        success: false,
        message: 'All drawings must belong to your assigned project.',
      });
    }
  }

  const projectNums = [];
  locations.forEach((loc) => {
    const pid = parseInt(loc.projectId, 10);
    if (Number.isInteger(pid)) projectNums.push(pid);
  });
  const userIds = [];
  const managerIds = [];
  snags.forEach((s) => {
    if (s.assigneeUserId != null && Number.isInteger(Number(s.assigneeUserId))) {
      userIds.push(Number(s.assigneeUserId));
    }
    if (s.assigneeManagerId != null && Number.isInteger(Number(s.assigneeManagerId))) {
      managerIds.push(Number(s.assigneeManagerId));
    }
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const allowedProjects = await assertProjectIdsForCompany(client, companyId, [...new Set(projectNums)]);
    for (let i = 0; i < locations.length; i++) {
      const loc = locations[i];
      const pid = parseInt(loc.projectId, 10);
      if (!Number.isInteger(pid) || !allowedProjects.has(pid)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Invalid or foreign project_id for drawing "${loc.name || loc.id}".`,
        });
      }
    }

    const okUsers = await assertUserIdsForCompany(client, companyId, [...new Set(userIds)]);
    const okManagers = await assertManagerIdsForCompany(client, companyId, [...new Set(managerIds)]);
    for (let i = 0; i < snags.length; i++) {
      const s = snags[i];
      if (s.assigneeUserId != null) {
        const uid = Number(s.assigneeUserId);
        if (!okUsers.has(uid)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'Invalid assignee user id.' });
        }
      }
      if (s.assigneeManagerId != null) {
        const mid = Number(s.assigneeManagerId);
        if (!okManagers.has(mid)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'Invalid assignee manager id.' });
        }
      }
    }

    const drawingIdSet = new Set(locations.map((l) => String(l.id)));
    for (let i = 0; i < snags.length; i++) {
      if (!drawingIdSet.has(String(snags[i].locationId))) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Snag references unknown drawing id.' });
      }
    }

    for (let i = 0; i < locations.length; i++) {
      const loc = locations[i];
      const pid = parseInt(loc.projectId, 10);
      const hasImg = loc.imageDataUrl != null && String(loc.imageDataUrl).trim() !== '';
      let dgVid = null;
      if (loc.drawingGalleryVersionId != null && loc.drawingGalleryVersionId !== '') {
        const p = parseInt(loc.drawingGalleryVersionId, 10);
        if (Number.isInteger(p) && p >= 1) dgVid = p;
      }
      if (!hasImg && dgVid == null) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Drawing "${loc.name || loc.id}" needs an image or a Drawing Gallery version.`,
        });
      }
      if (dgVid != null) {
        const chk = await assertDrawingGalleryVersionForLocation(client, companyId, pid, dgVid);
        if (!chk.ok) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: chk.message });
        }
      }
    }

    const existingDr = await client.query(
      `SELECT id FROM site_snag_drawings WHERE company_id = $1 AND project_id = $2`,
      [companyId, projectId]
    );
    const oldIds = existingDr.rows.map((r) => String(r.id));
    if (oldIds.length) {
      await client.query(`DELETE FROM site_snag_measurements WHERE drawing_id = ANY($1::varchar[])`, [oldIds]);
      await client.query(`DELETE FROM site_snag_highlights WHERE drawing_id = ANY($1::varchar[])`, [oldIds]);
      await client.query(`DELETE FROM site_snags WHERE drawing_id = ANY($1::varchar[])`, [oldIds]);
      await client.query(`DELETE FROM site_snag_drawings WHERE company_id = $1 AND project_id = $2`, [companyId, projectId]);
    }

    await client.query(
      `INSERT INTO site_snag_prefs (company_id, show_archived) VALUES ($1, $2)
       ON CONFLICT (company_id) DO UPDATE SET show_archived = EXCLUDED.show_archived`,
      [companyId, !!showArchived]
    );

    const now = new Date();
    for (let i = 0; i < locations.length; i++) {
      const loc = locations[i];
      const pid = parseInt(loc.projectId, 10);
      const hasImg = loc.imageDataUrl != null && String(loc.imageDataUrl).trim() !== '';
      let dgVid = null;
      if (loc.drawingGalleryVersionId != null && loc.drawingGalleryVersionId !== '') {
        const p = parseInt(loc.drawingGalleryVersionId, 10);
        if (Number.isInteger(p) && p >= 1) dgVid = p;
      }
      try {
        await client.query(
          `INSERT INTO site_snag_drawings (id, company_id, project_id, name, block, floor, image_data, pixels_to_mm, drawing_gallery_version_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            String(loc.id),
            companyId,
            pid,
            String(loc.name || '').slice(0, 500),
            String(loc.block || '—').slice(0, 200),
            String(loc.floor || '—').slice(0, 200),
            hasImg ? String(loc.imageDataUrl) : null,
            loc.pixelsToMm != null && isFinite(Number(loc.pixelsToMm)) ? Number(loc.pixelsToMm) : 1,
            dgVid,
            now,
            now,
          ]
        );
      } catch (insErr) {
        if (insErr.code === '42703') {
          await client.query('ROLLBACK');
          return res.status(503).json({
            success: false,
            code: 'site_snags_drawing_gallery_column_missing',
            message:
              'Database migration required for Drawing Gallery link: run scripts/alter_site_snag_drawings_drawing_gallery.sql',
          });
        }
        throw insErr;
      }
    }

    for (let i = 0; i < snags.length; i++) {
      const s = snags[i];
      const au = s.assigneeUserId != null && Number.isInteger(Number(s.assigneeUserId)) ? Number(s.assigneeUserId) : null;
      const am = s.assigneeManagerId != null && Number.isInteger(Number(s.assigneeManagerId)) ? Number(s.assigneeManagerId) : null;
      if (au != null && am != null) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Snag cannot have both user and manager assignee.' });
      }
      await client.query(
        `INSERT INTO site_snags (
           id, drawing_id, nx, ny, title, description, status, category,
           assignee_user_id, assignee_manager_id, assignee_display, target_date,
           mock_planning_task_id, archived, photos_before, photos_after, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17,$18)`,
        [
          String(s.id),
          String(s.locationId),
          Number(s.nx) || 0,
          Number(s.ny) || 0,
          String(s.title || '').slice(0, 1000),
          s.description != null ? String(s.description) : null,
          String(s.status || 'open').slice(0, 50),
          s.category != null ? String(s.category).slice(0, 255) : null,
          au,
          am,
          s.assignee != null ? String(s.assignee).slice(0, 500) : null,
          normalizeTargetDateForPg(s.targetDate),
          s.mockPlanningTaskId != null ? String(s.mockPlanningTaskId).slice(0, 100) : null,
          !!s.archived,
          JSON.stringify(Array.isArray(s.photosBefore) ? s.photosBefore : []),
          JSON.stringify(Array.isArray(s.photosAfter) ? s.photosAfter : []),
          s.createdAt ? new Date(s.createdAt) : now,
          s.updatedAt ? new Date(s.updatedAt) : now,
        ]
      );
    }

    let msOrder = 0;
    const drawKeysM = Object.keys(measurementsByLocation || {});
    for (let di = 0; di < drawKeysM.length; di++) {
      const drawId = drawKeysM[di];
      const list = measurementsByLocation[drawId];
      if (!Array.isArray(list)) continue;
      for (let j = 0; j < list.length; j++) {
        const m = list[j];
        const mid = m && m.id ? String(m.id) : 'm-' + drawId + '-' + j + '-' + Date.now();
        const payload = Object.assign({}, m, { id: mid });
        await client.query(
          'INSERT INTO site_snag_measurements (id, drawing_id, payload, sort_order) VALUES ($1, $2, $3::jsonb, $4)',
          [mid, String(drawId), JSON.stringify(payload), msOrder++]
        );
      }
    }

    let hiOrder = 0;
    const drawKeysH = Object.keys(highlightsByLocation || {});
    for (let di = 0; di < drawKeysH.length; di++) {
      const drawId = drawKeysH[di];
      const list = highlightsByLocation[drawId];
      if (!Array.isArray(list)) continue;
      for (let j = 0; j < list.length; j++) {
        const h = list[j];
        const hid = h && h.id ? String(h.id) : 'h-' + drawId + '-' + j + '-' + Date.now();
        const payload = Object.assign({}, h, { id: hid });
        await client.query(
          'INSERT INTO site_snag_highlights (id, drawing_id, payload, sort_order) VALUES ($1, $2, $3::jsonb, $4)',
          [hid, String(drawId), JSON.stringify(payload), hiOrder++]
        );
      }
    }

    for (let i = 0; i < customCategories.length; i++) {
      const n = String(customCategories[i] || '').trim();
      if (!n) continue;
      await client.query(
        'INSERT INTO site_snag_custom_category (company_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [companyId, n.slice(0, 255)]
      );
    }
    for (let i = 0; i < removedPresetCategories.length; i++) {
      const n = String(removedPresetCategories[i] || '').trim();
      if (!n) continue;
      await client.query(
        'INSERT INTO site_snag_removed_preset (company_id, preset_name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [companyId, n.slice(0, 255)]
      );
    }

    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore */
    }
    if (err.code === '42P01') {
      return res.status(503).json({
        success: false,
        code: 'site_snags_tables_missing',
        message: 'Site Snags tables missing. Run scripts/create_site_snags_tables.sql',
      });
    }
    if (err.code === '23503') {
      return res.status(400).json({ success: false, message: 'Foreign key violation (project or assignee).' });
    }
    console.error('siteSnags putWorkspaceSupervisor:', err);
    return res.status(500).json({ success: false, message: 'Failed to save Site Snags workspace.' });
  } finally {
    client.release();
  }
}

module.exports = { getWorkspace, putWorkspace, getWorkspaceSupervisor, putWorkspaceSupervisor };
