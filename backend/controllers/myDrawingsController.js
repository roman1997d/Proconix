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
  seedExistingWorkspaceWallTypes,
  listWallTypes,
  updateWallTypesPack,
  seedStarterWallTypes,
  addWallType,
  editWallType,
  deleteWallType,
  downloadWallTypeImage,
} = require('../lib/myDrawingsWallTypes');

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

const FLOOR_IDS = new Set(['ground', '1', '2', '3', '4', '5']);

function normalizeFloorId(raw) {
  let v = String(raw == null ? '' : raw).trim().toLowerCase();
  if (!v) return null;
  v = v.replace(/^floor\s+/, '');
  if (v === '0' || v === 'gf' || v === 'g' || v === 'ground floor' || v === 'groundfloor') return 'ground';
  if (FLOOR_IDS.has(v)) return v;
  return null;
}

/** Parse floors from JSON array, CSV string, or form field. Empty/missing => null (all floors). */
function parseFloors(raw) {
  if (raw == null || raw === '') return null;
  let arr = raw;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return null;
    try {
      arr = JSON.parse(s);
    } catch (e) {
      arr = s.split(/[,|;]+/);
    }
  }
  if (!Array.isArray(arr)) arr = [arr];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const id = normalizeFloorId(arr[i]);
    if (id && out.indexOf(id) === -1) out.push(id);
  }
  return out.length ? out : null;
}

function floorsForClient(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(normalizeFloorId).filter(Boolean);
  return parseFloors(value) || [];
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

  ensureUploadDir();
  await seedTenants();
  await seedDefaultProjects();
  await migrateStoredDrawingsToTenantDirs();
  await seedExistingWorkspaceWallTypes();
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

async function accessCodeTaken(code, exceptWorkspaceId) {
  const result = await pool.query(
    `SELECT id FROM my_drawings_workspace
     WHERE UPPER(access_code) = $1 AND id <> $2`,
    [code, exceptWorkspaceId || 0]
  );
  return !!result.rows[0];
}

async function allocateAccessCode(exceptWorkspaceId) {
  for (let i = 0; i < 30; i++) {
    const code = generateAccessCode(8);
    if (!(await accessCodeTaken(code, exceptWorkspaceId))) return code;
  }
  const err = new Error('Could not generate a unique access code.');
  err.code = 'ACCESS_CODE_ALLOC';
  throw err;
}

async function dummyPinHash() {
  return bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
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
    'SELECT id, name FROM my_drawings_project WHERE workspace_id = $1 ORDER BY id ASC LIMIT 1',
    [wsId]
  );
  if (found.rows[0]) return found.rows[0];
  const ws = await pool.query('SELECT name FROM my_drawings_workspace WHERE id = $1', [wsId]);
  const name = (ws.rows[0] && ws.rows[0].name) || DEFAULT_PROJECT_NAME;
  const inserted = await pool.query(
    `INSERT INTO my_drawings_project (workspace_id, name) VALUES ($1, $2) RETURNING id, name`,
    [wsId, name]
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
    if (String(row.relative_path).startsWith(expectedPrefix)) continue;
    const abs = absFromRelative(row.relative_path);
    if (!abs || !fs.existsSync(abs)) continue;
    const destDir = ensureTenantUploadDir(row.workspace_id, projectId);
    const destName = row.stored_filename || path.basename(abs);
    const destAbs = path.join(destDir, destName);
    if (path.resolve(abs) === path.resolve(destAbs)) continue;
    try {
      fs.renameSync(abs, destAbs);
    } catch (_) {
      try {
        fs.copyFileSync(abs, destAbs);
        fs.unlinkSync(abs);
      } catch (err) {
        console.warn('myDrawings migrate file failed:', abs, err.message || err);
        continue;
      }
    }
    await pool.query(
      'UPDATE my_drawings_item SET relative_path = $1, stored_filename = $2 WHERE id = $3',
      [relativeFromAbs(destAbs), destName, row.id]
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
    `SELECT w.id AS worker_id, w.first_name, w.last_name, w.email, w.workspace_id,
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
  const claimed = await pool.query(
    'SELECT id, name FROM my_drawings_project WHERE id = $1 AND workspace_id = $2',
    [claims.projectId, row.workspace_id]
  );
  const project = claimed.rows[0] || (await getDefaultProject(row.workspace_id));
  if (!project) return null;
  return {
    workspace: { id: row.workspace_id, name: row.workspace_name, managerName: row.manager_name || '' },
    role: row.is_admin ? 'admin' : 'worker',
    worker: {
      id: row.worker_id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
    },
    project: { id: project.id, name: project.name },
  };
}

async function issueWorkerSession(workspace, worker) {
  throwIfSuspended(worker);
  const project = await getDefaultProject(workspace.id);
  if (!project) {
    const err = new Error('Company project is missing.');
    err.code = 'PROJECT_MISSING';
    throw err;
  }
  const opened = await openWorkerDevice(workspace, worker);
  let token = null;
  try {
    token = signMyDrawingsJwt({
      workerId: worker.id,
      companyId: workspace.id,
      projectId: project.id,
      email: worker.email,
      role: 'worker',
    });
  } catch (err) {
    if (err && err.code !== 'JWT_NOT_CONFIGURED') throw err;
    console.warn('My Drawings: MY_DRAWINGS_JWT_SECRET is not set; mobile JWT will not be issued.');
  }
  return {
    ...opened,
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
  await ensureSchema();
  const normalized = normalizeAccessCode(code);
  if (!ACCESS_CODE_RE.test(normalized)) return null;
  const result = await pool.query(
    `SELECT id, name, email, manager_name, access_code
     FROM my_drawings_workspace
     WHERE UPPER(access_code) = $1`,
    [normalized]
  );
  return result.rows[0] || null;
}

async function findWorkersByEmail(email) {
  const result = await pool.query(
    `SELECT w.id, w.workspace_id, w.first_name, w.last_name, w.email,
            w.pin_hash, w.pin_expires_at, w.access_suspended_until, w.is_admin,
            ws.name AS workspace_name, ws.manager_name
     FROM my_drawings_worker w
     JOIN my_drawings_workspace ws ON ws.id = w.workspace_id
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
            w.id AS worker_id, w.first_name, w.last_name, w.email,
            w.access_suspended_until,
            w.is_admin,
            ws.id AS workspace_id, ws.name AS workspace_name, ws.manager_name
     FROM my_drawings_device d
     JOIN my_drawings_worker w ON w.id = d.worker_id
     JOIN my_drawings_workspace ws ON ws.id = w.workspace_id
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
  return {
    workspace: { id: row.workspace_id, name: row.workspace_name, managerName: row.manager_name || '' },
    role: row.is_admin ? 'admin' : 'worker',
    worker: {
      id: row.worker_id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
    },
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
      return res.status(400).json({ success: false, message: 'Enter the host access code from your company.' });
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
      return res.status(404).json({ success: false, message: 'That host access code is not valid.' });
    }
    const existing = await pool.query(
      `SELECT id, first_name, last_name, email, access_suspended_until
       FROM my_drawings_worker WHERE workspace_id = $1 AND email = $2`,
      [workspace.id, email]
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
      `INSERT INTO my_drawings_worker (workspace_id, first_name, last_name, email, verified_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, first_name, last_name, email, access_suspended_until`,
      [workspace.id, firstName, lastName, email]
    );
    const session = await issueWorkerSession(
      { id: workspace.id, name: workspace.name, managerName: workspace.manager_name || '' },
      inserted.rows[0]
    );
    return res.json({
      ...session,
      success: true,
      message: 'Account created.',
    });
  } catch (err) {
    console.error('myDrawings register:', err);
    if (err && err.code === 'ACCESS_CLOSED') {
      return res.status(403).json(accessClosedPayload(err.until));
    }
    return res.status(500).json({ success: false, message: 'Could not create your account.' });
  }
}

async function openWorkerDevice(workspace, worker) {
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
  const catalog = await loadCatalog(workspace, 'worker');
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
        `SELECT id, name, email, manager_name, access_code, project_mode, logo_path
         FROM my_drawings_workspace
         WHERE LOWER(email) = $1`,
        [email]
      );
      if (manager.rows[0]) {
        return res.json(await issueAdminSession(manager.rows[0]));
      }
    }
    let rows = await findWorkersByEmail(email);
    if (accessCode) {
      const workspace = await findWorkspaceByAccessCode(accessCode);
      if (!workspace) {
        return res.status(404).json({ success: false, message: 'That host access code is not valid.' });
      }
      rows = rows.filter((row) => Number(row.workspace_id) === Number(workspace.id));
    }
    rows = rows.filter((row) => !suspendedUntil(row));
    if (!rows.length) {
      const closed = (await findWorkersByEmail(email)).find((row) => suspendedUntil(row));
      if (closed) {
        return res.status(403).json(accessClosedPayload(suspendedUntil(closed)));
      }
      return res.status(404).json({ success: false, message: 'No account found for that email.' });
    }
    const worker = rows[0];
    if (worker.is_admin) {
      const wsRow = await pool.query(
        `SELECT id, name, email, manager_name, access_code, project_mode, logo_path
         FROM my_drawings_workspace WHERE id = $1`,
        [worker.workspace_id]
      );
      const display = [worker.first_name, worker.last_name].filter(Boolean).join(' ').trim();
      if (wsRow.rows[0]) {
        return res.json(await issueAdminSession(wsRow.rows[0], display));
      }
    }
    const workspace = {
      id: worker.workspace_id,
      name: worker.workspace_name,
      managerName: worker.manager_name || '',
    };
    return res.json(await issueWorkerSession(workspace, worker));
  } catch (err) {
    console.error('myDrawings login:', err);
    if (err && err.code === 'ACCESS_CLOSED') {
      return res.status(403).json(accessClosedPayload(err.until));
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
    let rows = await findWorkersByEmail(email);
    if (accessCode) {
      const workspace = await findWorkspaceByAccessCode(accessCode);
      if (workspace) {
        rows = rows.filter((row) => Number(row.workspace_id) === Number(workspace.id));
      }
    }
    if (rows.length > 1) {
      return res.status(400).json({
        success: false,
        message: 'Enter the host access code for the company you want to open.',
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
    if (!allowRate('email:' + email, REGISTER_EMAIL_MAX, REGISTER_WINDOW_MS)
        || !allowRate('ip:' + clientIp(req), REGISTER_IP_MAX, REGISTER_WINDOW_MS)) {
      return res.status(429).json({ success: false, message: 'Too many requests. Try again later.' });
    }
    let rows = await findWorkersByEmail(email);
    if (accessCode) {
      const workspace = await findWorkspaceByAccessCode(accessCode);
      if (!workspace) {
        return res.status(404).json({ success: false, message: 'That host access code is not valid.' });
      }
      rows = rows.filter((row) => Number(row.workspace_id) === Number(workspace.id));
    }
    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: 'No account found for that email. Create an account with the host access code first.',
      });
    }
    if (rows.length > 1) {
      return res.status(400).json({
        success: false,
        message: 'Enter the host access code for the company you want to open.',
      });
    }
    const worker = rows[0];
    const until = suspendedUntil(worker);
    if (until) {
      return res.status(403).json(accessClosedPayload(until));
    }
    const { pin, sha } = await issueUniquePin(worker.workspace_id);
    const pinHash = await bcrypt.hash(pin, 10);
    await pool.query(
      `UPDATE my_drawings_worker
       SET pin_hash = $2, pin_sha = $3, pin_expires_at = NOW() + INTERVAL '24 hours'
       WHERE id = $1`,
      [worker.id, pinHash, sha]
    );
    await sendPasskeyEmail({ to: worker.email, firstName: worker.first_name, pin });
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

async function loadCatalog(workspace, role) {
  const cats = await pool.query(
    'SELECT id, name FROM my_drawings_category WHERE workspace_id = $1 ORDER BY sort_order ASC, name ASC',
    [workspace.id]
  );
  const items = await pool.query(
    `SELECT i.id, i.number, i.title, i.revision, i.size_bytes, i.updated_at, i.floors, c.name AS category
     FROM my_drawings_item i
     LEFT JOIN my_drawings_category c ON c.id = i.category_id
     WHERE i.workspace_id = $1
     ORDER BY i.number ASC`,
    [workspace.id]
  );
  let accessCode = workspace.access_code || '';
  if ((role || 'worker') === 'admin' && !accessCode) {
    const extra = await pool.query(
      'SELECT access_code FROM my_drawings_workspace WHERE id = $1',
      [workspace.id]
    );
    accessCode = (extra.rows[0] && extra.rows[0].access_code) || '';
  }
  const project = await getDefaultProject(workspace.id);
  return {
    success: true,
    role: role || 'worker',
    company: {
      id: workspace.id,
      name: workspace.name,
      managerName: workspace.managerName || workspace.manager_name || '',
    },
    project: {
      id: `ws-${workspace.id}`,
      name: workspace.name,
      companyId: workspace.id,
      projectId: project ? project.id : null,
    },
    accessCode: (role || 'worker') === 'admin' ? accessCode : undefined,
    categories: cats.rows.map((r) => r.name),
    drawings: items.rows.map((d) => ({
      id: String(d.id),
      number: d.number,
      title: d.title,
      category: d.category || 'Uncategorised',
      revision: d.revision,
      floors: floorsForClient(d.floors),
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

function actorName(req) {
  const worker = req.myDrawings && req.myDrawings.worker;
  const name = [worker && worker.firstName, worker && worker.lastName].filter(Boolean).join(' ').trim();
  return name || 'Administrator';
}

async function logActivity(req, action, title, number) {
  try {
    await pool.query(
      `INSERT INTO my_drawings_activity (workspace_id, actor_name, action, drawing_title, drawing_number)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        req.myDrawings.workspace.id,
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
       WHERE workspace_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 200`,
      [req.myDrawings.workspace.id]
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
    const rows = await pool.query(
      `SELECT w.id, w.first_name, w.last_name, w.email, w.verified_at, w.created_at,
              w.access_suspended_until, w.is_admin,
              (SELECT COUNT(*)::int FROM my_drawings_device d WHERE d.worker_id = w.id) AS device_count,
              (SELECT MAX(d.last_seen_at) FROM my_drawings_device d WHERE d.worker_id = w.id) AS last_seen_at
       FROM my_drawings_worker w
       WHERE w.workspace_id = $1
       ORDER BY w.last_name ASC, w.first_name ASC, w.id ASC`,
      [workspaceId]
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
        };
      }),
    });
  } catch (err) {
    console.error('myDrawings listWorkers:', err);
    return res.status(500).json({ success: false, message: 'Could not load users.' });
  }
}

async function findCompanyWorker(workspaceId, workerId) {
  const id = parseInt(workerId, 10);
  if (!Number.isInteger(id) || id < 1) return null;
  const found = await pool.query(
    `SELECT id, first_name, last_name, email, access_suspended_until
     FROM my_drawings_worker
     WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId]
  );
  return found.rows[0] || null;
}

async function suspendWorker(req, res) {
  try {
    await ensureSchema();
    const workspaceId = req.myDrawings.workspace.id;
    const worker = await findCompanyWorker(workspaceId, req.params.id);
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
    const worker = await findCompanyWorker(workspaceId, req.params.id);
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

async function deleteWorker(req, res) {
  try {
    await ensureSchema();
    const workspaceId = req.myDrawings.workspace.id;
    const worker = await findCompanyWorker(workspaceId, req.params.id);
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
    const workspaceId = req.myDrawings.workspace.id;
    const worker = await findCompanyWorker(workspaceId, req.params.id);
    if (!worker) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    await pool.query(
      `UPDATE my_drawings_worker
       SET is_admin = TRUE, access_suspended_until = NULL
       WHERE id = $1`,
      [worker.id]
    );
    return res.json({ success: true, message: 'This user is now an administrator.', isAdmin: true });
  } catch (err) {
    console.error('myDrawings makeWorkerAdmin:', err);
    return res.status(500).json({ success: false, message: 'Could not make this user an administrator.' });
  }
}

async function removeWorkerAdmin(req, res) {
  try {
    await ensureSchema();
    const workspaceId = req.myDrawings.workspace.id;
    const worker = await findCompanyWorker(workspaceId, req.params.id);
    if (!worker) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    await pool.query(
      'UPDATE my_drawings_worker SET is_admin = FALSE WHERE id = $1',
      [worker.id]
    );
    return res.json({ success: true, message: 'Administrator access removed.', isAdmin: false });
  } catch (err) {
    console.error('myDrawings removeWorkerAdmin:', err);
    return res.status(500).json({ success: false, message: 'Could not remove administrator access.' });
  }
}

async function updateAccessCode(req, res) {
  try {
    await ensureSchema();
    const workspaceId = req.myDrawings.workspace.id;
    const generate = !!(req.body && (req.body.generate === true || req.body.generate === 'true'));
    let code = generate ? await allocateAccessCode(workspaceId) : normalizeAccessCode(req.body && req.body.accessCode);
    if (!ACCESS_CODE_RE.test(code)) {
      return res.status(400).json({
        success: false,
        message: 'Access code must be 6 to 10 letters or numbers.',
      });
    }
    if (await accessCodeTaken(code, workspaceId)) {
      return res.status(409).json({
        success: false,
        message: 'That access code is already in use. Choose another.',
      });
    }
    await pool.query(
      'UPDATE my_drawings_workspace SET access_code = $2 WHERE id = $1',
      [workspaceId, code]
    );
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
     VALUES ($1, $2, NOW() + ${SESSION_TTL_SQL})
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
    accessCode: row.access_code || catalog.accessCode || '',
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
      return res.json({ success: true, kind: 'manager', needsPassword: false, needsAccessCode: false });
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
      return res.json({ success: true, kind: 'worker', needsPassword: false, needsAccessCode: false });
    }
    return res.json({ success: true, kind: 'worker', needsPassword: false, needsAccessCode: false });
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
    const adminHash = await dummyPinHash();
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
    const session = await issueAdminSession(row);
    return res.json({
      ...session,
      success: true,
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
      return res.status(401).json({ success: false, message: 'No company account found for that email.' });
    }
    if (password) {
      if (!row.password_hash || !(await bcrypt.compare(password, row.password_hash))) {
        return res.status(401).json({ success: false, message: 'Incorrect company email or password.' });
      }
    }
    return res.json(await issueAdminSession(row));
  } catch (err) {
    console.error('myDrawings companyLogin:', err);
    return res.status(500).json({ success: false, message: 'Could not sign in as company.' });
  }
}

async function unlock(req, res) {
  try {
    await ensureSchema();
    const pin = String((req.body && req.body.pin) || '').trim();
    if (!/^\d{4}$/.test(pin)) {
      return res.status(401).json({ success: false, message: 'Incorrect access key' });
    }
    const resolved = await resolveWorkspaceByPin(pin);
    if (!resolved || resolved.role !== 'admin') {
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
    const cat = await pool.query(
      'SELECT id, name FROM my_drawings_category WHERE workspace_id = $1 AND LOWER(name) = LOWER($2)',
      [workspaceId, from]
    );
    if (!cat.rows[0]) return res.status(404).json({ success: false, message: 'Category not found.' });
    const clash = await pool.query(
      'SELECT id FROM my_drawings_category WHERE workspace_id = $1 AND LOWER(name) = LOWER($2) AND id <> $3',
      [workspaceId, to, cat.rows[0].id]
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
    const existing = await pool.query(
      'SELECT id, name FROM my_drawings_category WHERE workspace_id = $1',
      [workspaceId]
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
    const floors = parseFloors(req.body && req.body.floors);
    if (!number || !title) {
      removeStoredFile(relativeFromAbs(req.file.path));
      return res.status(400).json({ success: false, message: 'Number and title are required.' });
    }
    const workspaceId = req.myDrawings.workspace.id;
    const project = req.myDrawings.project || (await getDefaultProject(workspaceId));
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
    const floors =
      req.body && Object.prototype.hasOwnProperty.call(req.body, 'floors')
        ? parseFloors(req.body.floors)
        : item.floors || null;
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
    const item = await loadItem(req.myDrawings.workspace.id, req.params.id);
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
    const item = await loadItem(req.myDrawings.workspace.id, req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Drawing not found.' });
    const scopedProject = req.myDrawings.project && req.myDrawings.project.id;
    if (scopedProject && item.project_id && Number(item.project_id) !== Number(scopedProject)) {
      return res.status(404).json({ success: false, message: 'Drawing not found.' });
    }
    const abs = absFromRelative(item.relative_path);
    if (!abs || !fs.existsSync(abs)) {
      return res.status(404).json({ success: false, message: 'File missing on server.' });
    }
    const expectedRoot = path.join(UPLOAD_DIR, String(req.myDrawings.workspace.id)) + path.sep;
    if (!abs.startsWith(expectedRoot) && !abs.startsWith(UPLOAD_DIR + path.sep)) {
      return res.status(404).json({ success: false, message: 'File missing on server.' });
    }
    const download = req.query.download === '1' || req.query.download === 'true';
    res.setHeader('Content-Type', item.mime_type || 'application/pdf');
    res.setHeader('X-Content-Type-Options', 'nosniff');
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
        'SELECT id, name FROM my_drawings_project WHERE id = $1 AND workspace_id = $2',
        [requestedProject, workspaceId]
      );
      if (!owned.rows[0]) {
        return res.status(404).json({ success: false, message: 'Project not found.' });
      }
      project = owned.rows[0];
    }
    const floor = normalizeFloorId(req.query.floor);
    const category = String(req.query.category || '').trim();
    const params = [workspaceId, project.id];
    let sql = `
      SELECT i.id, i.number, i.title, i.revision, i.size_bytes, i.updated_at, i.floors, c.name AS category
      FROM my_drawings_item i
      LEFT JOIN my_drawings_category c ON c.id = i.category_id
      WHERE i.workspace_id = $1 AND (i.project_id = $2 OR i.project_id IS NULL)
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
      'SELECT name FROM my_drawings_category WHERE workspace_id = $1 ORDER BY sort_order ASC, name ASC',
      [workspaceId]
    );
    return res.json({
      success: true,
      company: {
        id: workspaceId,
        name: req.myDrawings.workspace.name,
        managerName: req.myDrawings.workspace.managerName || req.myDrawings.workspace.manager_name || '',
      },
      project: { id: project.id, name: project.name },
      categories: cats.rows.map((r) => r.name),
      drawings: items.rows.map((d) => ({
        id: d.id,
        number: d.number,
        title: d.title,
        category: d.category || 'Uncategorised',
        revision: d.revision,
        floors: floorsForClient(d.floors),
        updatedAt: isoDate(d.updated_at),
        sizeBytes: Number(d.size_bytes) || 0,
        fileUrl: `/api/drawings/${d.id}/file`,
      })),
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
  unlock,
  getCatalog,
  listDrawings,
  getActivity,
  listWorkers,
  suspendWorker,
  restoreWorker,
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
  listWallTypes,
  updateWallTypesPack,
  seedStarterWallTypes,
  addWallType,
  editWallType,
  deleteWallType,
  downloadWallTypeImage,
};
