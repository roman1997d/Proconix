/**
 * Drawing Gallery API — plans/drawings per project, versioning, notifications.
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../db/pool');
const { UPLOADS_ROOT } = require('../middleware/resolveCompanyDocsDir');
const {
  createPublicDrawingToken,
  verifyPublicDrawingToken,
} = require('../utils/publicDrawingToken');

function tableMissing(err) {
  return err && err.code === '42P01';
}

function cloudIndexPathForReq(req) {
  return path.join(req.digitalDocsCompanyDir, 'cloud_index.json');
}

function readCloudIndexForReq(req) {
  try {
    const p = cloudIndexPathForReq(req);
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeCloudIndexForReq(req, items) {
  const p = cloudIndexPathForReq(req);
  fs.writeFileSync(p, JSON.stringify(Array.isArray(items) ? items : [], null, 2), 'utf8');
}

function managerDisplayNameForCloud(req) {
  if (!req || !req.manager) return '';
  const parts = [req.manager.name, req.manager.surname]
    .filter(Boolean)
    .map((s) => String(s).trim())
    .filter(Boolean);
  if (parts.length) return parts.join(' ');
  if (req.manager.email) return String(req.manager.email).trim();
  return '';
}

function syncDrawingUploadToCloud(req, file, managerId, meta) {
  try {
    if (!req || !file || !req.digitalDocsCompanyDir) return { ok: false };
    const cloudDir = path.join(req.digitalDocsCompanyDir, 'cloud');
    fs.mkdirSync(cloudDir, { recursive: true });
    const ext = path.extname(String(file.originalname || file.filename || '')).toLowerCase() || '.bin';
    const cloudName = `cloud-drawing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const cloudAbs = path.join(cloudDir, cloudName);
    fs.copyFileSync(file.path, cloudAbs);
    const idx = readCloudIndexForReq(req);
    const actor = managerDisplayNameForCloud(req);
    idx.push({
      id: `cf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      folder: 'drawing',
      stored_name: cloudName,
      original_name: file.originalname || file.filename || cloudName,
      mime_type: file.mimetype || 'application/octet-stream',
      size_bytes: Number(file.size) || 0,
      uploaded_at: new Date().toISOString(),
      uploaded_by_manager_id: managerId,
      source_module: 'drawing_gallery',
      source_actor: actor || null,
      drawing_version_id: meta && Number.isInteger(meta.versionId) ? meta.versionId : null,
      drawing_series_id: meta && Number.isInteger(meta.seriesId) ? meta.seriesId : null,
    });
    writeCloudIndexForReq(req, idx);
    return { ok: true, cloud_stored_name: cloudName };
  } catch (err) {
    console.error('drawingGallery syncDrawingUploadToCloud:', err && err.message ? err.message : err);
    return { ok: false };
  }
}

function titleKey(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .slice(0, 500);
}

async function assertManagerProject(companyId, projectId) {
  const r = await pool.query('SELECT id FROM projects WHERE id = $1 AND company_id = $2', [projectId, companyId]);
  return r.rows[0] || null;
}

/**
 * Manager: company owns project. Operative: users.project_id matches and company matches.
 */
async function assertProjectReadAccess(req, projectId) {
  const pid = parseInt(projectId, 10);
  if (!Number.isInteger(pid) || pid < 1) return { ok: false, code: 400, message: 'Invalid project id.' };

  if (req.userType === 'manager' && req.manager) {
    const r = await pool.query('SELECT id, company_id FROM projects WHERE id = $1 AND company_id = $2', [
      pid,
      req.manager.company_id,
    ]);
    if (!r.rows.length) return { ok: false, code: 403, message: 'Access denied.' };
    return { ok: true, companyId: r.rows[0].company_id, projectId: pid };
  }

  if (req.userType === 'operative' && req.operative) {
    let assigned = null;
    try {
      const ur = await pool.query(
        'SELECT project_id FROM users WHERE id = $1 AND company_id = $2',
        [req.operative.id, req.operative.company_id]
      );
      if (ur.rows[0] && ur.rows[0].project_id != null) assigned = ur.rows[0].project_id;
    } catch (e) {
      if (e.code !== '42703') throw e;
    }
    if (assigned == null) {
      try {
        const pa = await pool.query(
          'SELECT project_id FROM project_assignments WHERE user_id = $1 ORDER BY assigned_at DESC LIMIT 1',
          [req.operative.id]
        );
        if (pa.rows.length && pa.rows[0].project_id != null) assigned = pa.rows[0].project_id;
      } catch (e) {
        if (e.code !== '42P01') throw e;
      }
    }
    if (assigned !== pid) return { ok: false, code: 403, message: 'Access denied.' };
    const pr = await pool.query('SELECT company_id FROM projects WHERE id = $1', [pid]);
    if (!pr.rows.length) return { ok: false, code: 403, message: 'Access denied.' };
    return { ok: true, companyId: pr.rows[0].company_id, projectId: pid };
  }

  return { ok: false, code: 403, message: 'Access denied.' };
}

async function loadVersionForAccess(versionId) {
  const r = await pool.query(
    `SELECT v.id, v.series_id, v.version_number, v.status, v.stored_filename, v.relative_path, v.mime_type,
            v.file_size_bytes, v.description, v.uploaded_at, v.uploaded_by_manager_id,
            s.company_id, s.project_id, s.title, s.floor_label, s.zone_label, s.discipline
     FROM drawing_version v
     JOIN drawing_series s ON s.id = v.series_id
     WHERE v.id = $1`,
    [versionId]
  );
  return r.rows[0] || null;
}

async function assertVersionReadAccess(req, row) {
  if (!row) return { ok: false, code: 404, message: 'Not found.' };
  const acc = await assertProjectReadAccess(req, row.project_id);
  if (!acc.ok) return acc;
  if (acc.companyId !== row.company_id) return { ok: false, code: 403, message: 'Access denied.' };
  return { ok: true };
}

async function notifyNewVersion(client, { companyId, projectId, versionId }) {
  try {
    let mgrs;
    try {
      mgrs = await client.query(
        'SELECT id FROM manager WHERE company_id = $1 AND (active = true OR active IS NULL)',
        [companyId]
      );
    } catch (e) {
      if (e.code === '42703') {
        mgrs = await client.query('SELECT id FROM manager WHERE company_id = $1', [companyId]);
      } else {
        throw e;
      }
    }
    let users;
    try {
      users = await client.query(
        'SELECT id FROM users WHERE company_id = $1 AND project_id = $2',
        [companyId, projectId]
      );
    } catch (e) {
      if (e.code === '42703') {
        users = { rows: [] };
      } else {
        throw e;
      }
    }
    for (const m of mgrs.rows) {
      await client.query(
        `INSERT INTO drawing_gallery_notification
         (company_id, project_id, drawing_version_id, recipient_kind, recipient_id)
         VALUES ($1, $2, $3, 'manager', $4)`,
        [companyId, projectId, versionId, m.id]
      );
    }
    for (const u of users.rows) {
      await client.query(
        `INSERT INTO drawing_gallery_notification
         (company_id, project_id, drawing_version_id, recipient_kind, recipient_id)
         VALUES ($1, $2, $3, 'operative', $4)`,
        [companyId, projectId, versionId, u.id]
      );
    }
  } catch (e) {
    if (e.code === '42P01') {
      return;
    }
    console.error('drawingGallery notifyNewVersion (non-fatal):', e.message || e);
    /* Do not fail the upload if notifications fail. */
  }
}

/**
 * GET /projects/:projectId/series
 */
async function listSeries(req, res) {
  const projectId = parseInt(req.params.projectId, 10);
  const acc = await assertProjectReadAccess(req, projectId);
  if (!acc.ok) return res.status(acc.code).json({ success: false, message: acc.message });

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const floor = typeof req.query.floor === 'string' ? req.query.floor.trim() : '';
  const zone = typeof req.query.zone === 'string' ? req.query.zone.trim() : '';
  const discipline = typeof req.query.discipline === 'string' ? req.query.discipline.trim() : '';

  const params = [projectId];
  let where = 's.project_id = $1';
  let p = 2;
  if (q) {
    where += ` AND (s.title ILIKE $${p} OR s.keywords ILIKE $${p} OR s.description ILIKE $${p})`;
    params.push(`%${q}%`);
    p++;
  }
  if (floor) {
    where += ` AND s.floor_label ILIKE $${p}`;
    params.push(`%${floor}%`);
    p++;
  }
  if (zone) {
    where += ` AND s.zone_label ILIKE $${p}`;
    params.push(`%${zone}%`);
    p++;
  }
  if (discipline) {
    where += ` AND s.discipline ILIKE $${p}`;
    params.push(`%${discipline}%`);
    p++;
  }

  try {
    const result = await pool.query(
      `SELECT s.id, s.title, s.description, s.floor_label, s.zone_label, s.discipline, s.keywords, s.created_at,
              v.id AS active_version_id, v.version_number, v.uploaded_at, v.mime_type, v.file_size_bytes, v.status AS version_status,
              (SELECT COUNT(*)::int FROM drawing_version v2 WHERE v2.series_id = s.id) AS version_count
       FROM drawing_series s
       LEFT JOIN drawing_version v ON v.series_id = s.id AND v.status = 'active'
       WHERE ${where}
       ORDER BY s.title ASC`,
      params
    );
    return res.json({ success: true, series: result.rows });
  } catch (err) {
    if (tableMissing(err)) {
      return res.status(503).json({
        success: false,
        message: 'Drawing Gallery tables are not installed. Run scripts/create_drawing_gallery_tables.sql',
      });
    }
    console.error('drawingGallery listSeries:', err);
    return res.status(500).json({ success: false, message: 'Failed to list drawings.' });
  }
}

function decodeNavPart(value) {
  try {
    return decodeURIComponent(String(value || '')).trim();
  } catch (_) {
    return String(value || '').trim();
  }
}

const CATEGORY_SQL = "COALESCE(NULLIF(TRIM(s.floor_label), ''), NULLIF(TRIM(s.zone_label), ''), 'General')";

/**
 * GET /projects/:projectId/disciplines
 * Read-only hierarchy level 1 with backend-computed totals.
 */
async function listDisciplines(req, res) {
  const projectId = parseInt(req.params.projectId, 10);
  const acc = await assertProjectReadAccess(req, projectId);
  if (!acc.ok) return res.status(acc.code).json({ success: false, message: acc.message });
  try {
    const result = await pool.query(
      `SELECT COALESCE(NULLIF(TRIM(s.discipline), ''), 'General') AS discipline,
              COUNT(*)::int AS total_drawings
       FROM drawing_series s
       JOIN drawing_version v ON v.series_id = s.id AND v.status = 'active'
       WHERE s.project_id = $1
       GROUP BY COALESCE(NULLIF(TRIM(s.discipline), ''), 'General')
       ORDER BY discipline ASC`,
      [projectId]
    );
    return res.json({ success: true, disciplines: result.rows });
  } catch (err) {
    if (tableMissing(err)) {
      return res.status(503).json({
        success: false,
        message: 'Drawing Gallery tables are not installed. Run scripts/create_drawing_gallery_tables.sql',
      });
    }
    console.error('drawingGallery listDisciplines:', err);
    return res.status(500).json({ success: false, message: 'Failed to load disciplines.' });
  }
}

/**
 * GET /projects/:projectId/disciplines/:discipline/categories
 * Read-only hierarchy level 2 with backend-computed totals.
 */
async function listCategoriesByDiscipline(req, res) {
  const projectId = parseInt(req.params.projectId, 10);
  const acc = await assertProjectReadAccess(req, projectId);
  if (!acc.ok) return res.status(acc.code).json({ success: false, message: acc.message });
  const discipline = decodeNavPart(req.params.discipline);
  if (!discipline) {
    return res.status(400).json({ success: false, message: 'Invalid discipline.' });
  }
  try {
    const result = await pool.query(
      `SELECT ${CATEGORY_SQL} AS category,
              COUNT(*)::int AS total_drawings
       FROM drawing_series s
       JOIN drawing_version v ON v.series_id = s.id AND v.status = 'active'
       WHERE s.project_id = $1
         AND COALESCE(NULLIF(TRIM(s.discipline), ''), 'General') = $2
       GROUP BY ${CATEGORY_SQL}
       ORDER BY category ASC`,
      [projectId, discipline]
    );
    return res.json({ success: true, discipline, categories: result.rows });
  } catch (err) {
    if (tableMissing(err)) {
      return res.status(503).json({
        success: false,
        message: 'Drawing Gallery tables are not installed. Run scripts/create_drawing_gallery_tables.sql',
      });
    }
    console.error('drawingGallery listCategoriesByDiscipline:', err);
    return res.status(500).json({ success: false, message: 'Failed to load categories.' });
  }
}

/**
 * GET /projects/:projectId/disciplines/:discipline/categories/:category/drawings
 * Read-only hierarchy level 3 with list metadata and secure file URLs.
 */
async function listDrawingsByCategory(req, res) {
  const projectId = parseInt(req.params.projectId, 10);
  const acc = await assertProjectReadAccess(req, projectId);
  if (!acc.ok) return res.status(acc.code).json({ success: false, message: acc.message });
  const discipline = decodeNavPart(req.params.discipline);
  const category = decodeNavPart(req.params.category);
  if (!discipline || !category) {
    return res.status(400).json({ success: false, message: 'Invalid discipline/category.' });
  }
  try {
    const result = await pool.query(
      `SELECT s.id AS series_id, s.title, s.discipline,
              ${CATEGORY_SQL} AS category,
              v.id AS version_id, v.version_number, v.mime_type, v.uploaded_at
       FROM drawing_series s
       JOIN drawing_version v ON v.series_id = s.id AND v.status = 'active'
       WHERE s.project_id = $1
         AND COALESCE(NULLIF(TRIM(s.discipline), ''), 'General') = $2
         AND ${CATEGORY_SQL} = $3
       ORDER BY s.title ASC`,
      [projectId, discipline, category]
    );
    const drawings = result.rows.map((row) => {
      const fileUrl = `/api/drawing-gallery/versions/${row.version_id}/file`;
      return {
        id: row.version_id,
        series_id: row.series_id,
        name: row.title,
        revision: `v${row.version_number}`,
        updated_at: row.uploaded_at,
        mime_type: row.mime_type,
        thumbnail_url: fileUrl,
        file_url: fileUrl,
      };
    });
    return res.json({ success: true, discipline, category, drawings });
  } catch (err) {
    if (tableMissing(err)) {
      return res.status(503).json({
        success: false,
        message: 'Drawing Gallery tables are not installed. Run scripts/create_drawing_gallery_tables.sql',
      });
    }
    console.error('drawingGallery listDrawingsByCategory:', err);
    return res.status(500).json({ success: false, message: 'Failed to load drawings.' });
  }
}

/**
 * GET /series/:seriesId
 */
async function getSeriesDetail(req, res) {
  const seriesId = parseInt(req.params.seriesId, 10);
  if (!Number.isInteger(seriesId) || seriesId < 1) {
    return res.status(400).json({ success: false, message: 'Invalid series id.' });
  }

  try {
    const sr = await pool.query(
      `SELECT id, company_id, project_id, title, description, floor_label, zone_label, discipline, keywords, created_at
       FROM drawing_series WHERE id = $1`,
      [seriesId]
    );
    if (!sr.rows.length) return res.status(404).json({ success: false, message: 'Not found.' });
    const s = sr.rows[0];
    const acc = await assertProjectReadAccess(req, s.project_id);
    if (!acc.ok || acc.companyId !== s.company_id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const vr = await pool.query(
      `SELECT id, series_id, version_number, status, mime_type, file_size_bytes, description, uploaded_at, uploaded_by_manager_id
       FROM drawing_version WHERE series_id = $1 ORDER BY version_number DESC`,
      [seriesId]
    );
    return res.json({ success: true, series: s, versions: vr.rows });
  } catch (err) {
    if (tableMissing(err)) {
      return res.status(503).json({ success: false, message: 'Drawing Gallery tables are not installed.' });
    }
    console.error('drawingGallery getSeriesDetail:', err);
    return res.status(500).json({ success: false, message: 'Failed to load series.' });
  }
}

/**
 * POST /projects/:projectId/upload (multipart: file + fields)
 */
async function uploadDrawing(req, res) {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'File is required (field name: file).' });
  }

  const projectId = req.drawingProjectId;
  const companyId = req.manager.company_id;
  const managerId = req.manager.id;

  const title = String(req.body.title || '').trim();
  if (!title) {
    try {
      fs.unlinkSync(req.file.path);
    } catch (_) {}
    return res.status(400).json({ success: false, message: 'Title is required.' });
  }

  const description = req.body.description != null ? String(req.body.description).trim() : null;
  const floorLabel = req.body.floor_label != null ? String(req.body.floor_label).trim() : null;
  const zoneLabel = req.body.zone_label != null ? String(req.body.zone_label).trim() : null;
  const discipline = req.body.discipline != null ? String(req.body.discipline).trim() : null;
  if (!discipline) {
    try {
      fs.unlinkSync(req.file.path);
    } catch (_) {}
    return res.status(400).json({ success: false, message: 'Discipline is required.' });
  }
  const keywords = req.body.keywords != null ? String(req.body.keywords).trim() : null;
  const versionDescription = req.body.version_description != null ? String(req.body.version_description).trim() : null;

  let explicitSeriesId = null;
  if (req.body.series_id != null && req.body.series_id !== '') {
    const sid = parseInt(req.body.series_id, 10);
    if (Number.isInteger(sid) && sid >= 1) explicitSeriesId = sid;
  }

  const tk = titleKey(title);
  const folderName = req.digitalDocsFolderName;
  const relPath =
    folderName && req.file && req.file.filename
      ? `${String(folderName)}/drawings/project_${projectId}/${req.file.filename}`.replace(/\\/g, '/')
      : path
          .relative(UPLOADS_ROOT, req.file.path)
          .split(path.sep)
          .join('/');
  if (!relPath || relPath.startsWith('..')) {
    try {
      fs.unlinkSync(req.file.path);
    } catch (_) {}
    return res.status(500).json({
      success: false,
      message: 'Could not resolve file path for storage. Re-open the page and try again.',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let seriesId;
    let seriesRow;

    if (explicitSeriesId != null) {
      const sr = await client.query(
        'SELECT id, company_id, project_id FROM drawing_series WHERE id = $1 AND project_id = $2 AND company_id = $3',
        [explicitSeriesId, projectId, companyId]
      );
      if (!sr.rows.length) {
        await client.query('ROLLBACK');
        try {
          fs.unlinkSync(req.file.path);
        } catch (_) {}
        return res.status(400).json({ success: false, message: 'Invalid series_id for this project.' });
      }
      seriesId = explicitSeriesId;
      await client.query(
        `UPDATE drawing_series SET title = COALESCE($1, title),
          description = COALESCE($2, description), floor_label = COALESCE($3, floor_label),
          zone_label = COALESCE($4, zone_label), discipline = COALESCE($5, discipline), keywords = COALESCE($6, keywords)
         WHERE id = $7`,
        [title ? title.slice(0, 500) : null, description, floorLabel, zoneLabel, discipline, keywords, seriesId]
      );
    } else {
      const existing = await client.query(
        'SELECT id FROM drawing_series WHERE project_id = $1 AND title_key = $2',
        [projectId, tk]
      );
      if (existing.rows.length) {
        seriesId = existing.rows[0].id;
        await client.query(
          `UPDATE drawing_series SET title = $1,
            description = COALESCE($2, description), floor_label = COALESCE($3, floor_label),
            zone_label = COALESCE($4, zone_label), discipline = COALESCE($5, discipline), keywords = COALESCE($6, keywords)
           WHERE id = $7`,
          [title.slice(0, 500), description, floorLabel, zoneLabel, discipline, keywords, seriesId]
        );
      } else {
        const ins = await client.query(
          `INSERT INTO drawing_series
           (company_id, project_id, title, title_key, description, floor_label, zone_label, discipline, keywords, created_by_manager_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id`,
          [companyId, projectId, title.slice(0, 500), tk, description, floorLabel, zoneLabel, discipline, keywords, managerId]
        );
        seriesId = ins.rows[0].id;
      }
    }

    await client.query(
      `UPDATE drawing_version SET status = 'archived' WHERE series_id = $1 AND status = 'active'`,
      [seriesId]
    );

    const maxR = await client.query(
      'SELECT COALESCE(MAX(version_number), 0)::int AS m FROM drawing_version WHERE series_id = $1',
      [seriesId]
    );
    const nextVer = (maxR.rows[0] && maxR.rows[0].m) + 1;

    const mime = req.file.mimetype || 'application/octet-stream';
    const size = req.file.size != null ? req.file.size : null;

    const insV = await client.query(
      `INSERT INTO drawing_version
       (series_id, version_number, status, stored_filename, relative_path, mime_type, file_size_bytes, description, uploaded_by_manager_id)
       VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8)
       RETURNING id, version_number, uploaded_at`,
      [seriesId, nextVer, req.file.filename, relPath, mime, size, versionDescription, managerId]
    );

    const versionId = insV.rows[0].id;

    await notifyNewVersion(client, {
      companyId,
      projectId,
      versionId,
    });

    await client.query('COMMIT');

    const cloudSync = syncDrawingUploadToCloud(req, req.file, managerId, {
      versionId,
      seriesId,
    });

    return res.status(201).json({
      success: true,
      series_id: seriesId,
      version: insV.rows[0],
      version_id: versionId,
      cloud_synced: !!cloudSync.ok,
      message: 'Drawing uploaded.',
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    try {
      fs.unlinkSync(req.file.path);
    } catch (_) {}
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'A drawing with this title already exists; use series_id to add a version.' });
    }
    if (tableMissing(err)) {
      return res.status(503).json({
        success: false,
        message: 'Drawing Gallery tables are not installed. Run scripts/create_drawing_gallery_tables.sql',
      });
    }
    console.error('drawingGallery uploadDrawing:', err);
    const safeDetail =
      err && err.message && String(err.message).length < 500 ? String(err.message) : 'Unknown error';
    return res.status(500).json({
      success: false,
      message: 'Upload failed.',
      detail: safeDetail,
      code: err && err.code ? err.code : undefined,
    });
  } finally {
    client.release();
  }
}

/**
 * GET /versions/:versionId/file
 */
async function downloadVersionFile(req, res) {
  const versionId = parseInt(req.params.versionId, 10);
  if (!Number.isInteger(versionId) || versionId < 1) {
    return res.status(400).json({ success: false, message: 'Invalid version id.' });
  }

  const row = await loadVersionForAccess(versionId);
  const acc = await assertVersionReadAccess(req, row);
  if (!acc.ok) return res.status(acc.code).json({ success: false, message: acc.message });

  const abs = path.join(UPLOADS_ROOT, row.relative_path.split('/').join(path.sep));
  if (!fs.existsSync(abs)) {
    return res.status(404).json({ success: false, message: 'File missing on server.' });
  }

  const download = req.query.download === '1' || req.query.download === 'true';
  res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
  if (download) {
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.stored_filename || 'drawing')}"`);
  } else {
    res.setHeader('Content-Disposition', 'inline');
  }
  return res.sendFile(path.resolve(abs));
}

/**
 * GET /versions/:versionId/meta
 */
async function getVersionMeta(req, res) {
  const versionId = parseInt(req.params.versionId, 10);
  if (!Number.isInteger(versionId) || versionId < 1) {
    return res.status(400).json({ success: false, message: 'Invalid version id.' });
  }
  const row = await loadVersionForAccess(versionId);
  const acc = await assertVersionReadAccess(req, row);
  if (!acc.ok) return res.status(acc.code).json({ success: false, message: acc.message });

  const fileUrl = `/api/drawing-gallery/versions/${versionId}/file`;
  return res.json({
    success: true,
    version: {
      id: row.id,
      series_id: row.series_id,
      version_number: row.version_number,
      status: row.status,
      mime_type: row.mime_type,
      title: row.title,
      floor_label: row.floor_label,
      zone_label: row.zone_label,
      discipline: row.discipline,
      project_id: row.project_id,
      file_url: fileUrl,
    },
  });
}

function getPublicBaseUrl(req) {
  return String(process.env.PUBLIC_APP_URL || process.env.SITE_URL || process.env.PROCONIX_PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

/**
 * POST /versions/:versionId/public-share
 * Authenticated manager/operative gets a signed public link (read-only).
 */
async function createPublicShareLink(req, res) {
  const versionId = parseInt(req.params.versionId, 10);
  if (!Number.isInteger(versionId) || versionId < 1) {
    return res.status(400).json({ success: false, message: 'Invalid version id.' });
  }
  const row = await loadVersionForAccess(versionId);
  const acc = await assertVersionReadAccess(req, row);
  if (!acc.ok) return res.status(acc.code).json({ success: false, message: acc.message });
  const token = createPublicDrawingToken(versionId);
  const base = getPublicBaseUrl(req);
  const url = `${base}/public_drawing_view.html?t=${encodeURIComponent(token)}`;
  return res.json({ success: true, token, url });
}

/**
 * GET /public/:token/meta
 */
async function getPublicVersionMeta(req, res) {
  const token = String(req.params.token || '');
  const parsed = verifyPublicDrawingToken(token);
  if (!parsed) return res.status(401).json({ success: false, message: 'Invalid or expired share link.' });
  const row = await loadVersionForAccess(parsed.version_id);
  if (!row) return res.status(404).json({ success: false, message: 'Drawing not found.' });
  return res.json({
    success: true,
    version: {
      id: row.id,
      series_id: row.series_id,
      version_number: row.version_number,
      status: row.status,
      mime_type: row.mime_type,
      title: row.title,
      floor_label: row.floor_label,
      zone_label: row.zone_label,
      discipline: row.discipline,
      project_id: row.project_id,
      uploaded_at: row.uploaded_at,
      file_url: `/api/drawing-gallery/public/${encodeURIComponent(token)}/file`,
    },
  });
}

/**
 * GET /public/:token/file
 */
async function downloadPublicVersionFile(req, res) {
  const token = String(req.params.token || '');
  const parsed = verifyPublicDrawingToken(token);
  if (!parsed) return res.status(401).json({ success: false, message: 'Invalid or expired share link.' });
  const row = await loadVersionForAccess(parsed.version_id);
  if (!row) return res.status(404).json({ success: false, message: 'Drawing not found.' });
  const abs = path.join(UPLOADS_ROOT, row.relative_path.split('/').join(path.sep));
  if (!fs.existsSync(abs)) {
    return res.status(404).json({ success: false, message: 'File missing on server.' });
  }
  const download = req.query.download === '1' || req.query.download === 'true';
  res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
  if (download) {
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.stored_filename || 'drawing')}"`);
  } else {
    res.setHeader('Content-Disposition', 'inline');
  }
  return res.sendFile(path.resolve(abs));
}

/**
 * GET /comments?version_id=
 */
async function listComments(req, res) {
  const versionId = parseInt(req.query.version_id, 10);
  if (!Number.isInteger(versionId) || versionId < 1) {
    return res.status(400).json({ success: false, message: 'version_id is required.' });
  }
  const row = await loadVersionForAccess(versionId);
  const acc = await assertVersionReadAccess(req, row);
  if (!acc.ok) return res.status(acc.code).json({ success: false, message: acc.message });

  try {
    const r = await pool.query(
      `SELECT id, version_id, author_kind, author_id, body, created_at FROM drawing_comment WHERE version_id = $1 ORDER BY created_at ASC`,
      [versionId]
    );
    return res.json({ success: true, comments: r.rows });
  } catch (err) {
    if (tableMissing(err)) return res.json({ success: true, comments: [] });
    console.error('drawingGallery listComments:', err);
    return res.status(500).json({ success: false, message: 'Failed to load comments.' });
  }
}

/**
 * POST /comments  body: { version_id, body }
 */
async function postComment(req, res) {
  const versionId = parseInt(req.body.version_id, 10);
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!Number.isInteger(versionId) || versionId < 1 || !body) {
    return res.status(400).json({ success: false, message: 'version_id and body are required.' });
  }

  const row = await loadVersionForAccess(versionId);
  const acc = await assertVersionReadAccess(req, row);
  if (!acc.ok) return res.status(acc.code).json({ success: false, message: acc.message });

  let authorKind = 'operative';
  let authorId = req.operative && req.operative.id;
  if (req.userType === 'manager' && req.manager) {
    authorKind = 'manager';
    authorId = req.manager.id;
  }
  if (authorId == null) return res.status(403).json({ success: false, message: 'Access denied.' });

  try {
    const r = await pool.query(
      `INSERT INTO drawing_comment (version_id, author_kind, author_id, body) VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [versionId, authorKind, authorId, body.slice(0, 8000)]
    );
    return res.status(201).json({ success: true, comment: r.rows[0] });
  } catch (err) {
    if (tableMissing(err)) {
      return res.status(503).json({ success: false, message: 'Comments table missing.' });
    }
    console.error('drawingGallery postComment:', err);
    return res.status(500).json({ success: false, message: 'Failed to post comment.' });
  }
}

/**
 * GET /notifications
 */
async function listNotifications(req, res) {
  const limit = Math.min(parseInt(req.query.limit, 10) || 40, 100);
  let recipientKind;
  let recipientId;
  if (req.userType === 'manager' && req.manager) {
    recipientKind = 'manager';
    recipientId = req.manager.id;
  } else if (req.userType === 'operative' && req.operative) {
    recipientKind = 'operative';
    recipientId = req.operative.id;
  } else {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }

  try {
    const r = await pool.query(
      `SELECT n.id, n.project_id, n.drawing_version_id, n.read_at, n.created_at,
              s.title AS series_title, v.version_number
       FROM drawing_gallery_notification n
       JOIN drawing_version v ON v.id = n.drawing_version_id
       JOIN drawing_series s ON s.id = v.series_id
       WHERE n.recipient_kind = $1 AND n.recipient_id = $2
       ORDER BY n.created_at DESC
       LIMIT $3`,
      [recipientKind, recipientId, limit]
    );
    return res.json({ success: true, notifications: r.rows });
  } catch (err) {
    if (tableMissing(err)) return res.json({ success: true, notifications: [] });
    console.error('drawingGallery listNotifications:', err);
    return res.status(500).json({ success: false, message: 'Failed to load notifications.' });
  }
}

/**
 * PATCH /notifications/:id/read
 */
async function markNotificationRead(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, message: 'Invalid id.' });

  let recipientKind;
  let recipientId;
  if (req.userType === 'manager' && req.manager) {
    recipientKind = 'manager';
    recipientId = req.manager.id;
  } else if (req.userType === 'operative' && req.operative) {
    recipientKind = 'operative';
    recipientId = req.operative.id;
  } else {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }

  try {
    const r = await pool.query(
      `UPDATE drawing_gallery_notification SET read_at = NOW()
       WHERE id = $1 AND recipient_kind = $2 AND recipient_id = $3
       RETURNING id`,
      [id, recipientKind, recipientId]
    );
    if (!r.rows.length) return res.status(404).json({ success: false, message: 'Not found.' });
    return res.json({ success: true });
  } catch (err) {
    console.error('drawingGallery markNotificationRead:', err);
    return res.status(500).json({ success: false, message: 'Failed to update.' });
  }
}

module.exports = {
  listSeries,
  listDisciplines,
  listCategoriesByDiscipline,
  listDrawingsByCategory,
  getSeriesDetail,
  uploadDrawing,
  downloadVersionFile,
  getVersionMeta,
  createPublicShareLink,
  getPublicVersionMeta,
  downloadPublicVersionFile,
  listComments,
  postComment,
  listNotifications,
  markNotificationRead,
};
