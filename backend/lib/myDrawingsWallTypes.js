/**
 * Per-company Wall Types catalog for My Drawings.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('../db/pool');
const { UPLOADS_ROOT } = require('../middleware/resolveCompanyDocsDir');

const UPLOAD_DIR = path.join(UPLOADS_ROOT, 'mydrawings');
const STARTER_PACK_JSON = path.join(
  __dirname,
  '..',
  '..',
  'frontend',
  'mydrawings',
  'data',
  'medlock-wall-types.json'
);
const STARTER_IMAGES_DIR = path.join(
  __dirname,
  '..',
  '..',
  'frontend',
  'mydrawings',
  'data',
  'wall-types'
);
const WT_IMAGE_TYPES = {
  'image/jpeg': '.jpg',
  'image/pjpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const WT_CODE_RE = /^[A-Z0-9][A-Z0-9._-]{1,39}$/;

let starterPackCache = null;

function positiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function relativeFromAbs(absPath) {
  return path.relative(UPLOADS_ROOT, absPath).split(path.sep).join('/');
}

function absFromRelative(relativePath) {
  if (!relativePath) return null;
  const abs = path.resolve(UPLOADS_ROOT, String(relativePath).split('/').join(path.sep));
  const root = UPLOADS_ROOT.endsWith(path.sep) ? UPLOADS_ROOT : UPLOADS_ROOT + path.sep;
  if (abs !== UPLOADS_ROOT && !abs.startsWith(root)) return null;
  return abs;
}

function removeStoredFile(relativePath) {
  const abs = absFromRelative(relativePath);
  if (abs && fs.existsSync(abs)) {
    try { fs.unlinkSync(abs); } catch (_) {}
  }
}

function loadStarterPackFile() {
  if (starterPackCache) return starterPackCache;
  if (!fs.existsSync(STARTER_PACK_JSON)) {
    throw new Error('Starter wall-types pack is missing on the server.');
  }
  starterPackCache = JSON.parse(fs.readFileSync(STARTER_PACK_JSON, 'utf8'));
  return starterPackCache;
}

function packFromJson(data, fallbackName) {
  const project = (data && data.project) || {};
  const pack = (data && data.pack) || {};
  return {
    project: {
      name: String(project.name || fallbackName || 'Wall Types').slice(0, 200),
      sector: String(project.sector || '').slice(0, 160),
      architect: String(project.architect || '').slice(0, 160),
    },
    pack: {
      title: String(pack.title || 'Wall Types').slice(0, 200),
      revision: String(pack.revision || '').slice(0, 40),
      pages: Number(pack.pages) || 0,
    },
  };
}

function normalizeWallTypeCode(raw) {
  return String(raw || '').replace(/\s+/g, '').toUpperCase().slice(0, 40);
}

function normalizeWallTypeKind(raw) {
  return String(raw || '').trim().toLowerCase() === 'lining' ? 'lining' : 'wall';
}

function parseJsonField(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch (_) {
    return fallback;
  }
}

function parseLayers(raw) {
  const arr = parseJsonField(raw, []);
  if (!Array.isArray(arr)) return [];
  return arr
    .map((layer) => ({
      side: String((layer && layer.side) || '').trim().slice(0, 80),
      board: String((layer && layer.board) || '').trim().slice(0, 200),
    }))
    .filter((layer) => layer.side || layer.board)
    .slice(0, 12);
}

function parsePackPages(body) {
  const nested = parseJsonField(body && body.packPages, {});
  const specStart = Number((body && body.specStart) != null ? body.specStart : nested.specStart);
  const specEnd = Number((body && body.specEnd) != null ? body.specEnd : nested.specEnd);
  const detail = Number((body && body.detailPage) != null ? body.detailPage : nested.detail);
  const out = {};
  if (Number.isFinite(specStart) && specStart > 0) out.specStart = specStart;
  if (Number.isFinite(specEnd) && specEnd > 0) out.specEnd = specEnd;
  if (Number.isFinite(detail) && detail > 0) out.detail = detail;
  return out;
}

function ensureWallTypesDir(workspaceId) {
  const dir = path.join(UPLOAD_DIR, String(workspaceId), 'wall-types');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function saveWallTypeImageFile(workspaceId, file) {
  if (!file || !file.buffer || !file.buffer.length) return '';
  const ext = WT_IMAGE_TYPES[file.mimetype]
    || (String(file.originalname || '').toLowerCase().match(/\.(jpe?g|png|webp|gif)$/) || [])[0]
    || '.jpg';
  const dir = ensureWallTypesDir(workspaceId);
  const filename = `wt-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext.startsWith('.') ? ext : '.' + ext}`;
  const abs = path.join(dir, filename);
  fs.writeFileSync(abs, file.buffer);
  return relativeFromAbs(abs);
}

function copyStarterImage(workspaceId, detailImage) {
  const name = path.basename(String(detailImage || ''));
  if (!name || name === '.' || name === '..') return '';
  const src = path.resolve(STARTER_IMAGES_DIR, name);
  const root = path.resolve(STARTER_IMAGES_DIR) + path.sep;
  if (src !== path.resolve(STARTER_IMAGES_DIR) && !src.startsWith(root)) return '';
  if (!fs.existsSync(src)) return '';
  const dir = ensureWallTypesDir(workspaceId);
  const dest = path.join(dir, name);
  fs.copyFileSync(src, dest);
  return relativeFromAbs(dest);
}

function wallTypeToClient(row) {
  const buildup = row.buildup && typeof row.buildup === 'object' ? row.buildup : {};
  const packPages = row.pack_pages && typeof row.pack_pages === 'object' ? row.pack_pages : {};
  return {
    id: String(row.id),
    code: row.code,
    kind: row.kind === 'lining' ? 'lining' : 'wall',
    name: row.name || '',
    systemRef: row.system_ref || '',
    systemType: row.system_type || '',
    performance: {
      fireMinutes: row.fire_minutes || '',
      fireClass: row.fire_class || '',
      acoustic: row.acoustic || '',
      thickness: row.thickness || '',
      maxHeightM: row.max_height_m || '',
      duty: row.duty || '',
    },
    buildup: {
      layers: Array.isArray(buildup.layers) ? buildup.layers : [],
      studs: buildup.studs || '',
      insulation: buildup.insulation || '',
    },
    detailImage: row.detail_image_path ? `/api/my-drawings/wall-types/${row.id}/image` : '',
    hasImage: !!row.detail_image_path,
    packPages,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

async function loadWorkspacePack(workspaceId, fallbackName) {
  const found = await pool.query(
    'SELECT name, wall_types_pack FROM my_drawings_workspace WHERE id = $1',
    [workspaceId]
  );
  const row = found.rows[0] || {};
  const stored = row.wall_types_pack && typeof row.wall_types_pack === 'object' ? row.wall_types_pack : {};
  const packed = packFromJson(stored, row.name || fallbackName);
  if (!stored.project && !stored.pack) {
    packed.project.name = row.name || packed.project.name;
    packed.pack.title = 'Wall Types';
    packed.pack.revision = '';
  }
  return packed;
}

async function listWorkspaceWallTypes(workspaceId) {
  const rows = await pool.query(
    `SELECT id, code, kind, name, system_ref, system_type, fire_minutes, fire_class,
            acoustic, thickness, max_height_m, duty, buildup, pack_pages, detail_image_path, updated_at
     FROM my_drawings_wall_type
     WHERE workspace_id = $1
     ORDER BY sort_order ASC, code ASC, id ASC`,
    [workspaceId]
  );
  return rows.rows;
}

async function wallTypesPayload(req) {
  const workspace = req.myDrawings.workspace;
  const pack = await loadWorkspacePack(workspace.id, workspace.name);
  const rows = await listWorkspaceWallTypes(workspace.id);
  return {
    success: true,
    project: pack.project,
    pack: pack.pack,
    wallTypes: rows.map(wallTypeToClient),
    canEdit: req.myDrawings.role === 'admin',
  };
}

async function insertWallTypeRow(workspaceId, fields) {
  const next = await pool.query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM my_drawings_wall_type WHERE workspace_id = $1',
    [workspaceId]
  );
  const inserted = await pool.query(
    `INSERT INTO my_drawings_wall_type
      (workspace_id, code, kind, name, system_ref, system_type, fire_minutes, fire_class,
       acoustic, thickness, max_height_m, duty, buildup, pack_pages, detail_image_path, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15,$16)
     RETURNING *`,
    [
      workspaceId,
      fields.code,
      fields.kind,
      fields.name,
      fields.systemRef,
      fields.systemType,
      fields.fireMinutes,
      fields.fireClass,
      fields.acoustic,
      fields.thickness,
      fields.maxHeightM,
      fields.duty,
      JSON.stringify(fields.buildup || {}),
      JSON.stringify(fields.packPages || {}),
      fields.detailImagePath || null,
      next.rows[0].n,
    ]
  );
  return inserted.rows[0];
}

function fieldsFromStarter(entry) {
  const perf = entry.performance || {};
  const buildup = entry.buildup || {};
  return {
    code: normalizeWallTypeCode(entry.code),
    kind: normalizeWallTypeKind(entry.kind),
    name: String(entry.name || '').slice(0, 300),
    systemRef: String(entry.systemRef || '').slice(0, 120),
    systemType: String(entry.systemType || '').slice(0, 200),
    fireMinutes: String(perf.fireMinutes || '').slice(0, 40),
    fireClass: String(perf.fireClass || '').slice(0, 80),
    acoustic: String(perf.acoustic || '').slice(0, 80),
    thickness: String(perf.thickness || '').slice(0, 40),
    maxHeightM: String(perf.maxHeightM || '').slice(0, 40),
    duty: String(perf.duty || '').slice(0, 40),
    buildup: {
      layers: parseLayers(buildup.layers),
      studs: String(buildup.studs || '').slice(0, 300),
      insulation: String(buildup.insulation || '').slice(0, 300),
    },
    packPages: entry.packPages && typeof entry.packPages === 'object' ? entry.packPages : {},
  };
}

async function copyStarterWallTypes(workspaceId) {
  const data = loadStarterPackFile();
  const pack = packFromJson(data, 'Wall Types');
  await pool.query(
    'UPDATE my_drawings_workspace SET wall_types_pack = $2::jsonb WHERE id = $1',
    [workspaceId, JSON.stringify(pack)]
  );
  const existing = await pool.query(
    'SELECT UPPER(code) AS code FROM my_drawings_wall_type WHERE workspace_id = $1',
    [workspaceId]
  );
  const have = new Set(existing.rows.map((row) => row.code));
  let added = 0;
  const list = Array.isArray(data.wallTypes) ? data.wallTypes : [];
  for (let i = 0; i < list.length; i++) {
    const fields = fieldsFromStarter(list[i] || {});
    if (!WT_CODE_RE.test(fields.code)) continue;
    if (have.has(fields.code)) {
      const alt = normalizeWallTypeCode(String((list[i] && list[i].id) || '').replace(/^wt/i, 'WT'));
      if (alt && WT_CODE_RE.test(alt) && !have.has(alt)) fields.code = alt;
      else continue;
    }
    fields.detailImagePath = copyStarterImage(workspaceId, list[i].detailImage);
    await insertWallTypeRow(workspaceId, fields);
    have.add(fields.code);
    added += 1;
  }
  return { added, pack };
}

async function clearAutoSeededWallTypesOnce() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS my_drawings_app_flag (
        key TEXT PRIMARY KEY,
        set_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const done = await pool.query(
      `SELECT 1 FROM my_drawings_app_flag WHERE key = 'clear_autoseed_wall_types_v1'`
    );
    if (done.rows[0]) return;
    const images = await pool.query(
      'SELECT detail_image_path FROM my_drawings_wall_type WHERE detail_image_path IS NOT NULL'
    );
    images.rows.forEach((row) => removeStoredFile(row.detail_image_path));
    await pool.query('DELETE FROM my_drawings_wall_type');
    await pool.query(`UPDATE my_drawings_workspace SET wall_types_pack = '{}'::jsonb`);
    await pool.query(
      `INSERT INTO my_drawings_app_flag (key) VALUES ('clear_autoseed_wall_types_v1')
       ON CONFLICT (key) DO NOTHING`
    );
  } catch (err) {
    console.warn('myDrawings clearAutoSeededWallTypesOnce:', err && err.message ? err.message : err);
  }
}

function readWallTypeFields(body) {
  const code = normalizeWallTypeCode(body && body.code);
  if (!WT_CODE_RE.test(code)) {
    const err = new Error('Enter a wall type code (letters, numbers, 2–40 characters).');
    err.status = 400;
    throw err;
  }
  return {
    code,
    kind: normalizeWallTypeKind(body && body.kind),
    name: String((body && body.name) || '').trim().slice(0, 300),
    systemRef: String((body && (body.systemRef || body.system_ref)) || '').trim().slice(0, 120),
    systemType: String((body && (body.systemType || body.system_type)) || '').trim().slice(0, 200),
    fireMinutes: String((body && (body.fireMinutes || body.fire_minutes)) || '').trim().slice(0, 40),
    fireClass: String((body && (body.fireClass || body.fire_class)) || '').trim().slice(0, 80),
    acoustic: String((body && body.acoustic) || '').trim().slice(0, 80),
    thickness: String((body && body.thickness) || '').trim().slice(0, 40),
    maxHeightM: String((body && (body.maxHeightM || body.max_height_m)) || '').trim().slice(0, 40),
    duty: String((body && body.duty) || '').trim().slice(0, 40),
    buildup: {
      layers: parseLayers(body && body.layers),
      studs: String((body && body.studs) || '').trim().slice(0, 300),
      insulation: String((body && body.insulation) || '').trim().slice(0, 300),
    },
    packPages: parsePackPages(body || {}),
  };
}

async function loadWallType(workspaceId, id) {
  const n = positiveInt(id);
  if (!n) return null;
  const found = await pool.query(
    'SELECT * FROM my_drawings_wall_type WHERE id = $1 AND workspace_id = $2',
    [n, workspaceId]
  );
  return found.rows[0] || null;
}

async function logWallTypeActivity(req, action, title, number) {
  try {
    const worker = req.myDrawings && req.myDrawings.worker;
    const name = [worker && worker.firstName, worker && worker.lastName].filter(Boolean).join(' ').trim();
    await pool.query(
      `INSERT INTO my_drawings_activity (workspace_id, actor_name, action, drawing_title, drawing_number)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        req.myDrawings.workspace.id,
        name || 'Administrator',
        action,
        title ? String(title).slice(0, 200) : '',
        number ? String(number).slice(0, 40) : '',
      ]
    );
  } catch (err) {
    console.error('myDrawings wall type activity:', err);
  }
}

async function listWallTypes(req, res) {
  try {
    return res.json(await wallTypesPayload(req));
  } catch (err) {
    console.error('myDrawings listWallTypes:', err);
    return res.status(500).json({ success: false, message: 'Could not load wall types.' });
  }
}

async function updateWallTypesPack(req, res) {
  try {
    const workspaceId = req.myDrawings.workspace.id;
    const current = await loadWorkspacePack(workspaceId, req.myDrawings.workspace.name);
    const body = req.body || {};
    const pack = {
      project: {
        name: String(body.projectName || body.name || current.project.name || '').trim().slice(0, 200)
          || current.project.name,
        sector: String(body.sector != null ? body.sector : current.project.sector || '').trim().slice(0, 160),
        architect: String(body.architect != null ? body.architect : current.project.architect || '').trim().slice(0, 160),
      },
      pack: {
        title: String(body.packTitle || body.title || current.pack.title || 'Wall Types').trim().slice(0, 200)
          || 'Wall Types',
        revision: String(body.revision != null ? body.revision : current.pack.revision || '').trim().slice(0, 40),
        pages: current.pack.pages || 0,
      },
    };
    await pool.query(
      'UPDATE my_drawings_workspace SET wall_types_pack = $2::jsonb WHERE id = $1',
      [workspaceId, JSON.stringify(pack)]
    );
    return res.json(await wallTypesPayload(req));
  } catch (err) {
    console.error('myDrawings updateWallTypesPack:', err);
    return res.status(500).json({ success: false, message: 'Could not save pack details.' });
  }
}

async function seedStarterWallTypes(req, res) {
  try {
    const workspaceId = req.myDrawings.workspace.id;
    const result = await copyStarterWallTypes(workspaceId);
    await logWallTypeActivity(req, 'seeded_wall_types', result.pack.project.name, String(result.added));
    const payload = await wallTypesPayload(req);
    payload.message = result.added
      ? `Added ${result.added} wall type${result.added === 1 ? '' : 's'} from the starter pack.`
      : 'Starter pack types are already in this company.';
    payload.added = result.added;
    return res.json(payload);
  } catch (err) {
    console.error('myDrawings seedStarterWallTypes:', err);
    return res.status(500).json({
      success: false,
      message: err && err.message ? err.message : 'Could not copy the starter pack.',
    });
  }
}

async function addWallType(req, res) {
  try {
    const workspaceId = req.myDrawings.workspace.id;
    const fields = readWallTypeFields(req.body || {});
    if (req.file) fields.detailImagePath = saveWallTypeImageFile(workspaceId, req.file);
    const row = await insertWallTypeRow(workspaceId, fields);
    await pool.query(
      `UPDATE my_drawings_workspace
       SET wall_types_pack = COALESCE(wall_types_pack, '{}'::jsonb)
       WHERE id = $1 AND wall_types_pack IS NULL`,
      [workspaceId]
    );
    await logWallTypeActivity(req, 'added_wall_type', fields.name || fields.code, fields.code);
    const payload = await wallTypesPayload(req);
    payload.wallType = wallTypeToClient(row);
    return res.json(payload);
  } catch (err) {
    console.error('myDrawings addWallType:', err);
    if (err && err.status === 400) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err && err.code === '23505') {
      return res.status(409).json({ success: false, message: 'That wall type code already exists.' });
    }
    return res.status(500).json({ success: false, message: 'Could not add wall type.' });
  }
}

async function editWallType(req, res) {
  try {
    const workspaceId = req.myDrawings.workspace.id;
    const item = await loadWallType(workspaceId, req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Wall type not found.' });
    const fields = readWallTypeFields(req.body || {});
    let imagePath = item.detail_image_path;
    if (req.file) {
      const nextPath = saveWallTypeImageFile(workspaceId, req.file);
      if (nextPath) {
        if (imagePath && imagePath !== nextPath) removeStoredFile(imagePath);
        imagePath = nextPath;
      }
    }
    const updated = await pool.query(
      `UPDATE my_drawings_wall_type
       SET code = $1, kind = $2, name = $3, system_ref = $4, system_type = $5,
           fire_minutes = $6, fire_class = $7, acoustic = $8, thickness = $9,
           max_height_m = $10, duty = $11, buildup = $12::jsonb, pack_pages = $13::jsonb,
           detail_image_path = $14, updated_at = NOW()
       WHERE id = $15
       RETURNING *`,
      [
        fields.code,
        fields.kind,
        fields.name,
        fields.systemRef,
        fields.systemType,
        fields.fireMinutes,
        fields.fireClass,
        fields.acoustic,
        fields.thickness,
        fields.maxHeightM,
        fields.duty,
        JSON.stringify(fields.buildup || {}),
        JSON.stringify(fields.packPages || {}),
        imagePath || null,
        item.id,
      ]
    );
    await logWallTypeActivity(req, 'updated_wall_type', fields.name || fields.code, fields.code);
    const payload = await wallTypesPayload(req);
    payload.wallType = wallTypeToClient(updated.rows[0]);
    return res.json(payload);
  } catch (err) {
    console.error('myDrawings editWallType:', err);
    if (err && err.status === 400) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err && err.code === '23505') {
      return res.status(409).json({ success: false, message: 'That wall type code already exists.' });
    }
    return res.status(500).json({ success: false, message: 'Could not update wall type.' });
  }
}

async function deleteWallType(req, res) {
  try {
    const item = await loadWallType(req.myDrawings.workspace.id, req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Wall type not found.' });
    await pool.query('DELETE FROM my_drawings_wall_type WHERE id = $1', [item.id]);
    removeStoredFile(item.detail_image_path);
    await logWallTypeActivity(req, 'deleted_wall_type', item.name || item.code, item.code);
    return res.json(await wallTypesPayload(req));
  } catch (err) {
    console.error('myDrawings deleteWallType:', err);
    return res.status(500).json({ success: false, message: 'Could not delete wall type.' });
  }
}

async function downloadWallTypeImage(req, res) {
  try {
    const item = await loadWallType(req.myDrawings.workspace.id, req.params.id);
    if (!item || !item.detail_image_path) {
      return res.status(404).json({ success: false, message: 'Image not found.' });
    }
    const abs = absFromRelative(item.detail_image_path);
    if (!abs || !fs.existsSync(abs)) {
      return res.status(404).json({ success: false, message: 'Image missing on server.' });
    }
    const expectedRoot = path.join(UPLOAD_DIR, String(req.myDrawings.workspace.id)) + path.sep;
    if (!abs.startsWith(expectedRoot) && !abs.startsWith(UPLOAD_DIR + path.sep)) {
      return res.status(404).json({ success: false, message: 'Image missing on server.' });
    }
    const ext = path.extname(abs).toLowerCase();
    const type = ext === '.png' ? 'image/png'
      : ext === '.webp' ? 'image/webp'
      : ext === '.gif' ? 'image/gif'
      : 'image/jpeg';
    res.setHeader('Content-Type', type);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('Content-Disposition', 'inline');
    return res.sendFile(abs);
  } catch (err) {
    console.error('myDrawings downloadWallTypeImage:', err);
    return res.status(500).json({ success: false, message: 'Could not load image.' });
  }
}

module.exports = {
  clearAutoSeededWallTypesOnce,
  listWallTypes,
  updateWallTypesPack,
  seedStarterWallTypes,
  addWallType,
  editWallType,
  deleteWallType,
  downloadWallTypeImage,
};
