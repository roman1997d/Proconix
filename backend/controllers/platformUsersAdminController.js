/**
 * Platform admin: list / view / edit / delete all manager + users rows (cross-tenant).
 * Identity: kind = "manager" | "user" + numeric id (IDs may overlap across tables).
 */

const bcrypt = require('bcrypt');
const { pool } = require('../db/pool');

const SALT_ROUNDS = 10;

function stripPassword(row, kind) {
  if (!row) return null;
  const o = { ...row };
  const hadPassword = !!o.password;
  delete o.password;
  o.password_set = hadPassword;
  o.kind = kind;
  return o;
}

function sortItems(items) {
  return items.slice().sort((a, b) => {
    const ca = a.company_id ?? 0;
    const cb = b.company_id ?? 0;
    if (ca !== cb) return ca - cb;
    if (a.kind !== b.kind) return a.kind === 'manager' ? -1 : 1;
    return (a.id || 0) - (b.id || 0);
  });
}

/**
 * GET /api/platform-admin/platform-users
 */
async function listPlatformUsers(req, res) {
  try {
    const [mgr, usr] = await Promise.all([
      pool.query(
        `SELECT m.*, c.name AS company_name
         FROM manager m
         LEFT JOIN companies c ON c.id = m.company_id
         ORDER BY m.id ASC`
      ),
      pool.query(
        `SELECT u.*, c.name AS company_name
         FROM users u
         LEFT JOIN companies c ON c.id = u.company_id
         ORDER BY u.id ASC`
      ),
    ]);

    const items = [];
    mgr.rows.forEach((row) => {
      items.push(stripPassword(row, 'manager'));
    });
    usr.rows.forEach((row) => {
      items.push(stripPassword(row, 'user'));
    });

    return res.status(200).json({
      success: true,
      items: sortItems(items),
    });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ success: false, message: 'Database table missing.' });
    }
    console.error('listPlatformUsers error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load platform users.' });
  }
}

function parseKind(kind) {
  const k = String(kind || '').toLowerCase();
  if (k === 'manager' || k === 'user') return k;
  return null;
}

/**
 * GET /api/platform-admin/platform-users/:kind/:id
 */
async function getPlatformUser(req, res) {
  const kind = parseKind(req.params.kind);
  const id = parseInt(req.params.id, 10);
  if (!kind || !Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid kind or id.' });
  }

  const table = kind === 'manager' ? 'manager' : 'users';
  try {
    const r = await pool.query(
      `SELECT t.*, c.name AS company_name
       FROM ${table} t
       LEFT JOIN companies c ON c.id = t.company_id
       WHERE t.id = $1`,
      [id]
    );
    if (!r.rows.length) {
      return res.status(404).json({ success: false, message: 'Record not found.' });
    }
    return res.status(200).json({
      success: true,
      record: stripPassword(r.rows[0], kind),
    });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ success: false, message: 'Database table missing.' });
    }
    console.error('getPlatformUser error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load record.' });
  }
}

const MANAGER_PATCH_KEYS = [
  'company_id',
  'name',
  'surname',
  'email',
  'active',
  'project_onboard_name',
  'is_head_manager',
  'active_status',
  'dezactivation_date',
];

const USER_PATCH_KEYS = [
  'company_id',
  'project_id',
  'role',
  'name',
  'email',
  'active',
  'active_status',
  'onboarding',
  'onboarded',
];

function normalizeEmail(em) {
  const s = String(em || '').trim();
  return s || null;
}

/**
 * PATCH /api/platform-admin/platform-users/:kind/:id
 * Body: flat fields; optional new_password (min 8 chars).
 */
async function updatePlatformUser(req, res) {
  const kind = parseKind(req.params.kind);
  const id = parseInt(req.params.id, 10);
  if (!kind || !Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid kind or id.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const table = kind === 'manager' ? 'manager' : 'users';
  const allowed = kind === 'manager' ? MANAGER_PATCH_KEYS : USER_PATCH_KEYS;

  const sets = [];
  const vals = [];
  let p = 1;

  for (let i = 0; i < allowed.length; i += 1) {
    const key = allowed[i];
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    const v = body[key];
    if (key === 'company_id') {
      const n = parseInt(v, 10);
      if (!Number.isInteger(n) || n < 1) {
        return res.status(400).json({ success: false, message: 'Invalid company_id.' });
      }
      sets.push(`company_id = $${p}`);
      vals.push(n);
      p += 1;
      continue;
    }
    if (key === 'project_id') {
      if (v === null || v === '' || v === undefined) {
        sets.push(`project_id = $${p}`);
        vals.push(null);
        p += 1;
        continue;
      }
      const n = parseInt(v, 10);
      if (!Number.isInteger(n) || n < 1) {
        return res.status(400).json({ success: false, message: 'Invalid project_id.' });
      }
      sets.push(`project_id = $${p}`);
      vals.push(n);
      p += 1;
      continue;
    }
    if (key === 'active' || key === 'active_status' || key === 'onboarded') {
      const b = v === true || v === 'true' || v === 't' || v === 1 || v === '1';
      sets.push(`${key} = $${p}`);
      vals.push(b);
      p += 1;
      continue;
    }
    if (key === 'email') {
      const em = normalizeEmail(v);
      if (kind === 'user' && !em) {
        return res.status(400).json({ success: false, message: 'Email is required for users.' });
      }
      if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        return res.status(400).json({ success: false, message: 'Invalid email.' });
      }
      sets.push(`email = $${p}`);
      vals.push(em);
      p += 1;
      continue;
    }
    if (key === 'dezactivation_date') {
      if (v === null || v === '') {
        sets.push(`dezactivation_date = $${p}`);
        vals.push(null);
        p += 1;
        continue;
      }
      sets.push(`dezactivation_date = $${p}`);
      vals.push(String(v).trim());
      p += 1;
      continue;
    }
    sets.push(`${key} = $${p}`);
    vals.push(v == null || v === '' ? null : String(v));
    p += 1;
  }

  const np = typeof body.new_password === 'string' ? body.new_password : '';
  if (np.length > 0) {
    if (np.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters.',
      });
    }
    sets.push(`password = $${p}`);
    vals.push(await bcrypt.hash(np, SALT_ROUNDS));
    p += 1;
  }

  if (!sets.length) {
    return res.status(400).json({ success: false, message: 'No valid fields to update.' });
  }

  vals.push(id);

  try {
    const q = `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`;
    const r = await pool.query(q, vals);
    if (!r.rows.length) {
      return res.status(404).json({ success: false, message: 'Record not found.' });
    }
    const withCo = await pool.query(
      `SELECT t.*, c.name AS company_name
       FROM ${table} t
       LEFT JOIN companies c ON c.id = t.company_id
       WHERE t.id = $1`,
      [id]
    );
    return res.status(200).json({
      success: true,
      message: 'Updated.',
      record: stripPassword(withCo.rows[0], kind),
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Duplicate email for this company (unique constraint).',
        detail: err.detail,
      });
    }
    if (err.code === '42703') {
      return res.status(400).json({
        success: false,
        message: 'A column in this deployment is missing; run DB migrations or remove that field.',
        detail: err.message,
      });
    }
    console.error('updatePlatformUser error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Update failed.' });
  }
}

/**
 * DELETE /api/platform-admin/platform-users/:kind/:id
 */
async function deletePlatformUser(req, res) {
  const kind = parseKind(req.params.kind);
  const id = parseInt(req.params.id, 10);
  if (!kind || !Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid kind or id.' });
  }

  const table = kind === 'manager' ? 'manager' : 'users';

  try {
    const r = await pool.query(`DELETE FROM ${table} WHERE id = $1 RETURNING id`, [id]);
    if (!r.rows.length) {
      return res.status(404).json({ success: false, message: 'Record not found.' });
    }
    return res.status(200).json({
      success: true,
      message: 'Deleted.',
      deleted: { kind, id: r.rows[0].id },
    });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        success: false,
        message:
          'Cannot delete: other rows still reference this record. Remove dependent data first.',
        detail: err.detail,
      });
    }
    console.error('deletePlatformUser error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Delete failed.' });
  }
}

module.exports = {
  listPlatformUsers,
  getPlatformUser,
  updatePlatformUser,
  deletePlatformUser,
};
