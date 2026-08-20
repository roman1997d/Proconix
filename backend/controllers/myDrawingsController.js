/**
 * My Drawings shared catalog — PIN unlock, admin CRUD, PDF storage on disk.
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { pool } = require('../db/pool');
const { UPLOADS_ROOT } = require('../middleware/resolveCompanyDocsDir');

const ACCESS_PIN = String(process.env.MY_DRAWINGS_ACCESS_PIN || '2580');
const ADMIN_PIN = String(process.env.MY_DRAWINGS_ADMIN_PIN || '1470');
const UPLOAD_DIR = path.join(UPLOADS_ROOT, 'mydrawings');
const SAMPLES_DIR = path.resolve(__dirname, '../../frontend/mydrawings/samples');

const SEED_CATEGORIES = ['Architectural', 'Structural', 'MEP', 'Electrical'];
const SEED_DRAWINGS = [
  { number: 'A-102', title: 'Ground Floor Plan', category: 'Architectural', revision: 'C', file: 'a-102.pdf' },
  { number: 'A-201', title: 'First Floor Plan', category: 'Architectural', revision: 'B', file: 'a-201.pdf' },
  { number: 'A-301', title: 'Typical Room Layout', category: 'Architectural', revision: 'A', file: 'a-301.pdf' },
  { number: 'S-101', title: 'Foundation Plan', category: 'Structural', revision: 'D', file: 's-101.pdf' },
  { number: 'S-210', title: 'Steel Frame Level 2', category: 'Structural', revision: 'B', file: 's-210.pdf' },
  { number: 'M-401', title: 'HVAC Ground Floor', category: 'MEP', revision: 'C', file: 'm-401.pdf' },
  { number: 'E-110', title: 'Lighting Layout Ground', category: 'Electrical', revision: 'A', file: 'e-110.pdf' },
  { number: 'E-220', title: 'Fire Alarm Schematic', category: 'Electrical', revision: 'B', file: 'e-220.pdf' },
];

let schemaReady = null;

function isoDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ensureUploadDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  return UPLOAD_DIR;
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

async function ensureSchemaInner() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS my_drawings_workspace (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      access_pin_hash TEXT NOT NULL,
      admin_pin_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS my_drawings_category (
      id SERIAL PRIMARY KEY,
      workspace_id INT NOT NULL REFERENCES my_drawings_workspace(id) ON DELETE CASCADE,
      name VARCHAR(80) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      CONSTRAINT uq_my_drawings_category UNIQUE (workspace_id, name)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS my_drawings_item (
      id SERIAL PRIMARY KEY,
      workspace_id INT NOT NULL REFERENCES my_drawings_workspace(id) ON DELETE CASCADE,
      category_id INT REFERENCES my_drawings_category(id) ON DELETE SET NULL,
      number VARCHAR(40) NOT NULL,
      title VARCHAR(200) NOT NULL,
      revision VARCHAR(12) NOT NULL DEFAULT 'A',
      size_bytes BIGINT,
      stored_filename VARCHAR(500),
      relative_path VARCHAR(1200),
      mime_type VARCHAR(200) DEFAULT 'application/pdf',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_my_drawings_item_number UNIQUE (workspace_id, number)
    )
  `);

  const existing = await pool.query('SELECT id FROM my_drawings_workspace ORDER BY id ASC LIMIT 1');
  if (existing.rows[0]) return;

  ensureUploadDir();
  const accessHash = await bcrypt.hash(ACCESS_PIN, 10);
  const adminHash = await bcrypt.hash(ADMIN_PIN, 10);
  const ws = await pool.query(
    'INSERT INTO my_drawings_workspace (name, access_pin_hash, admin_pin_hash) VALUES ($1, $2, $3) RETURNING id, name',
    ['Riverside Tower — Phase 2', accessHash, adminHash]
  );
  const workspaceId = ws.rows[0].id;
  const catIds = {};
  for (let i = 0; i < SEED_CATEGORIES.length; i += 1) {
    const name = SEED_CATEGORIES[i];
    const row = await pool.query(
      'INSERT INTO my_drawings_category (workspace_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id, name',
      [workspaceId, name, i]
    );
    catIds[name] = row.rows[0].id;
  }
  for (const item of SEED_DRAWINGS) {
    const src = path.join(SAMPLES_DIR, item.file);
    if (!fs.existsSync(src)) continue;
    const stored = `md-seed-${item.file}`;
    const dest = path.join(UPLOAD_DIR, stored);
    fs.copyFileSync(src, dest);
    const stat = fs.statSync(dest);
    await pool.query(
      `INSERT INTO my_drawings_item
        (workspace_id, category_id, number, title, revision, size_bytes, stored_filename, relative_path, mime_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'application/pdf')`,
      [
        workspaceId,
        catIds[item.category] || null,
        item.number,
        item.title,
        item.revision,
        stat.size,
        stored,
        relativeFromAbs(dest),
      ]
    );
  }
}

function ensureSchema() {
  if (!schemaReady) {
    schemaReady = ensureSchemaInner().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

async function resolveWorkspaceByPin(pin) {
  await ensureSchema();
  const result = await pool.query(
    'SELECT id, name, access_pin_hash, admin_pin_hash FROM my_drawings_workspace ORDER BY id ASC'
  );
  for (const row of result.rows) {
    if (await bcrypt.compare(pin, row.admin_pin_hash)) {
      return { workspace: row, role: 'admin' };
    }
    if (await bcrypt.compare(pin, row.access_pin_hash)) {
      return { workspace: row, role: 'worker' };
    }
  }
  return null;
}

async function loadCatalog(workspace, role) {
  const cats = await pool.query(
    'SELECT id, name FROM my_drawings_category WHERE workspace_id = $1 ORDER BY sort_order ASC, name ASC',
    [workspace.id]
  );
  const items = await pool.query(
    `SELECT i.id, i.number, i.title, i.revision, i.size_bytes, i.updated_at, c.name AS category
     FROM my_drawings_item i
     LEFT JOIN my_drawings_category c ON c.id = i.category_id
     WHERE i.workspace_id = $1
     ORDER BY i.number ASC`,
    [workspace.id]
  );
  return {
    success: true,
    role: role || 'worker',
    project: { id: `ws-${workspace.id}`, name: workspace.name },
    categories: cats.rows.map((r) => r.name),
    drawings: items.rows.map((d) => ({
      id: String(d.id),
      number: d.number,
      title: d.title,
      category: d.category || 'Uncategorised',
      revision: d.revision,
      updatedAt: isoDate(d.updated_at),
      sizeBytes: Number(d.size_bytes) || 0,
      fileUrl: `/api/my-drawings/drawings/${d.id}/file`,
    })),
  };
}

async function catalogResponse(req, res) {
  const payload = await loadCatalog(req.myDrawings.workspace, req.myDrawings.role);
  return res.json(payload);
}

async function unlock(req, res) {
  try {
    await ensureSchema();
    const pin = String((req.body && req.body.pin) || '').trim();
    if (!/^\d{4}$/.test(pin)) {
      return res.status(401).json({ success: false, message: 'Incorrect access key' });
    }
    const resolved = await resolveWorkspaceByPin(pin);
    if (!resolved) {
      return res.status(401).json({ success: false, message: 'Incorrect access key' });
    }
    req.myDrawings = resolved;
    return catalogResponse(req, res);
  } catch (err) {
    console.error('myDrawings unlock:', err);
    return res.status(500).json({ success: false, message: 'Could not unlock drawings.' });
  }
}

async function getCatalog(req, res) {
  try {
    return catalogResponse(req, res);
  } catch (err) {
    console.error('myDrawings catalog:', err);
    return res.status(500).json({ success: false, message: 'Could not load drawings.' });
  }
}

async function getOrCreateCategory(workspaceId, name) {
  const trimmed = String(name || '').trim().slice(0, 80);
  if (!trimmed) return null;
  const found = await pool.query(
    'SELECT id, name FROM my_drawings_category WHERE workspace_id = $1 AND LOWER(name) = LOWER($2)',
    [workspaceId, trimmed]
  );
  if (found.rows[0]) return found.rows[0];
  const inserted = await pool.query(
    `INSERT INTO my_drawings_category (workspace_id, name, sort_order)
     VALUES ($1, $2, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM my_drawings_category WHERE workspace_id = $1))
     RETURNING id, name`,
    [workspaceId, trimmed]
  );
  return inserted.rows[0];
}

async function addCategory(req, res) {
  try {
    const name = String((req.body && req.body.name) || '').trim().slice(0, 80);
    if (!name) return res.status(400).json({ success: false, message: 'Category name is required.' });
    const workspaceId = req.myDrawings.workspace.id;
    const exists = await pool.query(
      'SELECT id FROM my_drawings_category WHERE workspace_id = $1 AND LOWER(name) = LOWER($2)',
      [workspaceId, name]
    );
    if (exists.rows[0]) {
      return res.status(400).json({ success: false, message: 'That category already exists.' });
    }
    await getOrCreateCategory(workspaceId, name);
    return catalogResponse(req, res);
  } catch (err) {
    console.error('myDrawings addCategory:', err);
    return res.status(500).json({ success: false, message: 'Could not add category.' });
  }
}

async function deleteCategory(req, res) {
  try {
    const name = String((req.body && req.body.name) || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Category name is required.' });
    const workspaceId = req.myDrawings.workspace.id;
    const cat = await pool.query(
      'SELECT id FROM my_drawings_category WHERE workspace_id = $1 AND name = $2',
      [workspaceId, name]
    );
    if (!cat.rows[0]) return res.status(404).json({ success: false, message: 'Category not found.' });
    let fallback = await pool.query(
      `SELECT id FROM my_drawings_category
       WHERE workspace_id = $1 AND name <> $2
       ORDER BY sort_order ASC, name ASC LIMIT 1`,
      [workspaceId, name]
    );
    if (!fallback.rows[0]) {
      fallback = await pool.query(
        `INSERT INTO my_drawings_category (workspace_id, name, sort_order)
         VALUES ($1, 'Uncategorised', 0) RETURNING id`,
        [workspaceId]
      );
    }
    await pool.query(
      'UPDATE my_drawings_item SET category_id = $1, updated_at = NOW() WHERE workspace_id = $2 AND category_id = $3',
      [fallback.rows[0].id, workspaceId, cat.rows[0].id]
    );
    await pool.query('DELETE FROM my_drawings_category WHERE id = $1', [cat.rows[0].id]);
    return catalogResponse(req, res);
  } catch (err) {
    console.error('myDrawings deleteCategory:', err);
    return res.status(500).json({ success: false, message: 'Could not delete category.' });
  }
}

function fileMeta(file) {
  if (!file) return null;
  return {
    size_bytes: file.size,
    stored_filename: file.filename,
    relative_path: relativeFromAbs(file.path),
    mime_type: file.mimetype || 'application/pdf',
  };
}

async function addDrawing(req, res) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Choose a PDF file.' });
    const number = String((req.body && req.body.number) || '').trim().slice(0, 40);
    const title = String((req.body && req.body.title) || '').trim().slice(0, 200);
    const revision = String((req.body && req.body.revision) || 'A').trim().toUpperCase().slice(0, 12) || 'A';
    const categoryName = String((req.body && req.body.category) || '').trim();
    if (!number || !title) {
      removeStoredFile(relativeFromAbs(req.file.path));
      return res.status(400).json({ success: false, message: 'Number and title are required.' });
    }
    const workspaceId = req.myDrawings.workspace.id;
    const clash = await pool.query(
      'SELECT id FROM my_drawings_item WHERE workspace_id = $1 AND LOWER(number) = LOWER($2)',
      [workspaceId, number]
    );
    if (clash.rows[0]) {
      removeStoredFile(relativeFromAbs(req.file.path));
      return res.status(400).json({ success: false, message: 'A drawing with that number already exists. Use Update to replace it.' });
    }
    const cat = await getOrCreateCategory(workspaceId, categoryName || 'Uncategorised');
    const meta = fileMeta(req.file);
    await pool.query(
      `INSERT INTO my_drawings_item
        (workspace_id, category_id, number, title, revision, size_bytes, stored_filename, relative_path, mime_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [workspaceId, cat && cat.id, number, title, revision, meta.size_bytes, meta.stored_filename, meta.relative_path, meta.mime_type]
    );
    return catalogResponse(req, res);
  } catch (err) {
    if (req.file) removeStoredFile(relativeFromAbs(req.file.path));
    console.error('myDrawings addDrawing:', err);
    return res.status(500).json({ success: false, message: 'Could not add drawing.' });
  }
}

async function loadItem(workspaceId, id) {
  const n = parseInt(id, 10);
  if (!Number.isInteger(n) || n < 1) return null;
  const row = await pool.query(
    'SELECT * FROM my_drawings_item WHERE id = $1 AND workspace_id = $2',
    [n, workspaceId]
  );
  return row.rows[0] || null;
}

async function editDrawing(req, res) {
  try {
    const item = await loadItem(req.myDrawings.workspace.id, req.params.id);
    if (!item) {
      if (req.file) removeStoredFile(relativeFromAbs(req.file.path));
      return res.status(404).json({ success: false, message: 'Drawing not found.' });
    }
    const number = String((req.body && req.body.number) || item.number).trim().slice(0, 40);
    const title = String((req.body && req.body.title) || item.title).trim().slice(0, 200);
    const revision = String((req.body && req.body.revision) || item.revision).trim().toUpperCase().slice(0, 12) || 'A';
    const categoryName = String((req.body && req.body.category) || '').trim();
    if (!number || !title) {
      if (req.file) removeStoredFile(relativeFromAbs(req.file.path));
      return res.status(400).json({ success: false, message: 'Number and title are required.' });
    }
    const clash = await pool.query(
      'SELECT id FROM my_drawings_item WHERE workspace_id = $1 AND LOWER(number) = LOWER($2) AND id <> $3',
      [req.myDrawings.workspace.id, number, item.id]
    );
    if (clash.rows[0]) {
      if (req.file) removeStoredFile(relativeFromAbs(req.file.path));
      return res.status(400).json({ success: false, message: 'Another drawing already uses that number.' });
    }
    const cat = await getOrCreateCategory(req.myDrawings.workspace.id, categoryName || 'Uncategorised');
    let meta = {
      size_bytes: item.size_bytes,
      stored_filename: item.stored_filename,
      relative_path: item.relative_path,
      mime_type: item.mime_type,
    };
    if (req.file) {
      removeStoredFile(item.relative_path);
      meta = fileMeta(req.file);
    }
    await pool.query(
      `UPDATE my_drawings_item
       SET category_id = $1, number = $2, title = $3, revision = $4,
           size_bytes = $5, stored_filename = $6, relative_path = $7, mime_type = $8, updated_at = NOW()
       WHERE id = $9`,
      [cat && cat.id, number, title, revision, meta.size_bytes, meta.stored_filename, meta.relative_path, meta.mime_type, item.id]
    );
    return catalogResponse(req, res);
  } catch (err) {
    if (req.file) removeStoredFile(relativeFromAbs(req.file.path));
    console.error('myDrawings editDrawing:', err);
    return res.status(500).json({ success: false, message: 'Could not save drawing.' });
  }
}

async function updateDrawingFile(req, res) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Choose the new PDF to replace the old one.' });
    const item = await loadItem(req.myDrawings.workspace.id, req.params.id);
    if (!item) {
      removeStoredFile(relativeFromAbs(req.file.path));
      return res.status(404).json({ success: false, message: 'Drawing not found.' });
    }
    const title = String((req.body && req.body.title) || item.title).trim().slice(0, 200);
    const revision = String((req.body && req.body.revision) || item.revision).trim().toUpperCase().slice(0, 12) || 'A';
    const meta = fileMeta(req.file);
    removeStoredFile(item.relative_path);
    await pool.query(
      `UPDATE my_drawings_item
       SET title = $1, revision = $2, size_bytes = $3, stored_filename = $4, relative_path = $5, mime_type = $6, updated_at = NOW()
       WHERE id = $7`,
      [title || item.title, revision, meta.size_bytes, meta.stored_filename, meta.relative_path, meta.mime_type, item.id]
    );
    return catalogResponse(req, res);
  } catch (err) {
    if (req.file) removeStoredFile(relativeFromAbs(req.file.path));
    console.error('myDrawings updateDrawingFile:', err);
    return res.status(500).json({ success: false, message: 'Could not replace drawing.' });
  }
}

async function deleteDrawing(req, res) {
  try {
    const item = await loadItem(req.myDrawings.workspace.id, req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Drawing not found.' });
    await pool.query('DELETE FROM my_drawings_item WHERE id = $1', [item.id]);
    removeStoredFile(item.relative_path);
    return catalogResponse(req, res);
  } catch (err) {
    console.error('myDrawings deleteDrawing:', err);
    return res.status(500).json({ success: false, message: 'Could not delete drawing.' });
  }
}

async function downloadFile(req, res) {
  try {
    const item = await loadItem(req.myDrawings.workspace.id, req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Drawing not found.' });
    const abs = absFromRelative(item.relative_path);
    if (!abs || !fs.existsSync(abs)) {
      return res.status(404).json({ success: false, message: 'File missing on server.' });
    }
    const download = req.query.download === '1' || req.query.download === 'true';
    res.setHeader('Content-Type', item.mime_type || 'application/pdf');
    if (download) {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(item.number || 'drawing')}.pdf"`);
    } else {
      res.setHeader('Content-Disposition', 'inline');
    }
    return res.sendFile(abs);
  } catch (err) {
    console.error('myDrawings downloadFile:', err);
    return res.status(500).json({ success: false, message: 'Could not load drawing.' });
  }
}

function prepareUploadDir(req, res, next) {
  req.myDrawingsUploadDir = ensureUploadDir();
  next();
}

module.exports = {
  ensureSchema,
  resolveWorkspaceByPin,
  unlock,
  getCatalog,
  addCategory,
  deleteCategory,
  addDrawing,
  editDrawing,
  updateDrawingFile,
  deleteDrawing,
  downloadFile,
  prepareUploadDir,
};
