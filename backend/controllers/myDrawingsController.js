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

  ensureUploadDir();
  let existing = await pool.query(
    'SELECT id, name, demo_cleared_at FROM my_drawings_workspace ORDER BY id ASC LIMIT 1'
  );
  if (!existing.rows[0]) {
    const accessHash = await bcrypt.hash(ACCESS_PIN, 10);
    const adminHash = await bcrypt.hash(ADMIN_PIN, 10);
    existing = await pool.query(
      `INSERT INTO my_drawings_workspace (name, access_pin_hash, admin_pin_hash, demo_cleared_at)
       VALUES ($1, $2, $3, NOW()) RETURNING id, name, demo_cleared_at`,
      [DEFAULT_PROJECT_NAME, accessHash, adminHash]
    );
    return;
  }

  const stored = await pool.query(
    'SELECT id, admin_pin_hash FROM my_drawings_workspace WHERE id = $1',
    [existing.rows[0].id]
  );
  if (stored.rows[0] && !(await bcrypt.compare(ADMIN_PIN, stored.rows[0].admin_pin_hash))) {
    const adminHash = await bcrypt.hash(ADMIN_PIN, 10);
    await pool.query('UPDATE my_drawings_workspace SET admin_pin_hash = $2 WHERE id = $1', [
      stored.rows[0].id,
      adminHash,
    ]);
  }

  if (!existing.rows[0].demo_cleared_at) {
    await clearWorkspaceCatalog(existing.rows[0].id);
    await pool.query(
      `UPDATE my_drawings_workspace
       SET demo_cleared_at = NOW(), name = CASE WHEN name = 'Riverside Tower — Phase 2' THEN $2 ELSE name END
       WHERE id = $1`,
      [existing.rows[0].id, DEFAULT_PROJECT_NAME]
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

function pinSha(pin) {
  return crypto.createHash('sha256').update('mydrawings-pin:' + pin).digest('hex');
}

function tokenSha(token) {
  return crypto.createHash('sha256').update('mydrawings-dev:' + token).digest('hex');
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

async function defaultWorkspace() {
  await ensureSchema();
  const result = await pool.query(
    'SELECT id, name FROM my_drawings_workspace ORDER BY id ASC LIMIT 1'
  );
  return result.rows[0] || null;
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
            ws.id AS workspace_id, ws.name AS workspace_name
     FROM my_drawings_device d
     JOIN my_drawings_worker w ON w.id = d.worker_id
     JOIN my_drawings_workspace ws ON ws.id = w.workspace_id
     WHERE d.token_hash = $1`,
    [hash]
  );
  const row = result.rows[0];
  if (!row) return null;
  pool.query('UPDATE my_drawings_device SET last_seen_at = NOW() WHERE id = $1', [row.device_id]).catch(() => {});
  return {
    workspace: { id: row.workspace_id, name: row.workspace_name },
    role: 'worker',
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
    const firstName = cleanName(req.body && req.body.firstName);
    const lastName = cleanName(req.body && req.body.lastName);
    const email = cleanEmail(req.body && req.body.email);
    if (firstName.length < 1 || lastName.length < 1) {
      return res.status(400).json({ success: false, message: 'First name and last name are required.' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }
    if (!allowRate('email:' + email, REGISTER_EMAIL_MAX, REGISTER_WINDOW_MS)
        || !allowRate('ip:' + clientIp(req), REGISTER_IP_MAX, REGISTER_WINDOW_MS)) {
      return res.status(429).json({ success: false, message: 'Too many requests. Try again later.' });
    }
    const workspace = await defaultWorkspace();
    if (!workspace) {
      return res.status(500).json({ success: false, message: 'Drawings workspace is not ready.' });
    }
    const { pin, sha } = await issueUniquePin(workspace.id);
    const pinHash = await bcrypt.hash(pin, 10);
    const existing = await pool.query(
      'SELECT id FROM my_drawings_worker WHERE workspace_id = $1 AND email = $2',
      [workspace.id, email]
    );
    if (existing.rows[0]) {
      await pool.query(
        `UPDATE my_drawings_worker
         SET first_name = $2, last_name = $3, pin_hash = $4, pin_sha = $5,
             pin_expires_at = NOW() + INTERVAL '24 hours'
         WHERE id = $1`,
        [existing.rows[0].id, firstName, lastName, pinHash, sha]
      );
    } else {
      await pool.query(
        `INSERT INTO my_drawings_worker
          (workspace_id, first_name, last_name, email, pin_hash, pin_sha, pin_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '24 hours')`,
        [workspace.id, firstName, lastName, email, pinHash, sha]
      );
    }
    await sendPasskeyEmail({ to: email, firstName, pin });
    return res.json({
      success: true,
      email,
      message: 'We sent a 4-digit key to your email.',
    });
  } catch (err) {
    console.error('myDrawings register:', err);
    if (err && err.code === 'SMTP_NOT_CONFIGURED') {
      return res.status(503).json({ success: false, message: err.message });
    }
    if (err && err.code === 'PIN_ALLOC') {
      return res.status(500).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: 'Could not send your access key.' });
  }
}

async function openWorkerDevice(workspace, worker) {
  const deviceToken = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO my_drawings_device (worker_id, token_hash) VALUES ($1, $2)`,
    [worker.id, tokenSha(deviceToken)]
  );
  await pool.query(
    `UPDATE my_drawings_worker SET verified_at = COALESCE(verified_at, NOW()) WHERE id = $1`,
    [worker.id]
  );
  const catalog = await loadCatalog(workspace, 'worker');
  return {
    ...catalog,
    deviceToken,
    firstName: worker.first_name,
    lastName: worker.last_name,
    email: worker.email,
  };
}

async function loginWorker(req, res) {
  try {
    const email = cleanEmail(req.body && req.body.email);
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }
    if (!allowRate('email:' + email, REGISTER_EMAIL_MAX, REGISTER_WINDOW_MS)
        || !allowRate('ip:' + clientIp(req), REGISTER_IP_MAX, REGISTER_WINDOW_MS)) {
      return res.status(429).json({ success: false, message: 'Too many requests. Try again later.' });
    }
    const workspace = await defaultWorkspace();
    if (!workspace) {
      return res.status(500).json({ success: false, message: 'Drawings workspace is not ready.' });
    }
    const found = await pool.query(
      `SELECT id, first_name, last_name, email
       FROM my_drawings_worker
       WHERE workspace_id = $1 AND email = $2`,
      [workspace.id, email]
    );
    const worker = found.rows[0];
    if (!worker) {
      return res.status(404).json({ success: false, message: 'No account found for that email.' });
    }
    return res.json(await openWorkerDevice(workspace, worker));
  } catch (err) {
    console.error('myDrawings login:', err);
    return res.status(500).json({ success: false, message: 'Could not sign in.' });
  }
}

async function verifyWorker(req, res) {
  try {
    await ensureSchema();
    const email = cleanEmail(req.body && req.body.email);
    const pin = String((req.body && req.body.pin) || '').trim();
    if (!EMAIL_RE.test(email) || !/^\d{4}$/.test(pin)) {
      return res.status(401).json({ success: false, message: 'Incorrect access key' });
    }
    const workspace = await defaultWorkspace();
    if (!workspace) {
      return res.status(500).json({ success: false, message: 'Drawings workspace is not ready.' });
    }
    const found = await pool.query(
      `SELECT id, first_name, last_name, email, pin_hash, pin_expires_at
       FROM my_drawings_worker
       WHERE workspace_id = $1 AND email = $2`,
      [workspace.id, email]
    );
    const worker = found.rows[0];
    if (!worker || !worker.pin_hash) {
      return res.status(401).json({ success: false, message: 'Incorrect access key' });
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
    return res.json(await openWorkerDevice(workspace, worker));
  } catch (err) {
    console.error('myDrawings verify:', err);
    return res.status(500).json({ success: false, message: 'Could not verify access key.' });
  }
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
  resolveDeviceToken,
  registerWorker,
  loginWorker,
  verifyWorker,
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
