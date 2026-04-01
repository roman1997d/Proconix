/**
 * Proconix platform administrators (table proconix_admin).
 * Not company managers — separate auth and routes under /api/platform-admin.
 */

const bcrypt = require('bcrypt');
const { pool } = require('../db/pool');
const { sendManagerAccountActivatedEmail } = require('../lib/sendCallbackRequestEmail');

const SALT_ROUNDS = 10;

/**
 * SQL ORDER BY fragment: one "primary" manager per company (manager.company_id = company).
 * Prefers row marked head (is_head_manager yes), otherwise lowest manager.id.
 * @param {string} tableAlias - e.g. 'm' or '' (no prefix for single-table queries)
 */
function primaryManagerOrderBy(tableAlias) {
  const a = tableAlias ? `${tableAlias}.` : '';
  return `CASE WHEN LOWER(TRIM(COALESCE(${a}is_head_manager, ''))) = 'yes' THEN 0 ELSE 1 END, ${a}id ASC`;
}

function mapAdminRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    admin_rank: row.admin_rank,
    access_level: row.access_level,
    enroll_date: row.enroll_date,
    address: row.address,
    active: row.active,
  };
}

function mapHeadManagerRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    company_id: row.company_id,
    name: row.name,
    surname: row.surname,
    email: row.email,
    active: row.active,
    is_head_manager: row.is_head_manager,
    created_at: row.created_at,
    project_onboard_name: row.project_onboard_name,
  };
}

/**
 * Total seats = all manager rows + all users rows for this company.
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {number} companyId
 */
async function countCompanySeats(db, companyId) {
  const m = await db.query('SELECT COUNT(*)::int AS n FROM manager WHERE company_id = $1', [companyId]);
  const u = await db.query('SELECT COUNT(*)::int AS n FROM users WHERE company_id = $1', [companyId]);
  const nm = m.rows[0] && m.rows[0].n != null ? Number(m.rows[0].n) : 0;
  const nu = u.rows[0] && u.rows[0].n != null ? Number(u.rows[0].n) : 0;
  return nm + nu;
}

/**
 * POST /api/platform-admin/login
 * Body: { email, password }
 */
async function login(req, res) {
  try {
    const body = req.body || {};
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address.',
      });
    }
    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required.',
      });
    }

    const result = await pool.query(
      `SELECT id, full_name, email, password_hash, admin_rank, access_level, active, enroll_date, address
       FROM proconix_admin
       WHERE LOWER(TRIM(email)) = LOWER($1)`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const row = result.rows[0];
    if (row.active !== true) {
      return res.status(401).json({
        success: false,
        message: 'This account is inactive.',
      });
    }

    const match = await bcrypt.compare(password, row.password_hash || '');
    if (!match) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    await pool.query('UPDATE proconix_admin SET updated_at = NOW() WHERE id = $1', [row.id]);

    const platform_admin = mapAdminRow(row);

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      platform_admin,
    });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({
        success: false,
        message: 'Platform admin database table is missing. Run scripts/create_proconix_admin_table.sql.',
      });
    }
    console.error('platformAdmin login error:', err);
    return res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.',
    });
  }
}

/**
 * GET /api/platform-admin/me
 */
async function me(req, res) {
  return res.status(200).json({
    success: true,
    platform_admin: mapAdminRow(req.platformAdmin),
  });
}

/**
 * GET /api/platform-admin/companies
 * Summary: id, name, primary manager display name + email from manager (company_id match).
 */
async function listCompanies(req, res) {
  try {
    const result = await pool.query(
      `SELECT c.id,
              c.name,
              hm.id AS head_manager_id,
              TRIM(CONCAT(COALESCE(hm.name, ''), ' ', COALESCE(hm.surname, ''))) AS head_manager_name,
              hm.email AS head_manager_email
       FROM companies c
       LEFT JOIN LATERAL (
         SELECT m.id, m.name, m.surname, m.email
         FROM manager m
         WHERE m.company_id = c.id
         ORDER BY ${primaryManagerOrderBy('m')}
         LIMIT 1
       ) hm ON true
       ORDER BY c.id ASC`
    );
    return res.status(200).json({
      success: true,
      companies: result.rows || [],
    });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({
        success: false,
        message: 'Companies table is missing.',
      });
    }
    console.error('platformAdmin listCompanies error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to load companies.',
    });
  }
}

/**
 * GET /api/platform-admin/companies/:id
 */
async function getCompany(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid company id.' });
  }
  try {
    const c = await pool.query('SELECT * FROM companies WHERE id = $1', [id]);
    if (!c.rows.length) {
      return res.status(404).json({ success: false, message: 'Company not found.' });
    }
    const hm = await pool.query(
      `SELECT id, company_id, name, surname, email, active, is_head_manager, created_at, project_onboard_name
       FROM manager
       WHERE company_id = $1
       ORDER BY ${primaryManagerOrderBy('')}
       LIMIT 1`,
      [id]
    );
    let userCount = 0;
    try {
      userCount = await countCompanySeats(pool, id);
    } catch (cntErr) {
      if (cntErr.code !== '42P01') throw cntErr;
    }
    return res.status(200).json({
      success: true,
      company: c.rows[0],
      user_count: userCount,
      head_manager: hm.rows[0] ? mapHeadManagerRow(hm.rows[0]) : null,
    });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ success: false, message: 'Database table missing.' });
    }
    console.error('platformAdmin getCompany error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load company.' });
  }
}

const COMPANY_PATCH_KEYS = [
  'name',
  'industry_type',
  'subscription_plan',
  'active',
  'created_by',
  'office_address',
  'security_question1',
  'security_token1',
];

/**
 * PATCH /api/platform-admin/companies/:id
 * Body: { company?: { ... }, head_manager?: { name, surname, email, new_password? } }
 */
async function updateCompany(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid company id.' });
  }

  const body = req.body || {};
  const companyIn = body.company && typeof body.company === 'object' ? body.company : {};
  const hmIn = body.head_manager && typeof body.head_manager === 'object' ? body.head_manager : {};

  let managerJustActivated = null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const exists = await client.query('SELECT id FROM companies WHERE id = $1', [id]);
    if (!exists.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Company not found.' });
    }

    const sets = [];
    const vals = [];
    let p = 1;
    COMPANY_PATCH_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(companyIn, key)) {
        sets.push(`${key} = $${p}`);
        vals.push(companyIn[key] == null ? null : String(companyIn[key]));
        p += 1;
      }
    });
    if (Object.prototype.hasOwnProperty.call(companyIn, 'user_limit')) {
      const raw = companyIn.user_limit;
      let limitVal = null;
      if (raw === null || raw === undefined || raw === '') {
        limitVal = null;
      } else {
        const n = parseInt(String(raw).trim(), 10);
        if (!Number.isInteger(n) || n < 1) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'user_limit must be a positive integer, or empty / null for no limit.',
          });
        }
        limitVal = n;
      }
      sets.push(`user_limit = $${p}`);
      vals.push(limitVal);
      p += 1;
    }
    if (sets.length) {
      vals.push(id);
      try {
        await client.query(
          `UPDATE companies SET ${sets.join(', ')} WHERE id = $${p}`,
          vals
        );
      } catch (updErr) {
        if (updErr.code === '42703' && sets.some((s) => s.startsWith('user_limit'))) {
          await client.query('ROLLBACK');
          return res.status(503).json({
            success: false,
            message:
              'Column user_limit is missing on companies. Run: scripts/alter_companies_user_limit.sql',
          });
        }
        throw updErr;
      }
    }

    if (Object.keys(hmIn).length > 0) {
      const hmRes = await client.query(
        `SELECT id FROM manager WHERE company_id = $1 ORDER BY ${primaryManagerOrderBy('')} LIMIT 1`,
        [id]
      );
      if (hmRes.rows.length) {
        const hmId = hmRes.rows[0].id;
        const hmSets = [];
        const hmVals = [];
        let hp = 1;
        if (Object.prototype.hasOwnProperty.call(hmIn, 'name')) {
          hmSets.push(`name = $${hp}`);
          hmVals.push(hmIn.name == null ? null : String(hmIn.name).trim());
          hp += 1;
        }
        if (Object.prototype.hasOwnProperty.call(hmIn, 'surname')) {
          hmSets.push(`surname = $${hp}`);
          hmVals.push(hmIn.surname == null ? null : String(hmIn.surname).trim());
          hp += 1;
        }
        if (Object.prototype.hasOwnProperty.call(hmIn, 'email')) {
          const em = String(hmIn.email || '').trim();
          if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'Invalid head manager email.' });
          }
          hmSets.push(`email = $${hp}`);
          hmVals.push(em || null);
          hp += 1;
        }
        if (Object.prototype.hasOwnProperty.call(hmIn, 'active')) {
          const isActive = hmIn.active === true || hmIn.active === 'true';
          hmSets.push(`active = $${hp}`);
          hmVals.push(isActive);
          hp += 1;
          // Align with company onboarding: head manager flag when toggling account access.
          hmSets.push(`is_head_manager = $${hp}`);
          hmVals.push(isActive ? 'Yes' : 'No');
          hp += 1;
        }
        const np = typeof hmIn.new_password === 'string' ? hmIn.new_password : '';
        if (np.length > 0) {
          if (np.length < 8) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              success: false,
              message: 'New password must be at least 8 characters.',
            });
          }
          const passwordHash = await bcrypt.hash(np, SALT_ROUNDS);
          hmSets.push(`password = $${hp}`);
          hmVals.push(passwordHash);
          hp += 1;
        }
        if (
          hmSets.length &&
          Object.prototype.hasOwnProperty.call(hmIn, 'active') &&
          (hmIn.active === true || hmIn.active === 'true')
        ) {
          const prevH = await client.query(
            `SELECT m.name, m.email, m.active, c.name AS company_name
             FROM manager m
             LEFT JOIN companies c ON c.id = m.company_id
             WHERE m.id = $1`,
            [hmId]
          );
          if (prevH.rows.length && prevH.rows[0].active !== true) {
            const pr = prevH.rows[0];
            const emailOut = Object.prototype.hasOwnProperty.call(hmIn, 'email')
              ? String(hmIn.email || '').trim()
              : String(pr.email || '').trim();
            const nameOut = Object.prototype.hasOwnProperty.call(hmIn, 'name')
              ? String(hmIn.name || '').trim()
              : String(pr.name || '').trim();
            if (emailOut && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailOut)) {
              managerJustActivated = {
                firstName: nameOut || 'there',
                email: emailOut,
                companyName: String(pr.company_name || '').trim() || 'your organization',
              };
            }
          }
        }
        if (hmSets.length) {
          hmVals.push(hmId);
          await client.query(
            `UPDATE manager SET ${hmSets.join(', ')} WHERE id = $${hp}`,
            hmVals
          );
        }
      }
    }

    await client.query('COMMIT');

    if (managerJustActivated) {
      try {
        await sendManagerAccountActivatedEmail(managerJustActivated);
      } catch (mailErr) {
        if (mailErr && mailErr.code === 'SMTP_NOT_CONFIGURED') {
          console.warn('Manager activation email skipped: SMTP not configured.');
        } else {
          console.error('Manager activation email error:', mailErr);
        }
      }
    }

    const c = await pool.query('SELECT * FROM companies WHERE id = $1', [id]);
    const hm = await pool.query(
      `SELECT id, company_id, name, surname, email, active, is_head_manager, created_at, project_onboard_name
       FROM manager WHERE company_id = $1
       ORDER BY ${primaryManagerOrderBy('')}
       LIMIT 1`,
      [id]
    );
    let userCountAfter = 0;
    try {
      userCountAfter = await countCompanySeats(pool, id);
    } catch (cntErr) {
      if (cntErr.code !== '42P01') throw cntErr;
    }
    return res.status(200).json({
      success: true,
      message: 'Company updated.',
      company: c.rows[0],
      user_count: userCountAfter,
      head_manager: hm.rows[0] ? mapHeadManagerRow(hm.rows[0]) : null,
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore */
    }
    console.error('platformAdmin updateCompany error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Update failed.' });
  } finally {
    client.release();
  }
}

/**
 * Run DELETE inside the current transaction.
 * Uses SAVEPOINT so that a failed statement (e.g. undefined table 42P01) does not
 * abort the whole transaction (PostgreSQL error 25P02).
 */
async function safeDelete(client, sql, params, savepointCounter) {
  const sp = `sp_platadm_${savepointCounter}`;
  await client.query(`SAVEPOINT ${sp}`);
  try {
    await client.query(sql, params);
    await client.query(`RELEASE SAVEPOINT ${sp}`);
  } catch (e) {
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    await client.query(`RELEASE SAVEPOINT ${sp}`);
    if (e.code === '42P01' || e.code === '42703') return;
    throw e;
  }
}

/**
 * DELETE /api/platform-admin/companies/:id
 * Best-effort cascade for related rows, then companies.
 */
async function deleteCompany(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid company id.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exists = await client.query('SELECT id FROM companies WHERE id = $1', [id]);
    if (!exists.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Company not found.' });
    }

    const cid = [id];
    let spn = 0;
    const runDel = (sql, params) => safeDelete(client, sql, params, ++spn);

    await runDel(
      `DELETE FROM operative_task_photos otp
       WHERE otp.task_source = 'planning' AND otp.task_id IN (
         SELECT t.id FROM planning_plan_tasks t
         INNER JOIN planning_plans p ON p.id = t.plan_id
         WHERE p.company_id = $1
       )`,
      cid
    );
    await runDel(
      `DELETE FROM planning_plan_tasks t USING planning_plans p
       WHERE t.plan_id = p.id AND p.company_id = $1`,
      cid
    );
    await runDel('DELETE FROM planning_plans WHERE company_id = $1', cid);

    await runDel(
      `DELETE FROM operative_task_photos
       WHERE task_source = 'legacy' AND task_id IN (
         SELECT tk.id FROM tasks tk
         INNER JOIN users u ON u.id = tk.user_id AND u.company_id = $1
       )`,
      cid
    );
    await runDel(
      'DELETE FROM tasks WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)',
      cid
    );
    await runDel(
      'DELETE FROM operative_task_photos WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)',
      cid
    );
    await runDel(
      'DELETE FROM work_hours WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)',
      cid
    );
    await runDel(
      'DELETE FROM issues WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)',
      cid
    );
    await runDel(
      'DELETE FROM uploads WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)',
      cid
    );
    await runDel('DELETE FROM work_logs WHERE company_id = $1', cid);

    await runDel('DELETE FROM material_consumption WHERE company_id = $1', cid);
    await runDel('DELETE FROM materials WHERE company_id = $1', cid);
    await runDel('DELETE FROM material_categories WHERE company_id = $1', cid);
    await runDel('DELETE FROM material_suppliers WHERE company_id = $1', cid);

    await runDel(
      `DELETE FROM project_assignments WHERE project_id IN (SELECT id FROM projects WHERE company_id = $1)`,
      cid
    );

    await runDel('DELETE FROM projects WHERE company_id = $1', cid);

    await runDel('DELETE FROM qa_supervisors WHERE company_id = $1', cid);
    await runDel('DELETE FROM qa_workers WHERE company_id = $1', cid);
    await runDel('DELETE FROM qa_templates WHERE company_id = $1', cid);

    await runDel('DELETE FROM users WHERE company_id = $1', cid);
    await runDel('DELETE FROM manager WHERE company_id = $1', cid);

    const deletedRow = await client.query('DELETE FROM companies WHERE id = $1 RETURNING id', cid);
    await client.query('COMMIT');
    if (!deletedRow.rows.length) {
      return res.status(404).json({ success: false, message: 'Company not found.' });
    }
    return res.status(200).json({
      success: true,
      message: 'Company deleted.',
      deleted_id: deletedRow.rows[0].id,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('platformAdmin deleteCompany error:', err);
    if (err.code === '23503') {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete company: related data still references it. Remove or reassign dependencies first.',
        detail: err.detail,
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to delete company.',
    });
  } finally {
    client.release();
  }
}

/** Billing status labels (Romanian UI) map to DB values */
const ALLOWED_BILLING_STATUS = ['paid_active', 'unpaid_suspended', 'unpaid_active'];

/**
 * Parse YYYY-MM-DD or ISO string to Date for plan_expires_at (noon UTC for date-only).
 * @param {unknown} v
 * @returns {Date|null} null clears expiry
 */
function parsePlanExpiresInput(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    return new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), 12, 0, 0));
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * PATCH /api/platform-admin/billing-subscriptions/:id
 * Body: { plan_expires_at?, payment_method?, billing_status? } — any subset
 */
async function updateBillingSubscription(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid company id.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const sets = [];
  const vals = [];
  let p = 1;

  if (Object.prototype.hasOwnProperty.call(body, 'plan_expires_at')) {
    const raw = body.plan_expires_at;
    if (raw === null || raw === '') {
      sets.push(`plan_expires_at = $${p}`);
      vals.push(null);
      p += 1;
    } else {
      const dt = parsePlanExpiresInput(raw);
      if (!dt) {
        return res.status(400).json({ success: false, message: 'Invalid plan_expires_at (use YYYY-MM-DD).' });
      }
      sets.push(`plan_expires_at = $${p}`);
      vals.push(dt);
      p += 1;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'payment_method')) {
    const pm =
      body.payment_method == null || body.payment_method === ''
        ? null
        : String(body.payment_method).trim();
    if (pm && pm.length > 80) {
      return res.status(400).json({ success: false, message: 'payment_method is too long.' });
    }
    sets.push(`payment_method = $${p}`);
    vals.push(pm);
    p += 1;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'billing_status')) {
    const st = String(body.billing_status || '').trim();
    if (!ALLOWED_BILLING_STATUS.includes(st)) {
      return res.status(400).json({
        success: false,
        message: `billing_status must be one of: ${ALLOWED_BILLING_STATUS.join(', ')}.`,
      });
    }
    sets.push(`billing_status = $${p}`);
    vals.push(st);
    p += 1;
  }

  if (!sets.length) {
    return res.status(400).json({ success: false, message: 'No billing fields to update.' });
  }

  vals.push(id);

  try {
    const r = await pool.query(
      `UPDATE companies SET ${sets.join(', ')} WHERE id = $${p}
       RETURNING id, name, subscription_plan, plan_purchased_at, plan_expires_at, payment_method, billing_status, created_at`,
      vals
    );
    if (!r.rows.length) {
      return res.status(404).json({ success: false, message: 'Company not found.' });
    }
    const row = r.rows[0];
    const expires = row.plan_expires_at ? new Date(row.plan_expires_at) : null;
    const now = new Date();
    return res.status(200).json({
      success: true,
      message: 'Billing updated.',
      subscription: {
        ...row,
        calendar_expired: !!(expires && expires.getTime() < now.getTime()),
      },
    });
  } catch (err) {
    if (err.code === '42703') {
      return res.status(503).json({
        success: false,
        message:
          'Billing columns missing. Run: scripts/alter_companies_billing_columns.sql',
      });
    }
    console.error('platformAdmin updateBillingSubscription error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Update failed.' });
  }
}

/**
 * GET /api/platform-admin/billing-subscriptions
 * Per-company plan, purchase window, expiry, payment method (for Billing & plans UI).
 */
async function listBillingSubscriptions(req, res) {
  try {
    const result = await pool.query(
      `SELECT
         c.id,
         c.name,
         c.subscription_plan,
         c.plan_purchased_at,
         c.plan_expires_at,
         c.payment_method,
         c.billing_status,
         c.created_at
       FROM companies c
       ORDER BY c.id ASC`
    );
    const now = new Date();
    const rows = (result.rows || []).map((row) => {
      const expires = row.plan_expires_at ? new Date(row.plan_expires_at) : null;
      const billingStatus = row.billing_status || 'unpaid_active';
      return {
        ...row,
        billing_status: billingStatus,
        calendar_expired: !!(expires && expires.getTime() < now.getTime()),
      };
    });
    return res.status(200).json({
      success: true,
      subscriptions: rows,
    });
  } catch (err) {
    if (err.code === '42703') {
      return res.status(503).json({
        success: false,
        message:
          'Billing columns are missing on companies. Run: scripts/alter_companies_billing_columns.sql',
      });
    }
    if (err.code === '42P01') {
      return res.status(503).json({ success: false, message: 'Companies table is missing.' });
    }
    console.error('platformAdmin listBillingSubscriptions error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load billing data.' });
  }
}

module.exports = {
  login,
  me,
  listCompanies,
  getCompany,
  updateCompany,
  deleteCompany,
  listBillingSubscriptions,
  updateBillingSubscription,
};
