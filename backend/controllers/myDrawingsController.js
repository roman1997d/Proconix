/**
 * My Drawings shared catalog — worker email passkey, admin PIN, PDF storage on disk.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { pool } = require('../db/pool');
const { UPLOADS_ROOT } = require('../middleware/resolveCompanyDocsDir');
const { createTransport } = require('../lib/sendCallbackRequestEmail');
const { signMyDrawingsJwt, verifyMyDrawingsJwt } = require('../lib/myDrawingsJwt');
const { notifyDrawingChange } = require('../lib/myDrawingsPushService');
const {
  clearAutoSeededWallTypesOnce,
  importNorfolkMedlockSpecsOnce,
  restoreMissingWallTypeImages,
  listWallTypes,
  updateWallTypesPack,
  seedStarterWallTypes,
  addWallType,
  editWallType,
  deleteWallType,
  downloadWallTypeImage,
  sendSpecImportRequest,
} = require('../lib/myDrawingsWallTypes');
const {
  isHealthProbeId,
  healthProbeDrawingItem,
} = require('../lib/myDrawingsHealthProbe');
const {
  listWorkspaceSites,
  loadSiteRow,
  findSiteByAccessCode,
  attachCurrentSite,
  sitesVisibleTo,
  canManageSite,
  isCompanyHead,
  currentSiteId,
} = require('../lib/myDrawingsSiteScope');
const {
  parseFloorCount,
  parseExtraLocations,
  parseLocationIds,
  allowedLocationIds,
  locationsFromProject,
  occupiedLocations,
  siteLocationFields,
  normalizeLocationId,
} = require('../lib/myDrawingsLocations');

const ACCESS_PIN = String(process.env.MY_DRAWINGS_ACCESS_PIN || '2580');
const ADMIN_PIN = '2026';
const UPLOAD_DIR = path.join(UPLOADS_ROOT, 'mydrawings');
const DEFAULT_PROJECT_NAME = 'My Drawings';
const RESERVED_PINS = new Set([ACCESS_PIN, ADMIN_PIN, '0000']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGISTER_EMAIL_MAX = 5;
const REGISTER_IP_MAX = 20;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;

let schemaReady = null;
const registerHits = new Map();

function isoDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function floorsForClient(value) {
  if (!value) return [];
  return parseLocationIds(value, null) || [];
}

function parseProjectFloors(raw, project) {
  return parseLocationIds(raw, allowedLocationIds(project));
}

function ensureUploadDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  return UPLOAD_DIR;
}

function positiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function ensureTenantUploadDir(companyId, projectId) {
  const cid = positiveInt(companyId);
  const pid = positiveInt(projectId);
  if (!cid || !pid) {
    throw new Error('Invalid company or project for upload path');
  }
  const dir = path.join(UPLOAD_DIR, String(cid), String(pid));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function relativeFromAbs(absPath) {
  return path.relative(UPLOADS_ROOT, absPath).split(path.sep).join('/');
}

function normalizeStoredRel(relativePath) {
  if (!relativePath) return '';
  let rel = String(relativePath).trim().replace(/\\/g, '/');
  if (!rel) return '';
  const marker = '/uploads/';
  const idx = rel.toLowerCase().lastIndexOf(marker);
  if (idx !== -1 && (rel.startsWith('/') || /^[A-Za-z]:\//.test(rel))) {
    rel = rel.slice(idx + marker.length);
  }
  rel = rel.replace(/^\/+/, '');
  if (rel.startsWith('backend/uploads/')) rel = rel.slice('backend/uploads/'.length);
  if (rel.startsWith('uploads/')) rel = rel.slice('uploads/'.length);
  rel = rel.replace(/^(mydrawings\/)+/, 'mydrawings/');
  return rel;
}

function isFile(abs) {
  try {
    return !!(abs && fs.existsSync(abs) && fs.statSync(abs).isFile());
  } catch (_) {
    return false;
  }
}

function absFromRelative(relativePath) {
  const rel = normalizeStoredRel(relativePath);
  if (!rel) return null;
  const abs = path.resolve(UPLOADS_ROOT, rel.split('/').join(path.sep));
  const root = path.resolve(UPLOADS_ROOT);
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (abs !== root && !abs.startsWith(prefix)) return null;
  return abs;
}

function findNamedFile(dir, filename, depth) {
  if (!filename || depth < 0 || !dir) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return null;
  }
  for (const ent of entries) {
    if (ent.isFile() && ent.name === filename) return path.join(dir, ent.name);
  }
  for (const ent of entries) {
    if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
    const found = findNamedFile(path.join(dir, ent.name), filename, depth - 1);
    if (found) return found;
  }
  return null;
}

function locateStoredDrawingFile(item) {
  if (!item) return null;
  const rel = normalizeStoredRel(item.relative_path);
  const name = item.stored_filename || path.basename(rel);
  const ws = item.workspace_id;
  const pid = item.project_id;
  const candidates = [];
  function push(value) {
    const abs = absFromRelative(value);
    if (abs && !candidates.includes(abs)) candidates.push(abs);
  }
  push(item.relative_path);
  push(rel);
  if (name && ws && pid) push(`mydrawings/${ws}/${pid}/${name}`);
  if (name && ws) push(`mydrawings/${ws}/${name}`);
  if (name) push(`mydrawings/${name}`);
  const nested = rel.match(/^mydrawings\/(\d+)\/([^/]+)$/);
  if (nested && pid) push(`mydrawings/${nested[1]}/${pid}/${nested[2]}`);
  for (const abs of candidates) {
    if (isFile(abs)) return abs;
  }
  if (name && ws) {
    const found = findNamedFile(path.join(UPLOAD_DIR, String(ws)), name, 4);
    if (isFile(found)) return found;
  }
  if (name) {
    const found = findNamedFile(UPLOAD_DIR, name, 4);
    if (isFile(found)) return found;
  }
  const number = String(item.number || '').trim();
  if (number.length >= 4) {
    const hgDir = hgDrawingsDir();
    const byNumber =
      findFileContaining(path.join(UPLOAD_DIR, String(ws || '')), number, 4) ||
      findFileContaining(UPLOAD_DIR, number, 4) ||
      findFileContaining(hgDir, number, 2);
    if (isFile(byNumber)) return byNumber;
  }
  return null;
}

function findFileContaining(dir, token, depth) {
  if (!token || depth < 0 || !dir) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return null;
  }
  const needle = String(token).toLowerCase();
  for (const ent of entries) {
    if (ent.isFile() && /\.pdf$/i.test(ent.name) && ent.name.toLowerCase().includes(needle)) {
      return path.join(dir, ent.name);
    }
  }
  for (const ent of entries) {
    if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
    const found = findFileContaining(path.join(dir, ent.name), token, depth - 1);
    if (found) return found;
  }
  return null;
}

function isAllowedDrawingAbs(abs) {
  if (!abs) return false;
  const resolved = path.resolve(abs);
  const roots = [
    path.resolve(UPLOAD_DIR),
    hgDrawingsDir(),
  ];
  return roots.some((root) => resolved === root || resolved.startsWith(root + path.sep));
}

function hgDrawingsDir() {
  return path.resolve(__dirname, '..', '..', 'HG Drawings');
}

function isUnderDir(abs, dir) {
  if (!abs || !dir) return false;
  const resolved = path.resolve(abs);
  const root = path.resolve(dir);
  return resolved === root || resolved.startsWith(root + path.sep);
}

function copyDrawingIntoTenant(item, abs) {
  const cid = positiveInt(item && item.workspace_id);
  const pid = positiveInt(item && item.project_id);
  if (!cid || !pid || !isFile(abs)) return abs;
  try {
    const destDir = ensureTenantUploadDir(cid, pid);
    const destName = item.stored_filename || path.basename(abs);
    const destAbs = path.join(destDir, destName);
    if (path.resolve(abs) === path.resolve(destAbs)) return destAbs;
    if (!isFile(destAbs)) fs.copyFileSync(abs, destAbs);
    return isFile(destAbs) ? destAbs : abs;
  } catch (_) {
    return abs;
  }
}

async function healDrawingPath(item, abs) {
  if (!item || item.healthProbe || isHealthProbeId(item.id) || !item.id || !abs) return;
  const next = relativeFromAbs(abs);
  if (!next || next.startsWith('..') || !next.startsWith('mydrawings/')) return;
  if (next === normalizeStoredRel(item.relative_path)) return;
  try {
    await pool.query('UPDATE my_drawings_item SET relative_path = $1 WHERE id = $2', [next, item.id]);
    item.relative_path = next;
  } catch (err) {
    console.warn('myDrawings heal path:', err && err.message ? err.message : err);
  }
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
  await pool.query(`
    ALTER TABLE my_drawings_workspace
    ADD COLUMN IF NOT EXISTS demo_cleared_at TIMESTAMPTZ
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS my_drawings_worker (
      id SERIAL PRIMARY KEY,
      workspace_id INT NOT NULL REFERENCES my_drawings_workspace(id) ON DELETE CASCADE,
      first_name VARCHAR(80) NOT NULL,
      last_name VARCHAR(80) NOT NULL,
      email VARCHAR(254) NOT NULL,
      pin_hash TEXT,
      pin_sha VARCHAR(64),
      pin_expires_at TIMESTAMPTZ,
      verified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_my_drawings_worker_email UNIQUE (workspace_id, email)
    )
  `);
  await pool.query(`
    ALTER TABLE my_drawings_worker
    ADD COLUMN IF NOT EXISTS access_suspended_until TIMESTAMPTZ
  `);
  await pool.query(`
    ALTER TABLE my_drawings_worker
    ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS my_drawings_device (
      id SERIAL PRIMARY KEY,
      worker_id INT NOT NULL REFERENCES my_drawings_worker(id) ON DELETE CASCADE,
      token_hash VARCHAR(64) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_my_drawings_device_token UNIQUE (token_hash)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_my_drawings_worker_ws ON my_drawings_worker(workspace_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_my_drawings_device_worker ON my_drawings_device(worker_id)`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_my_drawings_worker_pin_sha
    ON my_drawings_worker(workspace_id, pin_sha)
    WHERE pin_sha IS NOT NULL
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS my_drawings_activity (
      id SERIAL PRIMARY KEY,
      workspace_id INT NOT NULL REFERENCES my_drawings_workspace(id) ON DELETE CASCADE,
      actor_name VARCHAR(160) NOT NULL,
      action VARCHAR(40) NOT NULL,
      drawing_title VARCHAR(200),
      drawing_number VARCHAR(40),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_my_drawings_activity_ws ON my_drawings_activity(workspace_id, created_at DESC)`);
  await pool.query(`
    ALTER TABLE my_drawings_item
    ADD COLUMN IF NOT EXISTS floors TEXT[]
  `);
  await pool.query(`
    ALTER TABLE my_drawings_workspace
    ADD COLUMN IF NOT EXISTS email VARCHAR(254)
  `);
  await pool.query(`
    ALTER TABLE my_drawings_workspace
    ADD COLUMN IF NOT EXISTS password_hash TEXT
  `);
  await pool.query(`
    ALTER TABLE my_drawings_workspace
    ADD COLUMN IF NOT EXISTS manager_name VARCHAR(160)
  `);
  await pool.query(`
    ALTER TABLE my_drawings_workspace
    ADD COLUMN IF NOT EXISTS access_code VARCHAR(32)
  `);
  await pool.query(`
    ALTER TABLE my_drawings_workspace
    ADD COLUMN IF NOT EXISTS logo_path TEXT
  `);
  await pool.query(`
    ALTER TABLE my_drawings_workspace
    ADD COLUMN IF NOT EXISTS project_mode VARCHAR(16) NOT NULL DEFAULT 'single'
  `);
  await pool.query(`
    ALTER TABLE my_drawings_device
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_my_drawings_workspace_access_code
    ON my_drawings_workspace (UPPER(access_code))
    WHERE access_code IS NOT NULL
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_my_drawings_workspace_email
    ON my_drawings_workspace (LOWER(email))
    WHERE email IS NOT NULL
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS my_drawings_admin_session (
      id SERIAL PRIMARY KEY,
      workspace_id INT NOT NULL REFERENCES my_drawings_workspace(id) ON DELETE CASCADE,
      token_hash VARCHAR(64) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_my_drawings_admin_session_token UNIQUE (token_hash)
    )
  `);
  await pool.query(`
    ALTER TABLE my_drawings_admin_session
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS my_drawings_password_reset (
      id SERIAL PRIMARY KEY,
      workspace_id INT NOT NULL REFERENCES my_drawings_workspace(id) ON DELETE CASCADE,
      token_hash VARCHAR(64) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_my_drawings_password_reset_token UNIQUE (token_hash)
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_my_drawings_password_reset_ws ON my_drawings_password_reset(workspace_id)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_my_drawings_admin_session_ws ON my_drawings_admin_session(workspace_id)`
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS my_drawings_project (
      id SERIAL PRIMARY KEY,
      workspace_id INT NOT NULL REFERENCES my_drawings_workspace(id) ON DELETE CASCADE,
      name VARCHAR(200) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_my_drawings_project UNIQUE (workspace_id, name)
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_my_drawings_project_ws ON my_drawings_project(workspace_id)`
  );
  await pool.query(`
    ALTER TABLE my_drawings_item
    ADD COLUMN IF NOT EXISTS project_id INT REFERENCES my_drawings_project(id) ON DELETE CASCADE
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_my_drawings_item_project ON my_drawings_item(project_id)`
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_devices (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES my_drawings_worker(id) ON DELETE CASCADE,
      fcm_token TEXT NOT NULL,
      platform VARCHAR(20),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_user_devices_fcm_token UNIQUE (fcm_token)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices(user_id)`);
  await pool.query(`
    ALTER TABLE my_drawings_workspace
    ADD COLUMN IF NOT EXISTS wall_types_pack JSONB
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS my_drawings_wall_type (
      id SERIAL PRIMARY KEY,
      workspace_id INT NOT NULL REFERENCES my_drawings_workspace(id) ON DELETE CASCADE,
      code VARCHAR(40) NOT NULL,
      kind VARCHAR(20) NOT NULL DEFAULT 'wall',
      name VARCHAR(300) NOT NULL DEFAULT '',
      system_ref VARCHAR(120) NOT NULL DEFAULT '',
      system_type VARCHAR(200) NOT NULL DEFAULT '',
      fire_minutes VARCHAR(40) NOT NULL DEFAULT '',
      fire_class VARCHAR(80) NOT NULL DEFAULT '',
      acoustic VARCHAR(80) NOT NULL DEFAULT '',
      thickness VARCHAR(40) NOT NULL DEFAULT '',
      max_height_m VARCHAR(40) NOT NULL DEFAULT '',
      duty VARCHAR(40) NOT NULL DEFAULT '',
      buildup JSONB NOT NULL DEFAULT '{}'::jsonb,
      pack_pages JSONB NOT NULL DEFAULT '{}'::jsonb,
      detail_image_path TEXT,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_my_drawings_wall_type_code
     ON my_drawings_wall_type (workspace_id, UPPER(code))`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_my_drawings_wall_type_ws
     ON my_drawings_wall_type (workspace_id, sort_order, id)`
  );
  await addSiteColumns();

  ensureUploadDir();
  await seedTenants();
  await seedDefaultProjects();
  await migrateSitesOntoProjects();
  await migrateStoredDrawingsToTenantDirs();
  await restoreMissingDrawingsFromHg();
  await clearAutoSeededWallTypesOnce();
  await importNorfolkMedlockSpecsOnce();
  await restoreMissingWallTypeImages();
}

async function addSiteColumns() {
  await pool.query(`ALTER TABLE my_drawings_project ADD COLUMN IF NOT EXISTS access_code VARCHAR(32)`);
  await pool.query(`ALTER TABLE my_drawings_project ADD COLUMN IF NOT EXISTS wall_types_pack JSONB`);
  await pool.query(`ALTER TABLE my_drawings_project ADD COLUMN IF NOT EXISTS manager_worker_id INT`);
  await pool.query(`ALTER TABLE my_drawings_project ADD COLUMN IF NOT EXISTS floor_count INT`);
  await pool.query(`ALTER TABLE my_drawings_project ADD COLUMN IF NOT EXISTS extra_locations TEXT[]`);
  await pool.query(`ALTER TABLE my_drawings_worker ADD COLUMN IF NOT EXISTS project_id INT`);
  await pool.query(`ALTER TABLE my_drawings_wall_type ADD COLUMN IF NOT EXISTS project_id INT`);
  await pool.query(`ALTER TABLE my_drawings_category ADD COLUMN IF NOT EXISTS project_id INT`);
  await pool.query(`ALTER TABLE my_drawings_activity ADD COLUMN IF NOT EXISTS project_id INT`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_my_drawings_project_access_code
    ON my_drawings_project (UPPER(access_code))
    WHERE access_code IS NOT NULL
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_my_drawings_worker_project ON my_drawings_worker(project_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_my_drawings_wall_type_project ON my_drawings_wall_type(project_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_my_drawings_category_project ON my_drawings_category(project_id)`);
  try {
    await pool.query('ALTER TABLE my_drawings_category DROP CONSTRAINT IF EXISTS uq_my_drawings_category');
  } catch (_) {}
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_my_drawings_category_project
    ON my_drawings_category (project_id, LOWER(name))
    WHERE project_id IS NOT NULL
  `);
  try {
    await pool.query('ALTER TABLE my_drawings_item DROP CONSTRAINT IF EXISTS uq_my_drawings_item_number');
  } catch (_) {}
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_my_drawings_item_project_number
    ON my_drawings_item (project_id, LOWER(number))
    WHERE project_id IS NOT NULL
  `);
  try {
    await pool.query('ALTER TABLE my_drawings_worker DROP CONSTRAINT IF EXISTS uq_my_drawings_worker_email');
  } catch (_) {}
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_my_drawings_worker_project_email
    ON my_drawings_worker (project_id, LOWER(email))
    WHERE project_id IS NOT NULL
  `);
  await pool.query('DROP INDEX IF EXISTS uq_my_drawings_wall_type_code');
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_my_drawings_wall_type_project_code
    ON my_drawings_wall_type (project_id, UPPER(code))
    WHERE project_id IS NOT NULL
  `);
}

async function migrateSitesOntoProjects() {
  const workspaces = await pool.query(
    'SELECT id, name, access_code, wall_types_pack FROM my_drawings_workspace ORDER BY id ASC'
  );
  for (const ws of workspaces.rows) {
    const project = await getDefaultProject(ws.id);
    if (!project) continue;
    if (!project.access_code && ws.access_code) {
      const taken = await accessCodeTaken(ws.access_code, ws.id, project.id);
      if (!taken) {
        await pool.query('UPDATE my_drawings_project SET access_code = $2 WHERE id = $1', [
          project.id,
          ws.access_code,
        ]);
        project.access_code = ws.access_code;
      }
    }
    if (!project.access_code) {
      try {
        const code = await allocateAccessCode(ws.id, project.id);
        await pool.query('UPDATE my_drawings_project SET access_code = $2 WHERE id = $1', [project.id, code]);
        project.access_code = code;
      } catch (_) {}
    }
    await pool.query(
      `UPDATE my_drawings_project
       SET wall_types_pack = $2::jsonb
       WHERE id = $1 AND (wall_types_pack IS NULL OR wall_types_pack = '{}'::jsonb)
         AND $2::jsonb IS NOT NULL AND $2::jsonb <> '{}'::jsonb`,
      [project.id, JSON.stringify(ws.wall_types_pack && typeof ws.wall_types_pack === 'object' ? ws.wall_types_pack : {})]
    );
    await pool.query(
      'UPDATE my_drawings_worker SET project_id = $1 WHERE workspace_id = $2 AND project_id IS NULL',
      [project.id, ws.id]
    );
    await pool.query(
      'UPDATE my_drawings_wall_type SET project_id = $1 WHERE workspace_id = $2 AND project_id IS NULL',
      [project.id, ws.id]
    );
    await pool.query(
      'UPDATE my_drawings_category SET project_id = $1 WHERE workspace_id = $2 AND project_id IS NULL',
      [project.id, ws.id]
    );
    await pool.query(
      'UPDATE my_drawings_activity SET project_id = $1 WHERE workspace_id = $2 AND project_id IS NULL',
      [project.id, ws.id]
    );
    await pool.query(
      `UPDATE my_drawings_project p
       SET manager_worker_id = (
         SELECT w.id FROM my_drawings_worker w
         WHERE w.project_id = p.id AND w.is_admin = TRUE
         ORDER BY w.id ASC LIMIT 1
       )
       WHERE p.id = $1 AND p.manager_worker_id IS NULL`,
      [project.id]
    );
  }
}

async function clearWorkspaceCatalog(workspaceId) {
  const files = await pool.query(
    'SELECT relative_path FROM my_drawings_item WHERE workspace_id = $1',
    [workspaceId]
  );
  files.rows.forEach((row) => removeStoredFile(row.relative_path));
  await pool.query('DELETE FROM my_drawings_item WHERE workspace_id = $1', [workspaceId]);
  await pool.query('DELETE FROM my_drawings_category WHERE workspace_id = $1', [workspaceId]);
  const wallImages = await pool.query(
    'SELECT detail_image_path FROM my_drawings_wall_type WHERE workspace_id = $1',
    [workspaceId]
  );
  wallImages.rows.forEach((row) => removeStoredFile(row.detail_image_path));
  await pool.query('DELETE FROM my_drawings_wall_type WHERE workspace_id = $1', [workspaceId]);
  try {
    if (fs.existsSync(UPLOAD_DIR)) {
      fs.readdirSync(UPLOAD_DIR).forEach((name) => {
        if (String(name).startsWith('md-seed-')) {
          try { fs.unlinkSync(path.join(UPLOAD_DIR, name)); } catch (_) {}
        }
      });
    }
  } catch (_) {}
}

const NORFOLK_ACCESS_CODE = '2026AA';
const STENA_ACCESS_CODE = '1997AA';
const STENA_EMAIL = 'rdemian732@gmail.com';
const STENA_PASSWORD = '12345678';
const STENA_MANAGER = 'John Obama';
const STENA_COMPANY = 'StenaConstruct';
const NORFOLK_COMPANY = 'Norfolk Drywall Ltd';

function normalizeAccessCode(raw) {
  return String(raw || '').replace(/\s+/g, '').toUpperCase();
}

const ACCESS_CODE_RE = /^[A-Z0-9]{6,10}$/;
const SESSION_TTL_SQL = `INTERVAL '6 months'`;
const ADMIN_TTL_SQL = `INTERVAL '30 days'`;
const BRANDING_DIR = path.join(UPLOADS_ROOT, 'mydrawings-branding');
const LOGO_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const ACCESS_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateAccessCode(length) {
  const size = length || 8;
  let out = '';
  for (let i = 0; i < size; i++) {
    out += ACCESS_CODE_CHARS[crypto.randomInt(0, ACCESS_CODE_CHARS.length)];
  }
  return out;
}

async function accessCodeTaken(code, exceptWorkspaceId, exceptProjectId) {
  const normalized = normalizeAccessCode(code);
  const ws = await pool.query(
    `SELECT id FROM my_drawings_workspace
     WHERE UPPER(access_code) = $1 AND id <> $2`,
    [normalized, exceptWorkspaceId || 0]
  );
  if (ws.rows[0]) return true;
  const site = await pool.query(
    `SELECT id FROM my_drawings_project
     WHERE UPPER(access_code) = $1 AND id <> $2`,
    [normalized, exceptProjectId || 0]
  );
  return !!site.rows[0];
}

async function allocateAccessCode(exceptWorkspaceId, exceptProjectId) {
  for (let i = 0; i < 30; i++) {
    const code = generateAccessCode(8);
    if (!(await accessCodeTaken(code, exceptWorkspaceId, exceptProjectId))) return code;
  }
  const err = new Error('Could not generate a unique access code.');
  err.code = 'ACCESS_CODE_ALLOC';
  throw err;
}

async function dummyPinHash() {
  return bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
}

function generateAdminPin() {
  return String(crypto.randomInt(0, 10000)).padStart(4, '0');
}

async function seedTenants() {
  const first = await pool.query(
    'SELECT id, name, access_code, demo_cleared_at, admin_pin_hash FROM my_drawings_workspace ORDER BY id ASC LIMIT 1'
  );

  if (!first.rows[0]) {
    const accessHash = await bcrypt.hash(ACCESS_PIN, 10);
    const adminHash = await bcrypt.hash(ADMIN_PIN, 10);
    await pool.query(
      `INSERT INTO my_drawings_workspace
        (name, access_pin_hash, admin_pin_hash, access_code, manager_name, demo_cleared_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [NORFOLK_COMPANY, accessHash, adminHash, NORFOLK_ACCESS_CODE, NORFOLK_COMPANY]
    );
  } else {
    const row = first.rows[0];
    const code = normalizeAccessCode(row.access_code);
    if (!code) {
      await pool.query(
        `UPDATE my_drawings_workspace
         SET name = $2, access_code = $3, manager_name = COALESCE(NULLIF(manager_name, ''), $4)
         WHERE id = $1`,
        [row.id, NORFOLK_COMPANY, NORFOLK_ACCESS_CODE, NORFOLK_COMPANY]
      );
    }
    if (!row.demo_cleared_at) {
      await clearWorkspaceCatalog(row.id);
      await pool.query(
        `UPDATE my_drawings_workspace SET demo_cleared_at = NOW() WHERE id = $1`,
        [row.id]
      );
    }
  }

  const norfolk = await pool.query(
    `SELECT id, admin_pin_hash FROM my_drawings_workspace WHERE UPPER(access_code) = $1`,
    [NORFOLK_ACCESS_CODE]
  );
  if (norfolk.rows[0]) {
    const hash = norfolk.rows[0].admin_pin_hash;
    if (!hash || !(await bcrypt.compare(ADMIN_PIN, hash))) {
      const adminHash = await bcrypt.hash(ADMIN_PIN, 10);
      await pool.query('UPDATE my_drawings_workspace SET admin_pin_hash = $2 WHERE id = $1', [
        norfolk.rows[0].id,
        adminHash,
      ]);
    }
    await pool.query(
      `UPDATE my_drawings_workspace SET name = $2, manager_name = COALESCE(NULLIF(manager_name, ''), $2)
       WHERE id = $1`,
      [norfolk.rows[0].id, NORFOLK_COMPANY]
    );
  }

  const stena = await pool.query(
    `SELECT id, password_hash FROM my_drawings_workspace
     WHERE LOWER(email) = $1 OR UPPER(access_code) = $2`,
    [STENA_EMAIL, STENA_ACCESS_CODE]
  );
  const passHash = await bcrypt.hash(STENA_PASSWORD, 10);
  if (!stena.rows[0]) {
    const accessHash = await dummyPinHash();
    const adminHash = await dummyPinHash();
    await pool.query(
      `INSERT INTO my_drawings_workspace
        (name, access_pin_hash, admin_pin_hash, email, password_hash, manager_name, access_code, demo_cleared_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [STENA_COMPANY, accessHash, adminHash, STENA_EMAIL, passHash, STENA_MANAGER, STENA_ACCESS_CODE]
    );
  } else {
    const current = stena.rows[0];
    const keepPass = current.password_hash && (await bcrypt.compare(STENA_PASSWORD, current.password_hash));
    await pool.query(
      `UPDATE my_drawings_workspace
       SET name = $2, email = $3, manager_name = $4, access_code = $5, password_hash = COALESCE($6, password_hash)
       WHERE id = $1`,
      [
        current.id,
        STENA_COMPANY,
        STENA_EMAIL,
        STENA_MANAGER,
        STENA_ACCESS_CODE,
        keepPass ? null : passHash,
      ]
    );
  }
}

async function getDefaultProject(workspaceId) {
  const wsId = positiveInt(workspaceId);
  if (!wsId) return null;
  const found = await pool.query(
    'SELECT id, name, access_code, manager_worker_id, wall_types_pack, floor_count, extra_locations FROM my_drawings_project WHERE workspace_id = $1 ORDER BY id ASC LIMIT 1',
    [wsId]
  );
  if (found.rows[0]) return found.rows[0];
  const ws = await pool.query('SELECT name, access_code FROM my_drawings_workspace WHERE id = $1', [wsId]);
  const name = (ws.rows[0] && ws.rows[0].name) || DEFAULT_PROJECT_NAME;
  const inserted = await pool.query(
    `INSERT INTO my_drawings_project (workspace_id, name, access_code, wall_types_pack)
     VALUES ($1, $2, $3, '{}'::jsonb)
     RETURNING id, name, access_code, manager_worker_id, wall_types_pack, floor_count, extra_locations`,
    [wsId, name, (ws.rows[0] && ws.rows[0].access_code) || null]
  );
  return inserted.rows[0];
}

async function seedDefaultProjects() {
  const workspaces = await pool.query('SELECT id, name FROM my_drawings_workspace ORDER BY id ASC');
  for (const ws of workspaces.rows) {
    const project = await getDefaultProject(ws.id);
    if (!project) continue;
    await pool.query(
      `UPDATE my_drawings_item SET project_id = $1 WHERE workspace_id = $2 AND project_id IS NULL`,
      [project.id, ws.id]
    );
  }
}

async function migrateStoredDrawingsToTenantDirs() {
  const items = await pool.query(
    `SELECT id, workspace_id, project_id, relative_path, stored_filename
     FROM my_drawings_item
     WHERE relative_path IS NOT NULL`
  );
  for (const row of items.rows) {
    const projectId = positiveInt(row.project_id);
    if (!projectId) continue;
    const expectedPrefix = `mydrawings/${row.workspace_id}/${projectId}/`;
    if (String(normalizeStoredRel(row.relative_path)).startsWith(expectedPrefix) && isFile(absFromRelative(row.relative_path))) {
      continue;
    }
    const abs = locateStoredDrawingFile(row);
    if (!abs) continue;
    const destDir = ensureTenantUploadDir(row.workspace_id, projectId);
    const destName = row.stored_filename || path.basename(abs);
    const destAbs = path.join(destDir, destName);
    if (path.resolve(abs) === path.resolve(destAbs)) {
      const rel = relativeFromAbs(destAbs);
      if (rel && rel !== normalizeStoredRel(row.relative_path)) {
        await pool.query(
          'UPDATE my_drawings_item SET relative_path = $1, stored_filename = $2 WHERE id = $3',
          [rel, destName, row.id]
        );
      }
      continue;
    }
    const keepSource = isUnderDir(abs, hgDrawingsDir()) || !isUnderDir(abs, UPLOAD_DIR);
    try {
      if (keepSource) {
        if (!isFile(destAbs)) fs.copyFileSync(abs, destAbs);
      } else {
        try {
          fs.renameSync(abs, destAbs);
        } catch (_) {
          fs.copyFileSync(abs, destAbs);
          fs.unlinkSync(abs);
        }
      }
    } catch (err) {
      console.warn('myDrawings migrate file failed:', abs, err.message || err);
      continue;
    }
    if (!isFile(destAbs)) continue;
    await pool.query(
      'UPDATE my_drawings_item SET relative_path = $1, stored_filename = $2 WHERE id = $3',
      [relativeFromAbs(destAbs), destName, row.id]
    );
  }
}

async function restoreMissingDrawingsFromHg() {
  const hgDir = hgDrawingsDir();
  let hgOk = false;
  try { hgOk = fs.existsSync(hgDir); } catch (_) {}
  if (!hgOk) return;
  const items = await pool.query(
    `SELECT id, number, workspace_id, project_id, relative_path, stored_filename
     FROM my_drawings_item`
  );
  let restored = 0;
  for (const row of items.rows) {
    if (locateStoredDrawingFile(row)) continue;
    const number = String(row.number || '').trim();
    if (number.length < 4) continue;
    const found = findFileContaining(hgDir, number, 2);
    if (!isFile(found)) continue;
    const dest = copyDrawingIntoTenant(row, found);
    if (!isFile(dest) || isUnderDir(dest, hgDir)) continue;
    await healDrawingPath(row, dest);
    restored += 1;
  }
  if (restored) {
    console.warn('myDrawings restored', restored, 'missing PDF(s) from HG Drawings');
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

async function resolveWorkspaceByPin(pin, email) {
  await ensureSchema();
  const cleaned = cleanEmail(email);
  const result = EMAIL_RE.test(cleaned)
    ? await pool.query(
      'SELECT id, name, admin_pin_hash FROM my_drawings_workspace WHERE LOWER(email) = $1',
      [cleaned]
    )
    : await pool.query(
      'SELECT id, name, admin_pin_hash FROM my_drawings_workspace ORDER BY id ASC'
    );
  for (const row of result.rows) {
    if (row.admin_pin_hash && (await bcrypt.compare(pin, row.admin_pin_hash))) {
      return { workspace: { id: row.id, name: row.name }, role: 'admin' };
    }
  }
  return null;
}

async function resolveAdminToken(token) {
  const raw = String(token || '').trim();
  if (!raw || raw.length < 16) return null;
  await ensureSchema();
  const hash = tokenSha(raw);
  const result = await pool.query(
    `SELECT s.id AS session_id, ws.id AS workspace_id, ws.name AS workspace_name,
            ws.access_code, ws.manager_name, ws.email
     FROM my_drawings_admin_session s
     JOIN my_drawings_workspace ws ON ws.id = s.workspace_id
     WHERE s.token_hash = $1
       AND (s.expires_at IS NULL OR s.expires_at > NOW())`,
    [hash]
  );
  const row = result.rows[0];
  if (!row) return null;
  pool.query('UPDATE my_drawings_admin_session SET last_seen_at = NOW() WHERE id = $1', [row.session_id]).catch(() => {});
  return {
    workspace: { id: row.workspace_id, name: row.workspace_name, managerName: row.manager_name || '' },
    role: 'admin',
    company: {
      accessCode: row.access_code || '',
      managerName: row.manager_name || '',
      email: row.email || '',
    },
  };
}

async function resolveJwtAuth(token) {
  const claims = verifyMyDrawingsJwt(token);
  if (!claims) return null;
  await ensureSchema();
  const result = await pool.query(
    `SELECT w.id AS worker_id, w.first_name, w.last_name, w.email, w.workspace_id, w.project_id,
            w.access_suspended_until, w.is_admin, ws.name AS workspace_name, ws.manager_name
     FROM my_drawings_worker w
     JOIN my_drawings_workspace ws ON ws.id = w.workspace_id
     WHERE w.id = $1 AND w.workspace_id = $2`,
    [claims.workerId, claims.companyId]
  );
  const row = result.rows[0];
  if (!row) return null;
  const blockedUntil = suspendedUntil(row);
  if (blockedUntil) {
    return { blocked: true, until: blockedUntil, message: accessClosedMessage(blockedUntil) };
  }
  const siteId = row.project_id || claims.projectId;
  const claimed = await pool.query(
    'SELECT id, name, access_code FROM my_drawings_project WHERE id = $1 AND workspace_id = $2',
    [siteId, row.workspace_id]
  );
  const project = claimed.rows[0] || (await getDefaultProject(row.workspace_id));
  if (!project) return null;
  return {
    workspace: { id: row.workspace_id, name: row.workspace_name, managerName: row.manager_name || '' },
    role: row.is_admin ? 'site_manager' : 'worker',
    worker: {
      id: row.worker_id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      projectId: project.id,
    },
    project: { id: project.id, name: project.name },
  };
}

async function issueWorkerSession(workspace, worker) {
  throwIfSuspended(worker);
  const projectId = positiveInt(worker.project_id) || positiveInt(worker.projectId);
  const project = (projectId
    ? (await pool.query(
      'SELECT id, name, access_code FROM my_drawings_project WHERE id = $1 AND workspace_id = $2',
      [projectId, workspace.id]
    )).rows[0]
    : null) || (await getDefaultProject(workspace.id));
  if (!project) {
    const err = new Error('Site is missing.');
    err.code = 'PROJECT_MISSING';
    throw err;
  }
  const role = worker.is_admin ? 'site_manager' : 'worker';
  const opened = await openWorkerDevice(workspace, worker, project, role);
  let token = null;
  try {
    token = signMyDrawingsJwt({
      workerId: worker.id,
      companyId: workspace.id,
      projectId: project.id,
      email: worker.email,
      role,
    });
  } catch (err) {
    if (err && err.code !== 'JWT_NOT_CONFIGURED') throw err;
    console.warn('My Drawings: MY_DRAWINGS_JWT_SECRET is not set; mobile JWT will not be issued.');
  }
  return {
    ...opened,
    role,
    company: {
      id: workspace.id,
      name: workspace.name,
      managerName: workspace.managerName || workspace.manager_name || '',
    },
    project: {
      id: project.id,
      name: project.name,
      companyId: workspace.id,
    },
    token: token || undefined,
    tokenType: token ? 'Bearer' : undefined,
  };
}

async function findWorkspaceByAccessCode(code) {
  const site = await findSiteByAccessCode(code);
  if (!site) return null;
  return {
    id: site.workspace_id,
    name: site.workspace_name,
    email: site.workspace_email,
    manager_name: site.manager_name,
    access_code: site.access_code,
    site,
  };
}

async function findWorkersByEmail(email) {
  const result = await pool.query(
    `SELECT w.id, w.workspace_id, w.project_id, w.first_name, w.last_name, w.email,
            w.pin_hash, w.pin_expires_at, w.access_suspended_until, w.is_admin,
            ws.name AS workspace_name, ws.manager_name, p.name AS site_name, p.access_code AS site_access_code
     FROM my_drawings_worker w
     JOIN my_drawings_workspace ws ON ws.id = w.workspace_id
     LEFT JOIN my_drawings_project p ON p.id = w.project_id
     WHERE w.email = $1
     ORDER BY (
       SELECT MAX(d.last_seen_at) FROM my_drawings_device d WHERE d.worker_id = w.id
     ) DESC NULLS LAST, w.verified_at DESC NULLS LAST, w.id DESC`,
    [email]
  );
  return result.rows;
}

function pinSha(pin) {
  return crypto.createHash('sha256').update('mydrawings-pin:' + pin).digest('hex');
}

function tokenSha(token) {
  return crypto.createHash('sha256').update('mydrawings-dev:' + token).digest('hex');
}

function resetTokenSha(token) {
  return crypto.createHash('sha256').update('mydrawings-pwreset:' + token).digest('hex');
}

function publicAppUrl() {
  return String(process.env.PUBLIC_APP_URL || process.env.SITE_URL || 'https://proconix.uk').replace(/\/$/, '');
}

function suspendedUntil(row) {
  if (!row) return null;
  const raw = row.access_suspended_until || row.accessSuspendedUntil;
  if (!raw) return null;
  const until = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) return null;
  return until;
}

function formatUntilDate(until) {
  const d = until instanceof Date ? until : new Date(until);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function accessClosedMessage(until) {
  const label = formatUntilDate(until);
  return label
    ? 'Access to My Drawings is closed until ' + label + '.'
    : 'Access to My Drawings is closed.';
}

function accessClosedPayload(until) {
  return {
    success: false,
    code: 'ACCESS_CLOSED',
    accessClosedUntil: until instanceof Date ? until.toISOString() : until,
    message: accessClosedMessage(until),
  };
}

async function revokeWorkerSessions(workerId) {
  await pool.query('DELETE FROM my_drawings_device WHERE worker_id = $1', [workerId]);
  await pool.query(
    `UPDATE my_drawings_worker
     SET pin_hash = NULL, pin_sha = NULL, pin_expires_at = NULL
     WHERE id = $1`,
    [workerId]
  );
  await pool.query('DELETE FROM user_devices WHERE user_id = $1', [workerId]).catch(() => {});
}

function throwIfSuspended(worker) {
  const until = suspendedUntil(worker);
  if (!until) return;
  const err = new Error(accessClosedMessage(until));
  err.code = 'ACCESS_CLOSED';
  err.until = until;
  throw err;
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim().slice(0, 80);
  return String(req.ip || (req.connection && req.connection.remoteAddress) || '').slice(0, 80);
}

function allowRate(key, max, windowMs) {
  const now = Date.now();
  const arr = (registerHits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    registerHits.set(key, arr);
    return false;
  }
  arr.push(now);
  registerHits.set(key, arr);
  return true;
}

function cleanName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 254);
}

const REVIEW_DEMO_EMAIL = 'test@mydrawings.uk';
const REVIEW_DEMO_PIN = '1111';
const REVIEW_DEMO_HOST = '2026AA';

function isReviewDemoEmail(email) {
  return cleanEmail(email) === REVIEW_DEMO_EMAIL;
}

async function setWorkerPin(workerId, pin, days) {
  const sha = pinSha(pin);
  const pinHash = await bcrypt.hash(pin, 10);
  const holdDays = Number.isInteger(days) && days > 0 ? days : 365;
  const workspace = await pool.query(
    'SELECT workspace_id FROM my_drawings_worker WHERE id = $1',
    [workerId]
  );
  const workspaceId = workspace.rows[0] && workspace.rows[0].workspace_id;
  if (workspaceId) {
    await pool.query(
      `UPDATE my_drawings_worker
       SET pin_hash = NULL, pin_sha = NULL, pin_expires_at = NULL
       WHERE workspace_id = $1 AND pin_sha = $2 AND id <> $3`,
      [workspaceId, sha, workerId]
    );
  }
  await pool.query(
    `UPDATE my_drawings_worker
     SET pin_hash = $2, pin_sha = $3, pin_expires_at = NOW() + ($4::int * INTERVAL '1 day')
     WHERE id = $1`,
    [workerId, pinHash, sha, holdDays]
  );
}

async function ensureReviewDemoWorker() {
  const workspace = await findWorkspaceByAccessCode(REVIEW_DEMO_HOST);
  if (!workspace) {
    const err = new Error('Review demo host code is not configured.');
    err.code = 'DEMO_HOST';
    throw err;
  }
  const siteId = workspace.site && workspace.site.id;
  const existing = await pool.query(
    `SELECT id, project_id FROM my_drawings_worker
     WHERE workspace_id = $1 AND LOWER(email) = $2
     LIMIT 1`,
    [workspace.id, REVIEW_DEMO_EMAIL]
  );
  let workerId = existing.rows[0] && existing.rows[0].id;
  if (!workerId) {
    const inserted = await pool.query(
      `INSERT INTO my_drawings_worker
        (workspace_id, project_id, first_name, last_name, email, verified_at, is_admin)
       VALUES ($1, $2, 'Apple', 'Review', $3, NOW(), false)
       RETURNING id`,
      [workspace.id, siteId || null, REVIEW_DEMO_EMAIL]
    );
    workerId = inserted.rows[0].id;
  } else if (siteId && !existing.rows[0].project_id) {
    await pool.query('UPDATE my_drawings_worker SET project_id = $2 WHERE id = $1', [workerId, siteId]);
  }
  await setWorkerPin(workerId, REVIEW_DEMO_PIN, 365);
  const rows = await findWorkersByEmail(REVIEW_DEMO_EMAIL);
  const match = rows.find((row) => Number(row.id) === Number(workerId));
  return match || rows[0];
}

function reviewDemoMessage() {
  return {
    success: true,
    email: REVIEW_DEMO_EMAIL,
    message: 'Enter the 4-digit demo key 1111.',
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function issueUniquePin(workspaceId) {
  for (let i = 0; i < 40; i++) {
    const pin = String(crypto.randomInt(0, 10000)).padStart(4, '0');
    if (RESERVED_PINS.has(pin)) continue;
    const sha = pinSha(pin);
    const clash = await pool.query(
      'SELECT id FROM my_drawings_worker WHERE workspace_id = $1 AND pin_sha = $2',
      [workspaceId, sha]
    );
    if (!clash.rows[0]) return { pin, sha };
  }
  const err = new Error('Could not allocate an access key.');
  err.code = 'PIN_ALLOC';
  throw err;
}

async function emailWorkerPin(worker) {
  const { pin, sha } = await issueUniquePin(worker.workspace_id);
  const pinHash = await bcrypt.hash(pin, 10);
  await pool.query(
    `UPDATE my_drawings_worker
     SET pin_hash = $2, pin_sha = $3, pin_expires_at = NOW() + INTERVAL '24 hours'
     WHERE id = $1`,
    [worker.id, pinHash, sha]
  );
  await sendPasskeyEmail({
    to: worker.email,
    firstName: worker.first_name,
    pin,
  });
}

async function sendPasskeyEmail({ to, firstName, pin }) {
  const from = (process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@proconix.uk').trim();
  const transport = createTransport();
  if (!transport) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[My Drawings] passkey for', to, pin);
      return;
    }
    const err = new Error('Email is not configured on this server.');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }
  const name = firstName ? String(firstName).trim() : 'there';
  const subject = 'Your My Drawings access key';
  const text = [
    `Hi ${name},`,
    '',
    'Your My Drawings access key is:',
    pin,
    '',
    'Enter this 4-digit key on the device you just used. After that, this device stays signed in.',
    'The key expires in 24 hours.',
    '',
    'If you did not request this, you can ignore this email.',
  ].join('\n');
  const html = `
    <p style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;font-size:16px;color:#0f172a;">Hi ${escapeHtml(name)},</p>
    <p style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;font-size:16px;color:#0f172a;">Your My Drawings access key is:</p>
    <p style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:32px;letter-spacing:0.28em;font-weight:700;color:#0f172a;margin:16px 0;">${escapeHtml(pin)}</p>
    <p style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;font-size:14px;color:#475569;">Enter this 4-digit key on the device you just used. After that, this device stays signed in. The key expires in 24 hours.</p>
    <p style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;font-size:13px;color:#64748b;">If you did not request this, you can ignore this email.</p>
  `;
  await transport.sendMail({ from, to, subject, text, html });
}

async function resolveDeviceToken(token) {
  const raw = String(token || '').trim();
  if (!raw || raw.length < 16) return null;
  await ensureSchema();
  const hash = tokenSha(raw);
  const result = await pool.query(
    `SELECT d.id AS device_id,
            w.id AS worker_id, w.first_name, w.last_name, w.email, w.project_id,
            w.access_suspended_until,
            w.is_admin,
            ws.id AS workspace_id, ws.name AS workspace_name, ws.manager_name,
            p.id AS site_id, p.name AS site_name
     FROM my_drawings_device d
     JOIN my_drawings_worker w ON w.id = d.worker_id
     JOIN my_drawings_workspace ws ON ws.id = w.workspace_id
     LEFT JOIN my_drawings_project p ON p.id = w.project_id
     WHERE d.token_hash = $1
       AND (d.expires_at IS NULL OR d.expires_at > NOW())`,
    [hash]
  );
  const row = result.rows[0];
  if (!row) return null;
  const blockedUntil = suspendedUntil(row);
  if (blockedUntil) {
    return { blocked: true, until: blockedUntil, message: accessClosedMessage(blockedUntil) };
  }
  pool.query('UPDATE my_drawings_device SET last_seen_at = NOW() WHERE id = $1', [row.device_id]).catch(() => {});
  const project = row.site_id
    ? { id: row.site_id, name: row.site_name }
    : (await getDefaultProject(row.workspace_id));
  return {
    workspace: { id: row.workspace_id, name: row.workspace_name, managerName: row.manager_name || '' },
    role: row.is_admin ? 'site_manager' : 'worker',
    worker: {
      id: row.worker_id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      projectId: project ? project.id : row.project_id || null,
    },
    project: project ? { id: project.id, name: project.name } : null,
  };
}

async function registerWorker(req, res) {
  try {
    await ensureSchema();
    const firstName = cleanName(req.body && req.body.firstName);
    const lastName = cleanName(req.body && req.body.lastName);
    const email = cleanEmail(req.body && req.body.email);
    const accessCode = normalizeAccessCode(
      (req.body && (req.body.hostAccessCode || req.body.accessCode)) || ''
    );
    if (firstName.length < 1 || lastName.length < 1) {
      return res.status(400).json({ success: false, message: 'First name and last name are required.' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }
    if (!ACCESS_CODE_RE.test(accessCode)) {
      return res.status(400).json({ success: false, message: 'Enter the site access code from your site manager.' });
    }
    if (isReviewDemoEmail(email) && accessCode === REVIEW_DEMO_HOST) {
      const worker = await ensureReviewDemoWorker();
      return res.json({
        ...reviewDemoMessage(),
        companyName: worker.workspace_name,
      });
    }
    if (!allowRate('email:' + email, REGISTER_EMAIL_MAX, REGISTER_WINDOW_MS)
        || !allowRate('ip:' + clientIp(req), REGISTER_IP_MAX, REGISTER_WINDOW_MS)) {
      return res.status(429).json({ success: false, message: 'Too many requests. Try again later.' });
    }
    const asCompany = await pool.query(
      'SELECT id FROM my_drawings_workspace WHERE LOWER(email) = $1',
      [email]
    );
    if (asCompany.rows[0]) {
      return res.status(409).json({
        success: false,
        message: 'This email is a company account. Sign in with your password.',
      });
    }
    const workspace = await findWorkspaceByAccessCode(accessCode);
    if (!workspace) {
      return res.status(404).json({ success: false, message: 'That site access code is not valid.' });
    }
    const siteId = workspace.site && workspace.site.id;
    const existing = await pool.query(
      `SELECT id, first_name, last_name, email, access_suspended_until
       FROM my_drawings_worker WHERE project_id = $1 AND LOWER(email) = LOWER($2)`,
      [siteId, email]
    );
    if (existing.rows[0]) {
      const until = suspendedUntil(existing.rows[0]);
      if (until) {
        return res.status(403).json(accessClosedPayload(until));
      }
      return res.status(409).json({
        success: false,
        message: 'This email is already registered. Sign in instead.',
      });
    }
    const inserted = await pool.query(
      `INSERT INTO my_drawings_worker (workspace_id, project_id, first_name, last_name, email, verified_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, first_name, last_name, email, access_suspended_until, project_id, is_admin`,
      [workspace.id, siteId, firstName, lastName, email]
    );
    const worker = { ...inserted.rows[0], workspace_id: workspace.id };
    await emailWorkerPin(worker);
    return res.json({
      success: true,
      email: worker.email,
      companyName: workspace.name,
      message: 'We sent a 4-digit key to your email.',
    });
  } catch (err) {
    console.error('myDrawings register:', err);
    if (err && err.code === 'ACCESS_CLOSED') {
      return res.status(403).json(accessClosedPayload(err.until));
    }
    if (err && err.code === 'SMTP_NOT_CONFIGURED') {
      return res.status(503).json({ success: false, message: err.message });
    }
    if (err && err.code === 'PIN_ALLOC') {
      return res.status(500).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: 'Could not create your account.' });
  }
}

async function openWorkerDevice(workspace, worker, project, role) {
  const deviceToken = crypto.randomBytes(32).toString('hex');
  const opened = await pool.query(
    `INSERT INTO my_drawings_device (worker_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + ${SESSION_TTL_SQL})
     RETURNING expires_at`,
    [worker.id, tokenSha(deviceToken)]
  );
  await pool.query(
    `UPDATE my_drawings_worker SET verified_at = COALESCE(verified_at, NOW()) WHERE id = $1`,
    [worker.id]
  );
  const catalog = await loadCatalog(workspace, role || 'worker', project);
  const expiresAt = opened.rows[0] && opened.rows[0].expires_at;
  return {
    ...catalog,
    deviceToken,
    firstName: worker.first_name,
    lastName: worker.last_name,
    email: worker.email,
    expiresAt: expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt,
  };
}

async function loginWorker(req, res) {
  try {
    await ensureSchema();
    const email = cleanEmail(req.body && req.body.email);
    const password = String((req.body && req.body.password) || '');
    const accessCode = normalizeAccessCode(
      (req.body && (req.body.hostAccessCode || req.body.accessCode)) || ''
    );
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }
    if (!allowRate('email:' + email, REGISTER_EMAIL_MAX, REGISTER_WINDOW_MS)
        || !allowRate('ip:' + clientIp(req), REGISTER_IP_MAX, REGISTER_WINDOW_MS)) {
      return res.status(429).json({ success: false, message: 'Too many requests. Try again later.' });
    }
    if (!accessCode) {
      const manager = await pool.query(
        `SELECT id, name, email, password_hash, manager_name, access_code, project_mode, logo_path
         FROM my_drawings_workspace
         WHERE LOWER(email) = $1`,
        [email]
      );
      const row = manager.rows[0];
      if (row) {
        if (!password) {
          return res.json({
            success: true,
            kind: 'manager',
            needsPassword: true,
            message: 'Enter your company password.',
          });
        }
        if (!row.password_hash || !(await bcrypt.compare(password, row.password_hash))) {
          return res.status(401).json({ success: false, message: 'Incorrect company email or password.' });
        }
        return res.json({ ...(await issueAdminSession(row)), kind: 'manager' });
      }
    }
    if (isReviewDemoEmail(email)) {
      if (accessCode && accessCode !== REVIEW_DEMO_HOST) {
        return res.status(404).json({ success: false, message: 'That site access code is not valid.' });
      }
      const worker = await ensureReviewDemoWorker();
      return res.json({
        success: true,
        kind: 'worker',
        needsPin: true,
        email: worker.email,
        ...reviewDemoMessage(),
      });
    }
    let rows = await findWorkersByEmail(email);
    if (accessCode) {
      const workspace = await findWorkspaceByAccessCode(accessCode);
      if (!workspace) {
        return res.status(404).json({ success: false, message: 'That site access code is not valid.' });
      }
      rows = rows.filter((row) => Number(row.project_id || 0) === Number(workspace.site && workspace.site.id)
        || Number(row.workspace_id) === Number(workspace.id));
      if (workspace.site) {
        rows = rows.filter((row) => !row.project_id || Number(row.project_id) === Number(workspace.site.id));
      }
    }
    rows = rows.filter((row) => !suspendedUntil(row));
    if (!rows.length) {
      const closed = (await findWorkersByEmail(email)).find((row) => suspendedUntil(row));
      if (closed) {
        return res.status(403).json(accessClosedPayload(suspendedUntil(closed)));
      }
      return res.status(404).json({ success: false, message: 'No account found for that email.' });
    }
    if (rows.length > 1 && !accessCode) {
      return res.json({
        success: true,
        kind: 'worker',
        needsAccessCode: true,
        message: 'Enter the site access code for the site you want to open.',
      });
    }
    const worker = rows[0];
    await emailWorkerPin(worker);
    return res.json({
      success: true,
      kind: 'worker',
      needsPin: true,
      email: worker.email,
      companyName: worker.workspace_name,
      message: 'We sent a 4-digit key to your email.',
    });
  } catch (err) {
    console.error('myDrawings login:', err);
    if (err && err.code === 'ACCESS_CLOSED') {
      return res.status(403).json(accessClosedPayload(err.until));
    }
    if (err && err.code === 'SMTP_NOT_CONFIGURED') {
      return res.status(503).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: 'Could not sign in.' });
  }
}

async function verifyWorker(req, res) {
  try {
    await ensureSchema();
    const email = cleanEmail(req.body && req.body.email);
    const pin = String((req.body && req.body.pin) || '').trim();
    const accessCode = normalizeAccessCode(
      (req.body && (req.body.hostAccessCode || req.body.accessCode)) || ''
    );
    if (!EMAIL_RE.test(email) || !/^\d{4}$/.test(pin)) {
      return res.status(401).json({ success: false, message: 'Incorrect access key' });
    }
    if (isReviewDemoEmail(email) && pin === REVIEW_DEMO_PIN) {
      const demo = await ensureReviewDemoWorker();
      const workspace = {
        id: demo.workspace_id,
        name: demo.workspace_name,
        managerName: demo.manager_name || '',
      };
      return res.json(await issueWorkerSession(workspace, demo));
    }
    let rows = await findWorkersByEmail(email);
    if (accessCode) {
      const workspace = await findWorkspaceByAccessCode(accessCode);
      if (workspace) {
        const siteId = workspace.site && workspace.site.id;
        rows = rows.filter((row) => Number(row.project_id || 0) === Number(siteId)
          || (!row.project_id && Number(row.workspace_id) === Number(workspace.id)));
      }
    }
    if (rows.length > 1) {
      return res.status(400).json({
        success: false,
        message: 'Enter the site access code for the site you want to open.',
      });
    }
    const worker = rows[0];
    if (!worker || !worker.pin_hash) {
      return res.status(401).json({ success: false, message: 'Incorrect access key' });
    }
    const until = suspendedUntil(worker);
    if (until) {
      return res.status(403).json(accessClosedPayload(until));
    }
    if (worker.pin_expires_at && new Date(worker.pin_expires_at).getTime() < Date.now()) {
      return res.status(401).json({ success: false, message: 'That key has expired. Request a new one.' });
    }
    const ok = await bcrypt.compare(pin, worker.pin_hash);
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Incorrect access key' });
    }
    await pool.query(
      `UPDATE my_drawings_worker
       SET pin_hash = NULL, pin_sha = NULL, pin_expires_at = NULL
       WHERE id = $1`,
      [worker.id]
    );
    const workspace = {
      id: worker.workspace_id,
      name: worker.workspace_name,
      managerName: worker.manager_name || '',
    };
    return res.json(await issueWorkerSession(workspace, worker));
  } catch (err) {
    console.error('myDrawings verify:', err);
    if (err && err.code === 'ACCESS_CLOSED') {
      return res.status(403).json(accessClosedPayload(err.until));
    }
    return res.status(500).json({ success: false, message: 'Could not verify access key.' });
  }
}

async function requestAuthCode(req, res) {
  try {
    await ensureSchema();
    const email = cleanEmail(req.body && req.body.email);
    const accessCode = normalizeAccessCode(
      (req.body && (req.body.hostAccessCode || req.body.accessCode)) || ''
    );
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }
    if (isReviewDemoEmail(email)) {
      if (accessCode && accessCode !== REVIEW_DEMO_HOST) {
        return res.status(404).json({ success: false, message: 'That site access code is not valid.' });
      }
      const worker = await ensureReviewDemoWorker();
      return res.json({
        ...reviewDemoMessage(),
        companyName: worker.workspace_name,
      });
    }
    if (!allowRate('email:' + email, REGISTER_EMAIL_MAX, REGISTER_WINDOW_MS)
        || !allowRate('ip:' + clientIp(req), REGISTER_IP_MAX, REGISTER_WINDOW_MS)) {
      return res.status(429).json({ success: false, message: 'Too many requests. Try again later.' });
    }
    let rows = await findWorkersByEmail(email);
    if (accessCode) {
      const workspace = await findWorkspaceByAccessCode(accessCode);
      if (!workspace) {
        return res.status(404).json({ success: false, message: 'That site access code is not valid.' });
      }
      const siteId = workspace.site && workspace.site.id;
      rows = rows.filter((row) => Number(row.project_id || 0) === Number(siteId)
        || (!row.project_id && Number(row.workspace_id) === Number(workspace.id)));
    }
    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: 'No account found for that email. Create an account with the site access code first.',
      });
    }
    if (rows.length > 1) {
      return res.status(400).json({
        success: false,
        message: 'Enter the site access code for the site you want to open.',
      });
    }
    const worker = rows[0];
    const until = suspendedUntil(worker);
    if (until) {
      return res.status(403).json(accessClosedPayload(until));
    }
    await emailWorkerPin(worker);
    return res.json({
      success: true,
      email: worker.email,
      companyName: worker.workspace_name,
      message: 'We sent a 4-digit key to your email.',
    });
  } catch (err) {
    console.error('myDrawings requestAuthCode:', err);
    if (err && err.code === 'SMTP_NOT_CONFIGURED') {
      return res.status(503).json({ success: false, message: err.message });
    }
    if (err && err.code === 'PIN_ALLOC') {
      return res.status(500).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: 'Could not send your access key.' });
  }
}

async function loadCatalog(workspace, role, site) {
  const workspaceId = workspace.id;
  const project = site && site.id
    ? site
    : await getDefaultProject(workspaceId);
  const projectId = project && project.id;
  const cats = await pool.query(
    `SELECT id, name FROM my_drawings_category
     WHERE workspace_id = $1 AND ($2::int IS NULL OR project_id = $2)
     ORDER BY sort_order ASC, name ASC`,
    [workspaceId, projectId || null]
  );
  const items = await pool.query(
    `SELECT i.id, i.number, i.title, i.revision, i.size_bytes, i.updated_at, i.floors, c.name AS category
     FROM my_drawings_item i
     LEFT JOIN my_drawings_category c ON c.id = i.category_id
     WHERE i.workspace_id = $1 AND ($2::int IS NULL OR i.project_id = $2)
     ORDER BY i.number ASC`,
    [workspaceId, projectId || null]
  );
  const allSites = await listWorkspaceSites(workspaceId);
  const sites = role === 'admin'
    ? allSites
    : allSites.filter((s) => !projectId || Number(s.id) === Number(projectId));
  const current = sites.find((s) => Number(s.id) === Number(projectId)) || sites[0] || null;
  const manage = role === 'admin' || role === 'site_manager';
  let accessCode = (project && project.access_code) || (current && current.accessCode) || '';
  if (manage && !accessCode && current) accessCode = current.accessCode || '';
  const wsRow = await pool.query(
    'SELECT project_mode, manager_name FROM my_drawings_workspace WHERE id = $1',
    [workspaceId]
  );
  const projectMode = wsRow.rows[0] && wsRow.rows[0].project_mode === 'multi' ? 'multi' : 'single';
  const drawings = items.rows.map((d) => ({
    id: String(d.id),
    number: d.number,
    title: d.title,
    category: d.category || 'Uncategorised',
    revision: d.revision,
    floors: floorsForClient(d.floors),
    updatedAt: isoDate(d.updated_at),
    sizeBytes: Number(d.size_bytes) || 0,
    fileUrl: `/api/my-drawings/drawings/${d.id}/file`,
  }));
  const locations = (current && current.locations) || locationsFromProject(current || project);
  return {
    success: true,
    role: role || 'worker',
    canManage: manage,
    projectMode,
    siteCount: sites.length,
    company: {
      id: workspace.id,
      name: workspace.name,
      managerName: workspace.managerName || workspace.manager_name || (wsRow.rows[0] && wsRow.rows[0].manager_name) || '',
    },
    site: current
      ? {
        id: current.id,
        name: current.name,
        accessCode: manage ? (current.accessCode || '') : undefined,
        managerName: current.managerName || '',
        drawingCount: current.drawingCount,
        workerCount: current.workerCount,
        floorCount: current.floorCount,
        extraLocations: current.extraLocations || [],
        locations: current.locations || locations,
      }
      : null,
    sites: manage ? sites : undefined,
    project: {
      id: projectId,
      name: (current && current.name) || (project && project.name) || workspace.name,
      companyId: workspace.id,
      projectId,
    },
    accessCode: manage ? accessCode : undefined,
    locations,
    occupiedLocations: occupiedLocations(drawings, locations),
    categories: cats.rows.map((r) => r.name),
    drawings,
  };
}

async function catalogResponse(req, res) {
  const payload = await loadCatalog(req.myDrawings.workspace, req.myDrawings.role, req.myDrawings.project);
  const worker = req.myDrawings && req.myDrawings.worker;
  if (worker) {
    payload.firstName = worker.firstName || worker.first_name || '';
    payload.lastName = worker.lastName || worker.last_name || '';
  } else if (req.myDrawings && req.myDrawings.role === 'admin') {
    const companyName = (payload.company && payload.company.managerName) || '';
    const parts = String(companyName).trim().split(/\s+/).filter(Boolean);
    payload.firstName = parts[0] || '';
    payload.lastName = parts.slice(1).join(' ');
  }
  return res.json(payload);
}

function actorName(req) {
  const worker = req.myDrawings && req.myDrawings.worker;
  const name = [worker && worker.firstName, worker && worker.lastName].filter(Boolean).join(' ').trim();
  return name || 'Administrator';
}

async function logActivity(req, action, title, number) {
  try {
    await pool.query(
      `INSERT INTO my_drawings_activity (workspace_id, project_id, actor_name, action, drawing_title, drawing_number)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.myDrawings.workspace.id,
        currentSiteId(req.myDrawings),
        actorName(req),
        action,
        title ? String(title).slice(0, 200) : '',
        number ? String(number).slice(0, 40) : '',
      ]
    );
  } catch (err) {
    console.error('myDrawings activity:', err);
  }
}

async function getActivity(req, res) {
  try {
    const rows = await pool.query(
      `SELECT actor_name, action, drawing_title, drawing_number, created_at
       FROM my_drawings_activity
       WHERE workspace_id = $1 AND ($2::int IS NULL OR project_id = $2)
       ORDER BY created_at DESC, id DESC
       LIMIT 200`,
      [req.myDrawings.workspace.id, currentSiteId(req.myDrawings)]
    );
    return res.json({
      success: true,
      activity: rows.rows.map((r) => ({
        actorName: r.actor_name,
        action: r.action,
        drawingTitle: r.drawing_title || '',
        drawingNumber: r.drawing_number || '',
        at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      })),
    });
  } catch (err) {
    console.error('myDrawings getActivity:', err);
    return res.status(500).json({ success: false, message: 'Could not load activity.' });
  }
}

async function listWorkers(req, res) {
  try {
    await ensureSchema();
    const workspaceId = req.myDrawings.workspace.id;
    const projectId = currentSiteId(req.myDrawings);
    const rows = await pool.query(
      `SELECT w.id, w.first_name, w.last_name, w.email, w.verified_at, w.created_at,
              w.access_suspended_until, w.is_admin,
              (SELECT COUNT(*)::int FROM my_drawings_device d WHERE d.worker_id = w.id) AS device_count,
              (SELECT MAX(d.last_seen_at) FROM my_drawings_device d WHERE d.worker_id = w.id) AS last_seen_at
       FROM my_drawings_worker w
       WHERE w.workspace_id = $1 AND ($2::int IS NULL OR w.project_id = $2)
       ORDER BY w.last_name ASC, w.first_name ASC, w.id ASC`,
      [workspaceId, projectId]
    );
    return res.json({
      success: true,
      workers: rows.rows.map((r) => {
        const until = suspendedUntil(r);
        return {
          id: r.id,
          firstName: r.first_name,
          lastName: r.last_name,
          email: r.email,
          verifiedAt: r.verified_at instanceof Date ? r.verified_at.toISOString() : r.verified_at,
          createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
          deviceCount: r.device_count || 0,
          lastSeenAt: r.last_seen_at instanceof Date ? r.last_seen_at.toISOString() : r.last_seen_at,
          accessSuspendedUntil: until ? until.toISOString() : null,
          accessClosed: !!until,
          isAdmin: !!r.is_admin,
          isSiteManager: !!r.is_admin,
        };
      }),
    });
  } catch (err) {
    console.error('myDrawings listWorkers:', err);
    return res.status(500).json({ success: false, message: 'Could not load users.' });
  }
}

async function findCompanyWorker(workspaceId, workerId, projectId) {
  const id = parseInt(workerId, 10);
  if (!Number.isInteger(id) || id < 1) return null;
  const found = await pool.query(
    `SELECT id, first_name, last_name, email, access_suspended_until, is_admin, project_id
     FROM my_drawings_worker
     WHERE id = $1 AND workspace_id = $2 AND ($3::int IS NULL OR project_id = $3)`,
    [id, workspaceId, projectId || null]
  );
  return found.rows[0] || null;
}

async function suspendWorker(req, res) {
  try {
    await ensureSchema();
    const workspaceId = req.myDrawings.workspace.id;
    const worker = await findCompanyWorker(workspaceId, req.params.id, currentSiteId(req.myDrawings));
    if (!worker) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const days = parseInt(req.body && req.body.days, 10);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return res.status(400).json({ success: false, message: 'Select between 1 and 365 days.' });
    }
    const updated = await pool.query(
      `UPDATE my_drawings_worker
       SET access_suspended_until = NOW() + ($2::int * INTERVAL '1 day')
       WHERE id = $1
       RETURNING access_suspended_until`,
      [worker.id, days]
    );
    await revokeWorkerSessions(worker.id);
    const until = updated.rows[0] && updated.rows[0].access_suspended_until;
    return res.json({
      success: true,
      message: 'Access closed until ' + formatUntilDate(until) + '.',
      days,
      accessSuspendedUntil: until instanceof Date ? until.toISOString() : until,
    });
  } catch (err) {
    console.error('myDrawings suspendWorker:', err);
    return res.status(500).json({ success: false, message: 'Could not close access.' });
  }
}

async function restoreWorker(req, res) {
  try {
    await ensureSchema();
    const workspaceId = req.myDrawings.workspace.id;
    const worker = await findCompanyWorker(workspaceId, req.params.id, currentSiteId(req.myDrawings));
    if (!worker) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    await pool.query(
      'UPDATE my_drawings_worker SET access_suspended_until = NULL WHERE id = $1',
      [worker.id]
    );
    return res.json({ success: true, message: 'Access restored.' });
  } catch (err) {
    console.error('myDrawings restoreWorker:', err);
    return res.status(500).json({ success: false, message: 'Could not restore access.' });
  }
}

async function deleteMyAccount(req, res) {
  try {
    await ensureSchema();
    const worker = req.myDrawings && req.myDrawings.worker;
    const workspace = req.myDrawings && req.myDrawings.workspace;
    const workerId = worker && worker.id;
    const workspaceId = workspace && workspace.id;
    if (!workerId || !workspaceId) {
      return res.status(400).json({ success: false, message: 'No worker account on this session.' });
    }
    await revokeWorkerSessions(workerId);
    await pool.query(
      'DELETE FROM my_drawings_worker WHERE id = $1 AND workspace_id = $2',
      [workerId, workspaceId]
    );
    return res.json({ success: true, message: 'Your account has been deleted.' });
  } catch (err) {
    console.error('myDrawings deleteMyAccount:', err);
    return res.status(500).json({ success: false, message: 'Could not delete your account.' });
  }
}

async function deleteWorker(req, res) {
  try {
    await ensureSchema();
    const workspaceId = req.myDrawings.workspace.id;
    const worker = await findCompanyWorker(workspaceId, req.params.id, currentSiteId(req.myDrawings));
    if (!worker) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    await revokeWorkerSessions(worker.id);
    await pool.query(
      'DELETE FROM my_drawings_worker WHERE id = $1 AND workspace_id = $2',
      [worker.id, workspaceId]
    );
    return res.json({ success: true, message: 'User deleted.' });
  } catch (err) {
    console.error('myDrawings deleteWorker:', err);
    return res.status(500).json({ success: false, message: 'Could not delete user.' });
  }
}

async function makeWorkerAdmin(req, res) {
  try {
    await ensureSchema();
    if (!canManageSite(req.myDrawings)) {
      return res.status(403).json({ success: false, message: 'Site manager or company access is required.' });
    }
    const workspaceId = req.myDrawings.workspace.id;
    const worker = await findCompanyWorker(workspaceId, req.params.id, currentSiteId(req.myDrawings));
    if (!worker) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    await pool.query(
      `UPDATE my_drawings_worker
       SET is_admin = TRUE, access_suspended_until = NULL
       WHERE id = $1`,
      [worker.id]
    );
    const siteId = currentSiteId(req.myDrawings);
    if (siteId) {
      await pool.query(
        'UPDATE my_drawings_worker SET is_admin = FALSE WHERE project_id = $1 AND id <> $2',
        [siteId, worker.id]
      );
      await pool.query(
        'UPDATE my_drawings_project SET manager_worker_id = $2 WHERE id = $1',
        [siteId, worker.id]
      );
    }
    return res.json({ success: true, message: 'This user is now the site manager.', isAdmin: true, isSiteManager: true });
  } catch (err) {
    console.error('myDrawings makeWorkerAdmin:', err);
    return res.status(500).json({ success: false, message: 'Could not make this user an administrator.' });
  }
}

async function removeWorkerAdmin(req, res) {
  try {
    await ensureSchema();
    if (!canManageSite(req.myDrawings)) {
      return res.status(403).json({ success: false, message: 'Site manager or company access is required.' });
    }
    const workspaceId = req.myDrawings.workspace.id;
    const worker = await findCompanyWorker(workspaceId, req.params.id, currentSiteId(req.myDrawings));
    if (!worker) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    await pool.query(
      'UPDATE my_drawings_worker SET is_admin = FALSE WHERE id = $1',
      [worker.id]
    );
    const siteId = currentSiteId(req.myDrawings);
    if (siteId) {
      await pool.query(
        'UPDATE my_drawings_project SET manager_worker_id = NULL WHERE id = $1 AND manager_worker_id = $2',
        [siteId, worker.id]
      );
    }
    return res.json({ success: true, message: 'Site manager access removed.', isAdmin: false, isSiteManager: false });
  } catch (err) {
    console.error('myDrawings removeWorkerAdmin:', err);
    return res.status(500).json({ success: false, message: 'Could not remove administrator access.' });
  }
}

async function updateAccessCode(req, res) {
  try {
    await ensureSchema();
    const workspaceId = req.myDrawings.workspace.id;
    const siteId = currentSiteId(req.myDrawings);
    if (!siteId) {
      return res.status(400).json({ success: false, message: 'Select a site first.' });
    }
    const generate = !!(req.body && (req.body.generate === true || req.body.generate === 'true'));
    let code = generate ? await allocateAccessCode(workspaceId, siteId) : normalizeAccessCode(req.body && req.body.accessCode);
    if (!ACCESS_CODE_RE.test(code)) {
      return res.status(400).json({
        success: false,
        message: 'Access code must be 6 to 10 letters or numbers.',
      });
    }
    if (await accessCodeTaken(code, workspaceId, siteId)) {
      return res.status(409).json({
        success: false,
        message: 'That access code is already in use. Choose another.',
      });
    }
    await pool.query(
      'UPDATE my_drawings_project SET access_code = $2 WHERE id = $1 AND workspace_id = $3',
      [siteId, code, workspaceId]
    );
    const only = await pool.query(
      'SELECT COUNT(*)::int AS n FROM my_drawings_project WHERE workspace_id = $1',
      [workspaceId]
    );
    if (only.rows[0] && only.rows[0].n === 1) {
      await pool.query('UPDATE my_drawings_workspace SET access_code = $2 WHERE id = $1', [workspaceId, code]);
    }
    return res.json({
      success: true,
      accessCode: code,
      message: generate ? 'A new access code was generated.' : 'Access code updated.',
    });
  } catch (err) {
    console.error('myDrawings updateAccessCode:', err);
    if (err && err.code === 'ACCESS_CODE_ALLOC') {
      return res.status(500).json({ success: false, message: err.message });
    }
    if (err && err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'That access code is already in use. Choose another.',
      });
    }
    return res.status(500).json({ success: false, message: 'Could not update the access code.' });
  }
}

function publicLogoUrl(logoPath) {
  if (!logoPath) return '';
  return '/uploads/' + String(logoPath).split(path.sep).join('/');
}

function saveCompanyLogo(workspaceId, file) {
  if (!file || !file.buffer || !file.buffer.length) return '';
  const ext = LOGO_TYPES[file.mimetype] || (String(file.originalname || '').toLowerCase().match(/\.(jpe?g|png|webp|gif)$/) || [])[0] || '.png';
  const dir = path.join(BRANDING_DIR, String(workspaceId));
  fs.mkdirSync(dir, { recursive: true });
  const filename = 'logo' + (ext.startsWith('.') ? ext : '.' + ext);
  fs.writeFileSync(path.join(dir, filename), file.buffer);
  return path.posix.join('mydrawings-branding', String(workspaceId), filename);
}

async function issueAdminSession(row, managerName) {
  const adminToken = crypto.randomBytes(32).toString('hex');
  const opened = await pool.query(
    `INSERT INTO my_drawings_admin_session (workspace_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + ${ADMIN_TTL_SQL})
     RETURNING expires_at`,
    [row.id, tokenSha(adminToken)]
  );
  const displayName = managerName || row.manager_name || '';
  const catalog = await loadCatalog(
    { id: row.id, name: row.name, access_code: row.access_code, managerName: displayName },
    'admin'
  );
  const expiresAt = opened.rows[0] && opened.rows[0].expires_at;
  return {
    ...catalog,
    adminToken,
    accessCode: catalog.accessCode || row.access_code || '',
    managerName: displayName,
    email: row.email || '',
    projectMode: row.project_mode === 'multi' ? 'multi' : 'single',
    logoUrl: publicLogoUrl(row.logo_path),
    expiresAt: expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt,
  };
}

async function lookupAuth(req, res) {
  try {
    await ensureSchema();
    const email = cleanEmail(req.body && req.body.email);
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }
    if (!allowRate('lookup:' + email, REGISTER_EMAIL_MAX, REGISTER_WINDOW_MS)
        || !allowRate('ip:' + clientIp(req), REGISTER_IP_MAX, REGISTER_WINDOW_MS)) {
      return res.status(429).json({ success: false, message: 'Too many requests. Try again later.' });
    }
    const manager = await pool.query(
      'SELECT id FROM my_drawings_workspace WHERE LOWER(email) = $1',
      [email]
    );
    if (manager.rows[0]) {
      return res.json({ success: true, kind: 'manager', needsPassword: true, needsAccessCode: false });
    }
    const workers = await findWorkersByEmail(email);
    const open = workers.filter((row) => !suspendedUntil(row));
    if (!open.length && workers.length) {
      return res.status(403).json(accessClosedPayload(suspendedUntil(workers[0])));
    }
    if (!open.length) {
      return res.json({ success: true, kind: 'none', needsPassword: false, needsAccessCode: false });
    }
    if (open.length > 1) {
      return res.json({ success: true, kind: 'worker', needsPassword: false, needsAccessCode: true });
    }
    return res.json({ success: true, kind: 'worker', needsPassword: false, needsAccessCode: false, needsPin: true });
  } catch (err) {
    console.error('myDrawings lookupAuth:', err);
    return res.status(500).json({ success: false, message: 'Could not check that email.' });
  }
}

async function startCompany(req, res) {
  try {
    await ensureSchema();
    const email = cleanEmail(req.body && req.body.email);
    const password = String((req.body && req.body.password) || '');
    const passwordRepeat = String((req.body && (req.body.passwordRepeat || req.body.repeatPassword)) || '');
    const companyName = String((req.body && (req.body.companyName || req.body.name)) || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160);
    const projectMode = String((req.body && req.body.projectMode) || 'single').toLowerCase() === 'multi'
      ? 'multi'
      : 'single';
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }
    if (companyName.length < 2) {
      return res.status(400).json({ success: false, message: 'Enter the company name.' });
    }
    if (password.length < 8 || password.length > 120) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }
    if (password !== passwordRepeat) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }
    if (!allowRate('company-start:' + email, 3, REGISTER_WINDOW_MS)
        || !allowRate('ip:' + clientIp(req), REGISTER_IP_MAX, REGISTER_WINDOW_MS)) {
      return res.status(429).json({ success: false, message: 'Too many requests. Try again later.' });
    }
    const taken = await pool.query(
      'SELECT id FROM my_drawings_workspace WHERE LOWER(email) = $1',
      [email]
    );
    if (taken.rows[0]) {
      return res.status(409).json({
        success: false,
        message: 'A company is already registered with this email. Sign in instead.',
      });
    }
    const accessHash = await dummyPinHash();
    const adminPin = generateAdminPin();
    const adminHash = await bcrypt.hash(adminPin, 10);
    const passwordHash = await bcrypt.hash(password, 10);
    const accessCode = await allocateAccessCode(0);
    const managerName = email.split('@')[0] || companyName;
    const inserted = await pool.query(
      `INSERT INTO my_drawings_workspace
        (name, access_pin_hash, admin_pin_hash, email, password_hash, manager_name, access_code, project_mode, demo_cleared_at, wall_types_pack)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), '{}'::jsonb)
       RETURNING id, name, email, manager_name, access_code, project_mode, logo_path`,
      [companyName, accessHash, adminHash, email, passwordHash, managerName, accessCode, projectMode]
    );
    const row = inserted.rows[0];
    let logoPath = '';
    try {
      logoPath = saveCompanyLogo(row.id, req.file);
      if (logoPath) {
        await pool.query('UPDATE my_drawings_workspace SET logo_path = $2 WHERE id = $1', [row.id, logoPath]);
        row.logo_path = logoPath;
      }
    } catch (logoErr) {
      console.warn('myDrawings company logo:', logoErr && logoErr.message ? logoErr.message : logoErr);
    }
    await getDefaultProject(row.id);
    if (row.project_mode === 'multi') {
      await pool.query(
        `UPDATE my_drawings_workspace SET project_mode = 'multi' WHERE id = $1`,
        [row.id]
      );
    }
    const session = await issueAdminSession(row);
    return res.json({
      ...session,
      success: true,
      adminPin,
      message: 'Company created.',
    });
  } catch (err) {
    console.error('myDrawings startCompany:', err);
    if (err && err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'A company is already registered with this email. Sign in instead.',
      });
    }
    if (err && err.code === 'ACCESS_CODE_ALLOC') {
      return res.status(500).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: 'Could not create the company.' });
  }
}

async function companyLogin(req, res) {
  try {
    await ensureSchema();
    const email = cleanEmail(req.body && req.body.email);
    const password = String((req.body && req.body.password) || '');
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, message: 'Enter the company email.' });
    }
    if (!allowRate('company:' + email, REGISTER_EMAIL_MAX, REGISTER_WINDOW_MS)
        || !allowRate('ip:' + clientIp(req), REGISTER_IP_MAX, REGISTER_WINDOW_MS)) {
      return res.status(429).json({ success: false, message: 'Too many requests. Try again later.' });
    }
    const found = await pool.query(
      `SELECT id, name, email, password_hash, manager_name, access_code, project_mode, logo_path
       FROM my_drawings_workspace
       WHERE LOWER(email) = $1`,
      [email]
    );
    const row = found.rows[0];
    if (!row) {
      const workers = await findWorkersByEmail(email);
      const siteManager = workers.find((w) => w.is_admin && !suspendedUntil(w));
      if (siteManager) {
        return res.status(400).json({
          success: false,
          kind: 'site_manager',
          message: 'Site managers sign in with their own email and 4-digit key. Company email and password are only for the company head.',
        });
      }
      return res.status(401).json({ success: false, message: 'No company account found for that email.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Enter the company password.' });
    }
    if (!row.password_hash || !(await bcrypt.compare(password, row.password_hash))) {
      return res.status(401).json({ success: false, message: 'Incorrect company email or password.' });
    }
    return res.json(await issueAdminSession(row));
  } catch (err) {
    console.error('myDrawings companyLogin:', err);
    return res.status(500).json({ success: false, message: 'Could not sign in as company.' });
  }
}

async function sendCompanyPasswordResetEmail({ to, name, companyName, resetUrl }) {
  const from = (process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@proconix.uk').trim();
  const transport = createTransport();
  if (!transport) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[My Drawings] company password reset for', to, resetUrl);
      return;
    }
    const err = new Error('Email is not configured on this server.');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }
  const who = name ? String(name).trim() : 'there';
  const company = companyName ? String(companyName).trim() : 'your company';
  const subject = 'Reset your My Drawings company password';
  const text = [
    `Hi ${who},`,
    '',
    `We received a request to reset the company password for ${company} on My Drawings.`,
    '',
    'Open this link to choose a new password:',
    resetUrl,
    '',
    'On the next page you will need one site access code (host code) from this company.',
    'The link expires in 2 hours.',
    '',
    'If you did not request this, you can ignore this email. Your password will stay the same.',
  ].join('\n');
  const html = `
    <p style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;font-size:16px;color:#0f172a;">Hi ${escapeHtml(who)},</p>
    <p style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;font-size:16px;color:#0f172a;">We received a request to reset the company password for <strong>${escapeHtml(company)}</strong> on My Drawings.</p>
    <p style="margin:24px 0;">
      <a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 20px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;font-size:15px;font-weight:700;">Reset password</a>
    </p>
    <p style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;font-size:14px;color:#475569;">On the next page you will need one site access code (host code) from this company. The link expires in 2 hours.</p>
    <p style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;font-size:13px;color:#64748b;word-break:break-all;">${escapeHtml(resetUrl)}</p>
    <p style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;font-size:13px;color:#64748b;">If you did not request this, you can ignore this email. Your password will stay the same.</p>
  `;
  await transport.sendMail({
    from,
    to,
    replyTo: (process.env.SUPPORT_REPLY_EMAIL || 'info@proconix.uk').trim() || from,
    subject,
    text,
    html,
  });
}

async function loadValidPasswordReset(token) {
  const raw = String(token || '').trim();
  if (!/^[a-f0-9]{64}$/i.test(raw)) return null;
  const row = await pool.query(
    `SELECT r.id, r.workspace_id, ws.name, ws.email, ws.manager_name
     FROM my_drawings_password_reset r
     JOIN my_drawings_workspace ws ON ws.id = r.workspace_id
     WHERE r.token_hash = $1
       AND r.used_at IS NULL
       AND r.expires_at > NOW()`,
    [resetTokenSha(raw)]
  );
  return row.rows[0] || null;
}

async function accessCodeBelongsToWorkspace(workspaceId, rawCode) {
  const code = normalizeAccessCode(rawCode);
  if (!ACCESS_CODE_RE.test(code)) return false;
  const site = await pool.query(
    `SELECT id FROM my_drawings_project
     WHERE workspace_id = $1 AND UPPER(access_code) = $2`,
    [workspaceId, code]
  );
  if (site.rows[0]) return true;
  const ws = await pool.query(
    `SELECT id FROM my_drawings_workspace
     WHERE id = $1 AND UPPER(access_code) = $2`,
    [workspaceId, code]
  );
  return !!ws.rows[0];
}

async function requestCompanyPasswordReset(req, res) {
  try {
    await ensureSchema();
    const email = cleanEmail(req.body && req.body.email);
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, message: 'Enter the company email.' });
    }
    if (!allowRate('company-forgot:' + email, 3, REGISTER_WINDOW_MS)
        || !allowRate('ip:' + clientIp(req), REGISTER_IP_MAX, REGISTER_WINDOW_MS)) {
      return res.status(429).json({ success: false, message: 'Too many requests. Try again later.' });
    }
    const found = await pool.query(
      `SELECT id, name, email, manager_name FROM my_drawings_workspace WHERE LOWER(email) = $1`,
      [email]
    );
    const generic = {
      success: true,
      message: 'If that email has a company account, we sent a reset link.',
    };
    const row = found.rows[0];
    if (!row) return res.json(generic);
    const token = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `UPDATE my_drawings_password_reset
       SET used_at = NOW()
       WHERE workspace_id = $1 AND used_at IS NULL`,
      [row.id]
    );
    await pool.query(
      `INSERT INTO my_drawings_password_reset (workspace_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '2 hours')`,
      [row.id, resetTokenSha(token)]
    );
    const resetUrl = publicAppUrl() + '/mydrawings/reset-password?token=' + encodeURIComponent(token);
    await sendCompanyPasswordResetEmail({
      to: row.email,
      name: row.manager_name,
      companyName: row.name,
      resetUrl,
    });
    return res.json(generic);
  } catch (err) {
    console.error('myDrawings requestCompanyPasswordReset:', err);
    if (err && err.code === 'SMTP_NOT_CONFIGURED') {
      return res.status(503).json({ success: false, message: 'Could not send the reset email. Try again later.' });
    }
    return res.status(500).json({ success: false, message: 'Could not start password reset.' });
  }
}

async function previewCompanyPasswordReset(req, res) {
  try {
    await ensureSchema();
    const reset = await loadValidPasswordReset(req.query && req.query.token);
    if (!reset) {
      return res.status(400).json({
        success: false,
        message: 'This reset link is invalid or has expired. Request a new one from Company sign in.',
      });
    }
    return res.json({
      success: true,
      companyName: reset.name,
    });
  } catch (err) {
    console.error('myDrawings previewCompanyPasswordReset:', err);
    return res.status(500).json({ success: false, message: 'Could not check the reset link.' });
  }
}

async function resetCompanyPassword(req, res) {
  try {
    await ensureSchema();
    const token = String((req.body && req.body.token) || '').trim();
    const password = String((req.body && req.body.password) || '');
    const passwordRepeat = String((req.body && (req.body.passwordRepeat || req.body.repeatPassword)) || '');
    const accessCode = String((req.body && (req.body.accessCode || req.body.hostAccessCode || req.body.hostCode)) || '');
    if (!allowRate('company-reset:' + clientIp(req), 8, REGISTER_WINDOW_MS)
        || !allowRate('ip:' + clientIp(req), REGISTER_IP_MAX, REGISTER_WINDOW_MS)) {
      return res.status(429).json({ success: false, message: 'Too many requests. Try again later.' });
    }
    const reset = await loadValidPasswordReset(token);
    if (!reset) {
      return res.status(400).json({
        success: false,
        message: 'This reset link is invalid or has expired. Request a new one from Company sign in.',
      });
    }
    if (password.length < 8 || password.length > 120) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }
    if (password !== passwordRepeat) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }
    if (!(await accessCodeBelongsToWorkspace(reset.workspace_id, accessCode))) {
      return res.status(400).json({
        success: false,
        message: 'Enter one site access code (host code) from this company.',
      });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE my_drawings_workspace SET password_hash = $2 WHERE id = $1', [
      reset.workspace_id,
      passwordHash,
    ]);
    await pool.query('UPDATE my_drawings_password_reset SET used_at = NOW() WHERE id = $1', [reset.id]);
    await pool.query('DELETE FROM my_drawings_admin_session WHERE workspace_id = $1', [reset.workspace_id]);
    return res.json({
      success: true,
      message: 'Password updated. Sign in with your new password.',
    });
  } catch (err) {
    console.error('myDrawings resetCompanyPassword:', err);
    return res.status(500).json({ success: false, message: 'Could not reset the password.' });
  }
}

async function unlock(req, res) {
  try {
    await ensureSchema();
    const pin = String((req.body && req.body.pin) || '').trim();
    const email = cleanEmail(req.body && req.body.email);
    if (!/^\d{4}$/.test(pin)) {
      return res.status(401).json({ success: false, message: 'Incorrect access key' });
    }
    const resolved = await resolveWorkspaceByPin(pin, email);
    if (!resolved || resolved.role !== 'admin') {
      return res.status(401).json({ success: false, message: 'Incorrect access key' });
    }
    const found = await pool.query(
      `SELECT id, name, email, manager_name, access_code, project_mode, logo_path
       FROM my_drawings_workspace WHERE id = $1`,
      [resolved.workspace.id]
    );
    if (!found.rows[0]) {
      return res.status(401).json({ success: false, message: 'Incorrect access key' });
    }
    return res.json(await issueAdminSession(found.rows[0]));
  } catch (err) {
    console.error('myDrawings unlock:', err);
    return res.status(500).json({ success: false, message: 'Could not unlock drawings.' });
  }
}

async function logoutSession(req, res) {
  try {
    await ensureSchema();
    const adminToken = String((req.body && req.body.adminToken) || '').trim();
    const deviceToken = String((req.body && req.body.deviceToken) || '').trim();
    if (adminToken) {
      await pool.query('DELETE FROM my_drawings_admin_session WHERE token_hash = $1', [tokenSha(adminToken)]);
    }
    if (deviceToken) {
      await pool.query('DELETE FROM my_drawings_device WHERE token_hash = $1', [tokenSha(deviceToken)]);
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('myDrawings logout:', err);
    return res.status(500).json({ success: false, message: 'Could not sign out.' });
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

async function getOrCreateCategory(workspaceId, name, projectId) {
  const trimmed = String(name || '').trim().slice(0, 80);
  if (!trimmed) return null;
  const found = await pool.query(
    `SELECT id, name FROM my_drawings_category
     WHERE workspace_id = $1 AND LOWER(name) = LOWER($2) AND ($3::int IS NULL OR project_id = $3)`,
    [workspaceId, trimmed, projectId || null]
  );
  if (found.rows[0]) return found.rows[0];
  const inserted = await pool.query(
    `INSERT INTO my_drawings_category (workspace_id, project_id, name, sort_order)
     VALUES ($1, $2, $3, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM my_drawings_category WHERE workspace_id = $1 AND ($2::int IS NULL OR project_id = $2)))
     RETURNING id, name`,
    [workspaceId, projectId || null, trimmed]
  );
  return inserted.rows[0];
}

async function addCategory(req, res) {
  try {
    const name = String((req.body && req.body.name) || '').trim().slice(0, 80);
    if (!name) return res.status(400).json({ success: false, message: 'Category name is required.' });
    const workspaceId = req.myDrawings.workspace.id;
    const projectId = currentSiteId(req.myDrawings);
    const exists = await pool.query(
      `SELECT id FROM my_drawings_category
       WHERE workspace_id = $1 AND LOWER(name) = LOWER($2) AND ($3::int IS NULL OR project_id = $3)`,
      [workspaceId, name, projectId]
    );
    if (exists.rows[0]) {
      return res.status(400).json({ success: false, message: 'That category already exists.' });
    }
    await getOrCreateCategory(workspaceId, name, projectId);
    await logActivity(req, 'added_category', name, '');
    return catalogResponse(req, res);
  } catch (err) {
    console.error('myDrawings addCategory:', err);
    return res.status(500).json({ success: false, message: 'Could not add category.' });
  }
}

async function renameCategory(req, res) {
  try {
    const from = String((req.body && req.body.from) || '').trim();
    const to = String((req.body && req.body.to) || '').trim().slice(0, 80);
    if (!from || !to) {
      return res.status(400).json({ success: false, message: 'Current name and new name are required.' });
    }
    if (from.toLowerCase() === to.toLowerCase() && from !== to) {
      /* case-only change — allow */
    } else if (from === to) {
      return catalogResponse(req, res);
    }
    const workspaceId = req.myDrawings.workspace.id;
    const projectId = currentSiteId(req.myDrawings);
    const cat = await pool.query(
      `SELECT id, name FROM my_drawings_category
       WHERE workspace_id = $1 AND LOWER(name) = LOWER($2) AND ($3::int IS NULL OR project_id = $3)`,
      [workspaceId, from, projectId]
    );
    if (!cat.rows[0]) return res.status(404).json({ success: false, message: 'Category not found.' });
    const clash = await pool.query(
      `SELECT id FROM my_drawings_category
       WHERE workspace_id = $1 AND LOWER(name) = LOWER($2) AND id <> $3 AND ($4::int IS NULL OR project_id = $4)`,
      [workspaceId, to, cat.rows[0].id, projectId]
    );
    if (clash.rows[0]) {
      return res.status(400).json({ success: false, message: 'That category name already exists.' });
    }
    await pool.query('UPDATE my_drawings_category SET name = $1 WHERE id = $2', [to, cat.rows[0].id]);
    await logActivity(req, 'renamed_category', to, from);
    return catalogResponse(req, res);
  } catch (err) {
    console.error('myDrawings renameCategory:', err);
    return res.status(500).json({ success: false, message: 'Could not rename category.' });
  }
}

async function reorderCategories(req, res) {
  try {
    const names = Array.isArray(req.body && req.body.names) ? req.body.names : null;
    if (!names || !names.length) {
      return res.status(400).json({ success: false, message: 'Category order is required.' });
    }
    const workspaceId = req.myDrawings.workspace.id;
    const projectId = currentSiteId(req.myDrawings);
    const existing = await pool.query(
      `SELECT id, name FROM my_drawings_category WHERE workspace_id = $1 AND ($2::int IS NULL OR project_id = $2)`,
      [workspaceId, projectId]
    );
    const byName = new Map(existing.rows.map((r) => [r.name, r.id]));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let order = 0;
      for (let i = 0; i < names.length; i++) {
        const name = String(names[i] || '').trim();
        const id = byName.get(name);
        if (!id) continue;
        await client.query(
          'UPDATE my_drawings_category SET sort_order = $1 WHERE id = $2',
          [order, id]
        );
        order += 1;
        byName.delete(name);
      }
      /* Keep any missing names at the end */
      for (const id of byName.values()) {
        await client.query(
          'UPDATE my_drawings_category SET sort_order = $1 WHERE id = $2',
          [order, id]
        );
        order += 1;
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return catalogResponse(req, res);
  } catch (err) {
    console.error('myDrawings reorderCategories:', err);
    return res.status(500).json({ success: false, message: 'Could not reorder categories.' });
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

function queueDrawingPush(req, action, drawing) {
  const workspaceId = req.myDrawings && req.myDrawings.workspace && req.myDrawings.workspace.id;
  const projectId =
    (req.myDrawings && req.myDrawings.project && req.myDrawings.project.id) ||
    (drawing && drawing.project_id) ||
    null;
  notifyDrawingChange({
    workspaceId,
    projectId,
    action,
    drawingId: drawing && drawing.id,
    number: drawing && drawing.number,
    title: drawing && drawing.title,
    revision: drawing && drawing.revision,
  }).catch((err) => console.warn('myDrawings push:', err && err.message ? err.message : err));
}

async function addDrawing(req, res) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Choose a PDF file.' });
    const number = String((req.body && req.body.number) || '').trim().slice(0, 40);
    const title = String((req.body && req.body.title) || '').trim().slice(0, 200);
    const revision = String((req.body && req.body.revision) || 'A').trim().toUpperCase().slice(0, 12) || 'A';
    const categoryName = String((req.body && req.body.category) || '').trim();
    const workspaceId = req.myDrawings.workspace.id;
    const project = req.myDrawings.project || (await getDefaultProject(workspaceId));
    const floors = parseProjectFloors(req.body && req.body.floors, project);
    if (!number || !title) {
      removeStoredFile(relativeFromAbs(req.file.path));
      return res.status(400).json({ success: false, message: 'Number and title are required.' });
    }
    const clash = await pool.query(
      'SELECT id FROM my_drawings_item WHERE project_id = $1 AND LOWER(number) = LOWER($2)',
      [project && project.id, number]
    );
    if (clash.rows[0]) {
      removeStoredFile(relativeFromAbs(req.file.path));
      return res.status(400).json({ success: false, message: 'A drawing with that number already exists. Use Update to replace it.' });
    }
    const cat = await getOrCreateCategory(workspaceId, categoryName || 'Uncategorised', project && project.id);
    const meta = fileMeta(req.file);
    const inserted = await pool.query(
      `INSERT INTO my_drawings_item
        (workspace_id, project_id, category_id, number, title, revision, size_bytes, stored_filename, relative_path, mime_type, floors)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [workspaceId, project && project.id, cat && cat.id, number, title, revision, meta.size_bytes, meta.stored_filename, meta.relative_path, meta.mime_type, floors]
    );
    await logActivity(req, 'added', title, number);
    queueDrawingPush(req, 'added', {
      id: inserted.rows[0] && inserted.rows[0].id,
      project_id: project && project.id,
      number,
      title,
      revision,
    });
    return catalogResponse(req, res);
  } catch (err) {
    if (req.file) removeStoredFile(relativeFromAbs(req.file.path));
    console.error('myDrawings addDrawing:', err);
    return res.status(500).json({ success: false, message: 'Could not add drawing.' });
  }
}

async function loadItem(workspaceId, id, projectId) {
  const n = parseInt(id, 10);
  if (!Number.isInteger(n) || n < 1) return null;
  const row = await pool.query(
    `SELECT * FROM my_drawings_item
     WHERE id = $1 AND workspace_id = $2 AND ($3::int IS NULL OR project_id = $3)`,
    [n, workspaceId, projectId || null]
  );
  return row.rows[0] || null;
}

async function loadDrawingForRead(req, id) {
  if (isHealthProbeId(id) && req.myDrawings && req.myDrawings.healthProbe) {
    return healthProbeDrawingItem();
  }
  const workspaceId = req.myDrawings && req.myDrawings.workspace && req.myDrawings.workspace.id;
  const n = parseInt(id, 10);
  if (!workspaceId || !Number.isInteger(n) || n < 1) return null;
  const row = await pool.query(
    'SELECT * FROM my_drawings_item WHERE id = $1 AND workspace_id = $2',
    [n, workspaceId]
  );
  const item = row.rows[0];
  if (!item) return null;
  const role = req.myDrawings.role;
  if (role === 'admin' || role === 'site_manager') return item;
  const siteId = currentSiteId(req.myDrawings);
  if (item.project_id && siteId && Number(item.project_id) !== Number(siteId)) return null;
  return item;
}

async function editDrawing(req, res) {
  try {
    const item = await loadItem(req.myDrawings.workspace.id, req.params.id, currentSiteId(req.myDrawings));
    if (!item) {
      if (req.file) removeStoredFile(relativeFromAbs(req.file.path));
      return res.status(404).json({ success: false, message: 'Drawing not found.' });
    }
    const number = String((req.body && req.body.number) || item.number).trim().slice(0, 40);
    const title = String((req.body && req.body.title) || item.title).trim().slice(0, 200);
    const revision = String((req.body && req.body.revision) || item.revision).trim().toUpperCase().slice(0, 12) || 'A';
    const categoryName = String((req.body && req.body.category) || '').trim();
    const site = req.myDrawings.project || (await loadSiteRow(req.myDrawings.workspace.id, item.project_id));
    const floors =
      req.body && Object.prototype.hasOwnProperty.call(req.body, 'floors')
        ? parseProjectFloors(req.body.floors, site)
        : item.floors || null;
    if (!number || !title) {
      if (req.file) removeStoredFile(relativeFromAbs(req.file.path));
      return res.status(400).json({ success: false, message: 'Number and title are required.' });
    }
    const clash = await pool.query(
      'SELECT id FROM my_drawings_item WHERE project_id = $1 AND LOWER(number) = LOWER($2) AND id <> $3',
      [item.project_id, number, item.id]
    );
    if (clash.rows[0]) {
      if (req.file) removeStoredFile(relativeFromAbs(req.file.path));
      return res.status(400).json({ success: false, message: 'Another drawing already uses that number.' });
    }
    const cat = await getOrCreateCategory(req.myDrawings.workspace.id, categoryName || 'Uncategorised', item.project_id);
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
           size_bytes = $5, stored_filename = $6, relative_path = $7, mime_type = $8, floors = $9, updated_at = NOW()
       WHERE id = $10`,
      [cat && cat.id, number, title, revision, meta.size_bytes, meta.stored_filename, meta.relative_path, meta.mime_type, floors, item.id]
    );
    await logActivity(req, 'updated', title, number);
    queueDrawingPush(req, 'updated', {
      id: item.id,
      project_id: item.project_id,
      number,
      title,
      revision,
    });
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
    const item = await loadItem(req.myDrawings.workspace.id, req.params.id, currentSiteId(req.myDrawings));
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
    await logActivity(req, 'updated', title || item.title, item.number);
    queueDrawingPush(req, 'updated', {
      id: item.id,
      project_id: item.project_id,
      number: item.number,
      title: title || item.title,
      revision,
    });
    return catalogResponse(req, res);
  } catch (err) {
    if (req.file) removeStoredFile(relativeFromAbs(req.file.path));
    console.error('myDrawings updateDrawingFile:', err);
    return res.status(500).json({ success: false, message: 'Could not replace drawing.' });
  }
}

async function deleteDrawing(req, res) {
  try {
    const item = await loadItem(req.myDrawings.workspace.id, req.params.id, currentSiteId(req.myDrawings));
    if (!item) return res.status(404).json({ success: false, message: 'Drawing not found.' });
    await pool.query('DELETE FROM my_drawings_item WHERE id = $1', [item.id]);
    removeStoredFile(item.relative_path);
    await logActivity(req, 'deleted', item.title, item.number);
    return catalogResponse(req, res);
  } catch (err) {
    console.error('myDrawings deleteDrawing:', err);
    return res.status(500).json({ success: false, message: 'Could not delete drawing.' });
  }
}

async function downloadFile(req, res) {
  try {
    const item = await loadDrawingForRead(req, req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Drawing not found.' });
    let abs = locateStoredDrawingFile(item);
    if (!abs) {
      console.warn('myDrawings file missing', {
        id: item.id,
        number: item.number,
        relative_path: item.relative_path,
        stored_filename: item.stored_filename,
        workspace_id: item.workspace_id,
        project_id: item.project_id,
      });
      return res.status(404).json({ success: false, message: 'File missing on server.' });
    }
    abs = copyDrawingIntoTenant(item, abs);
    await healDrawingPath(item, abs);
    if (!isAllowedDrawingAbs(abs)) {
      return res.status(404).json({ success: false, message: 'File missing on server.' });
    }
    const download = req.query.download === '1' || req.query.download === 'true';
    res.setHeader('Content-Type', download ? (item.mime_type || 'application/pdf') : 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (download) {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(item.number || 'drawing')}.pdf"`);
    } else {
      res.setHeader('Content-Disposition', 'inline; filename="drawing.bin"');
    }
    return res.sendFile(abs);
  } catch (err) {
    console.error('myDrawings downloadFile:', err);
    return res.status(500).json({ success: false, message: 'Could not load drawing.' });
  }
}

async function prepareUploadDir(req, res, next) {
  try {
    await ensureSchema();
    const workspaceId = req.myDrawings.workspace.id;
    const project = req.myDrawings.project || (await getDefaultProject(workspaceId));
    req.myDrawings.project = project;
    req.myDrawingsUploadDir = ensureTenantUploadDir(workspaceId, project.id);
    next();
  } catch (err) {
    next(err);
  }
}

async function listDrawings(req, res) {
  try {
    const workspaceId = req.myDrawings.workspace.id;
    const defaultProject = req.myDrawings.project || (await getDefaultProject(workspaceId));
    const requestedProject = positiveInt(req.query.projectId || req.query.project);
    let project = defaultProject;
    if (requestedProject) {
      const owned = await pool.query(
        'SELECT id, name, floor_count, extra_locations FROM my_drawings_project WHERE id = $1 AND workspace_id = $2',
        [requestedProject, workspaceId]
      );
      if (!owned.rows[0]) {
        return res.status(404).json({ success: false, message: 'Project not found.' });
      }
      project = owned.rows[0];
    }
    const floor = normalizeLocationId(req.query.floor);
    const category = String(req.query.category || '').trim();
    const params = [workspaceId, project.id];
    let sql = `
      SELECT i.id, i.number, i.title, i.revision, i.size_bytes, i.updated_at, i.floors, c.name AS category
      FROM my_drawings_item i
      LEFT JOIN my_drawings_category c ON c.id = i.category_id
      WHERE i.workspace_id = $1 AND i.project_id = $2
    `;
    if (floor) {
      params.push(floor);
      sql += ` AND (i.floors IS NULL OR $${params.length} = ANY(i.floors))`;
    }
    if (category) {
      params.push(category);
      sql += ` AND LOWER(COALESCE(c.name, 'Uncategorised')) = LOWER($${params.length})`;
    }
    sql += ' ORDER BY i.number ASC';
    const items = await pool.query(sql, params);
    const cats = await pool.query(
      `SELECT name FROM my_drawings_category
       WHERE workspace_id = $1 AND ($2::int IS NULL OR project_id = $2)
       ORDER BY sort_order ASC, name ASC`,
      [workspaceId, project.id]
    );
    const drawings = items.rows.map((d) => ({
      id: d.id,
      number: d.number,
      title: d.title,
      category: d.category || 'Uncategorised',
      revision: d.revision,
      floors: floorsForClient(d.floors),
      updatedAt: isoDate(d.updated_at),
      sizeBytes: Number(d.size_bytes) || 0,
      fileUrl: `/api/drawings/${d.id}/file`,
    }));
    const loc = siteLocationFields(project);
    return res.json({
      success: true,
      company: {
        id: workspaceId,
        name: req.myDrawings.workspace.name,
        managerName: req.myDrawings.workspace.managerName || req.myDrawings.workspace.manager_name || '',
      },
      project: { id: project.id, name: project.name },
      locations: loc.locations,
      occupiedLocations: occupiedLocations(drawings, loc.locations),
      categories: cats.rows.map((r) => r.name),
      drawings,
    });
  } catch (err) {
    console.error('myDrawings listDrawings:', err);
    return res.status(500).json({ success: false, message: 'Could not load drawings.' });
  }
}

async function registerDevice(req, res) {
  try {
    const worker = req.myDrawings && req.myDrawings.worker;
    if (!worker || !worker.id) {
      return res.status(403).json({ success: false, message: 'Worker session required.' });
    }
    const body = req.body || {};
    const token =
      typeof body.fcmToken === 'string'
        ? body.fcmToken.trim()
        : typeof body.token === 'string'
          ? body.token.trim()
          : '';
    const platform = String(body.platform || '').toLowerCase() || null;
    if (!token || token.length < 20) {
      return res.status(400).json({ success: false, message: 'Valid FCM token is required.' });
    }
    if (platform && !['ios', 'android'].includes(platform)) {
      return res.status(400).json({ success: false, message: 'platform must be ios or android.' });
    }
    await pool.query(
      `INSERT INTO user_devices (user_id, fcm_token, platform, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (fcm_token)
       DO UPDATE SET
         user_id = EXCLUDED.user_id,
         platform = COALESCE(EXCLUDED.platform, user_devices.platform),
         updated_at = NOW()`,
      [worker.id, token.slice(0, 512), platform]
    );
    return res.json({ success: true, message: 'Device registered.' });
  } catch (err) {
    console.error('myDrawings registerDevice:', err);
    return res.status(500).json({ success: false, message: 'Failed to register device.' });
  }
}

async function listSites(req, res) {
  try {
    if (!canManageSite(req.myDrawings)) {
      return res.status(403).json({ success: false, message: 'Site manager or company access is required.' });
    }
    const sites = sitesVisibleTo(
      req.myDrawings,
      await listWorkspaceSites(req.myDrawings.workspace.id)
    );
    return res.json({
      success: true,
      sites,
      siteCount: sites.length,
      currentSiteId: currentSiteId(req.myDrawings),
    });
  } catch (err) {
    console.error('myDrawings listSites:', err);
    return res.status(500).json({ success: false, message: 'Could not load sites.' });
  }
}

async function addSite(req, res) {
  try {
    if (!isCompanyHead(req.myDrawings)) {
      return res.status(403).json({ success: false, message: 'Only the company head can add a site.' });
    }
    const workspaceId = req.myDrawings.workspace.id;
    const name = String((req.body && req.body.name) || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!name) {
      return res.status(400).json({ success: false, message: 'Site name is required.' });
    }
    const floorCount = parseFloorCount(req.body && (req.body.floorCount != null ? req.body.floorCount : req.body.floorsCount), null);
    if (floorCount == null) {
      return res.status(400).json({ success: false, message: 'Enter how many floors this site has.' });
    }
    const extraLocations = parseExtraLocations(req.body && (req.body.extraLocations || req.body.locations));
    const clash = await pool.query(
      'SELECT id FROM my_drawings_project WHERE workspace_id = $1 AND LOWER(name) = LOWER($2)',
      [workspaceId, name]
    );
    if (clash.rows[0]) {
      return res.status(409).json({ success: false, message: 'A site with that name already exists.' });
    }
    const code = await allocateAccessCode(workspaceId);
    const inserted = await pool.query(
      `INSERT INTO my_drawings_project (workspace_id, name, access_code, wall_types_pack, floor_count, extra_locations)
       VALUES ($1, $2, $3, '{}'::jsonb, $4, $5)
       RETURNING id, name, access_code, floor_count, extra_locations`,
      [workspaceId, name, code, floorCount, extraLocations]
    );
    await pool.query(
      `UPDATE my_drawings_workspace SET project_mode = 'multi' WHERE id = $1`,
      [workspaceId]
    );
    req.myDrawings.project = inserted.rows[0];
    const payload = await loadCatalog(req.myDrawings.workspace, 'admin', inserted.rows[0]);
    payload.message = 'Site created.';
    payload.accessCode = code;
    return res.json(payload);
  } catch (err) {
    console.error('myDrawings addSite:', err);
    if (err && err.code === 'ACCESS_CODE_ALLOC') {
      return res.status(500).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: 'Could not add the site.' });
  }
}

async function renameSite(req, res) {
  try {
    if (!isCompanyHead(req.myDrawings)) {
      return res.status(403).json({ success: false, message: 'Only the company head can rename a site.' });
    }
    const workspaceId = req.myDrawings.workspace.id;
    const site = await loadSiteRow(workspaceId, req.params.id);
    if (!site) return res.status(404).json({ success: false, message: 'Site not found.' });
    const name = String((req.body && req.body.name) || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!name) return res.status(400).json({ success: false, message: 'Site name is required.' });
    const clash = await pool.query(
      'SELECT id FROM my_drawings_project WHERE workspace_id = $1 AND LOWER(name) = LOWER($2) AND id <> $3',
      [workspaceId, name, site.id]
    );
    if (clash.rows[0]) {
      return res.status(409).json({ success: false, message: 'A site with that name already exists.' });
    }
    await pool.query('UPDATE my_drawings_project SET name = $2 WHERE id = $1', [site.id, name]);
    req.myDrawings.project = { ...site, name };
    return catalogResponse(req, res);
  } catch (err) {
    console.error('myDrawings renameSite:', err);
    return res.status(500).json({ success: false, message: 'Could not rename the site.' });
  }
}

async function updateSiteLocations(req, res) {
  try {
    if (!canManageSite(req.myDrawings)) {
      return res.status(403).json({ success: false, message: 'Site manager or company access is required.' });
    }
    const workspaceId = req.myDrawings.workspace.id;
    const site = await loadSiteRow(workspaceId, req.params.id);
    if (!site) return res.status(404).json({ success: false, message: 'Site not found.' });
    if (req.myDrawings.role === 'site_manager' && Number(site.id) !== Number(currentSiteId(req.myDrawings))) {
      return res.status(403).json({ success: false, message: 'You can only manage the site you were assigned to.' });
    }
    const floorCount = parseFloorCount(req.body && (req.body.floorCount != null ? req.body.floorCount : req.body.floorsCount), null);
    if (floorCount == null) {
      return res.status(400).json({ success: false, message: 'Enter how many floors this site has.' });
    }
    const extraLocations = parseExtraLocations(req.body && (req.body.extraLocations || req.body.locations));
    await pool.query(
      'UPDATE my_drawings_project SET floor_count = $2, extra_locations = $3 WHERE id = $1 AND workspace_id = $4',
      [site.id, floorCount, extraLocations, workspaceId]
    );
    req.myDrawings.project = { ...site, floor_count: floorCount, extra_locations: extraLocations };
    const payload = await loadCatalog(req.myDrawings.workspace, req.myDrawings.role, req.myDrawings.project);
    payload.message = 'Site locations saved.';
    return res.json(payload);
  } catch (err) {
    console.error('myDrawings updateSiteLocations:', err);
    return res.status(500).json({ success: false, message: 'Could not save site locations.' });
  }
}

async function deleteSite(req, res) {
  try {
    if (!isCompanyHead(req.myDrawings)) {
      return res.status(403).json({ success: false, message: 'Only the company head can close a site.' });
    }
    const workspaceId = req.myDrawings.workspace.id;
    const site = await loadSiteRow(workspaceId, req.params.id);
    if (!site) return res.status(404).json({ success: false, message: 'Site not found.' });
    const count = await pool.query(
      'SELECT COUNT(*)::int AS n FROM my_drawings_project WHERE workspace_id = $1',
      [workspaceId]
    );
    if (count.rows[0] && count.rows[0].n < 2) {
      return res.status(400).json({ success: false, message: 'A company must keep at least one site.' });
    }
    const files = await pool.query(
      'SELECT relative_path FROM my_drawings_item WHERE project_id = $1',
      [site.id]
    );
    files.rows.forEach((row) => removeStoredFile(row.relative_path));
    const images = await pool.query(
      'SELECT detail_image_path FROM my_drawings_wall_type WHERE project_id = $1',
      [site.id]
    );
    images.rows.forEach((row) => removeStoredFile(row.detail_image_path));
    await pool.query('DELETE FROM my_drawings_project WHERE id = $1 AND workspace_id = $2', [site.id, workspaceId]);
    const next = await getDefaultProject(workspaceId);
    req.myDrawings.project = next;
    const remaining = await pool.query(
      'SELECT COUNT(*)::int AS n FROM my_drawings_project WHERE workspace_id = $1',
      [workspaceId]
    );
    if (remaining.rows[0] && remaining.rows[0].n < 2) {
      await pool.query(`UPDATE my_drawings_workspace SET project_mode = 'single' WHERE id = $1`, [workspaceId]);
    }
    const payload = await loadCatalog(req.myDrawings.workspace, 'admin', next);
    payload.message = 'Site closed.';
    return res.json(payload);
  } catch (err) {
    console.error('myDrawings deleteSite:', err);
    return res.status(500).json({ success: false, message: 'Could not close the site.' });
  }
}

module.exports = {
  ensureSchema,
  resolveWorkspaceByPin,
  resolveDeviceToken,
  resolveAdminToken,
  resolveJwtAuth,
  registerWorker,
  loginWorker,
  verifyWorker,
  requestAuthCode,
  lookupAuth,
  startCompany,
  companyLogin,
  requestCompanyPasswordReset,
  previewCompanyPasswordReset,
  resetCompanyPassword,
  unlock,
  logoutSession,
  getCatalog,
  listDrawings,
  getActivity,
  listWorkers,
  suspendWorker,
  restoreWorker,
  deleteMyAccount,
  deleteWorker,
  makeWorkerAdmin,
  removeWorkerAdmin,
  updateAccessCode,
  addCategory,
  renameCategory,
  reorderCategories,
  addDrawing,
  editDrawing,
  updateDrawingFile,
  deleteDrawing,
  downloadFile,
  registerDevice,
  prepareUploadDir,
  listSites,
  addSite,
  renameSite,
  updateSiteLocations,
  deleteSite,
  listWallTypes,
  updateWallTypesPack,
  seedStarterWallTypes,
  addWallType,
  editWallType,
  deleteWallType,
  downloadWallTypeImage,
  sendSpecImportRequest,
};
