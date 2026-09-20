/**
 * Platform admin email history (small CRM on Content & communications).
 */

const { pool } = require('../db/pool');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REPLY_STATUSES = new Set(['none', 'positive', 'negative']);
const SEND_STATUSES = new Set(['pending', 'sent', 'failed', 'cancelled']);

async function ensureEmailHistoryTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_scheduled_email (
      id SERIAL PRIMARY KEY,
      kind TEXT NOT NULL,
      to_email TEXT NOT NULL,
      send_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_email TEXT,
      admin_name TEXT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ
    )
  `);
  await pool.query(`ALTER TABLE platform_scheduled_email ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await pool.query(`ALTER TABLE platform_scheduled_email ADD COLUMN IF NOT EXISTS reply_status TEXT NOT NULL DEFAULT 'none'`);
  await pool.query(`ALTER TABLE platform_scheduled_email ADD COLUMN IF NOT EXISTS reply_note TEXT`);
  await pool.query(`ALTER TABLE platform_scheduled_email ADD COLUMN IF NOT EXISTS reply_at TIMESTAMPTZ`);
}

function cleanNote(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 400);
}

function mapRow(row) {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  const firstName = String(payload.firstName || payload.first_name || '').trim();
  const lastName = String(payload.lastName || payload.last_name || '').trim();
  const template = String(payload.template || (row.kind === 'custom' ? 'custom' : 'problem')).toLowerCase();
  return {
    id: row.id,
    kind: row.kind,
    to: row.to_email,
    name: [firstName, lastName].filter(Boolean).join(' '),
    firstName,
    lastName,
    template,
    subject: String(payload.subject || '').trim(),
    sendAt: row.send_at,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    status: row.status,
    error: row.error || '',
    adminEmail: row.admin_email || '',
    adminName: row.admin_name || '',
    replyStatus: row.reply_status || 'none',
    replyNote: row.reply_note || '',
    replyAt: row.reply_at,
  };
}

async function recordCustomClientEmail({ to, subject, adminEmail, adminName }) {
  const email = String(to || '').trim();
  if (!EMAIL_RE.test(email)) return null;
  await ensureEmailHistoryTable();
  const now = new Date().toISOString();
  const payload = { template: 'custom', subject: String(subject || '').trim().slice(0, 200) };
  const inserted = await pool.query(
    `INSERT INTO platform_scheduled_email
      (kind, to_email, send_at, status, admin_email, admin_name, payload, sent_at)
     VALUES ('custom', $1, $2, 'sent', $3, $4, $5::jsonb, $2)
     RETURNING id`,
    [email, now, adminEmail || '', adminName || '', JSON.stringify(payload)]
  );
  return inserted.rows[0] && inserted.rows[0].id;
}

async function listEmailHistory({ q, status, reply } = {}) {
  await ensureEmailHistoryTable();
  const params = [];
  const where = [];
  const query = String(q || '').trim().toLowerCase();
  if (query) {
    params.push(`%${query}%`);
    where.push(`(
      LOWER(to_email) LIKE $${params.length}
      OR LOWER(COALESCE(payload->>'firstName', '')) LIKE $${params.length}
      OR LOWER(COALESCE(payload->>'lastName', '')) LIKE $${params.length}
      OR LOWER(COALESCE(payload->>'subject', '')) LIKE $${params.length}
    )`);
  }
  if (SEND_STATUSES.has(status)) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  if (status === 'awaiting') {
    where.push(`status = 'sent' AND reply_status = 'none'`);
  }
  if (REPLY_STATUSES.has(reply)) {
    params.push(reply);
    where.push(`reply_status = $${params.length}`);
  }
  const rows = await pool.query(
    `SELECT id, kind, to_email, send_at, status, admin_email, admin_name, error,
            created_at, sent_at, payload, reply_status, reply_note, reply_at
     FROM platform_scheduled_email
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY COALESCE(sent_at, send_at, created_at) DESC
     LIMIT 200`,
    params
  );
  const counts = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
      COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
      COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
      COUNT(*) FILTER (WHERE status = 'sent' AND reply_status = 'none')::int AS awaiting,
      COUNT(*) FILTER (WHERE reply_status = 'positive')::int AS positive,
      COUNT(*) FILTER (WHERE reply_status = 'negative')::int AS negative
    FROM platform_scheduled_email
  `);
  return {
    items: rows.rows.map(mapRow),
    counts: counts.rows[0] || {},
  };
}

async function updateEmailReply({ id, replyStatus, replyNote }) {
  const num = parseInt(id, 10);
  if (!Number.isFinite(num) || num < 1) {
    const err = new Error('Invalid email history id.');
    err.status = 400;
    throw err;
  }
  const status = String(replyStatus || '').toLowerCase();
  if (!REPLY_STATUSES.has(status)) {
    const err = new Error('Reply must be none, positive or negative.');
    err.status = 400;
    throw err;
  }
  await ensureEmailHistoryTable();
  const note = replyNote === undefined ? null : cleanNote(replyNote);
  const result = await pool.query(
    `UPDATE platform_scheduled_email
     SET reply_status = $2,
         reply_note = CASE WHEN $3::text IS NULL THEN reply_note ELSE $3 END,
         reply_at = CASE WHEN $2 = 'none' THEN NULL ELSE NOW() END
     WHERE id = $1
     RETURNING id`,
    [num, status, note]
  );
  if (!result.rowCount) {
    const err = new Error('Email history row not found.');
    err.status = 404;
    throw err;
  }
  return { id: num, replyStatus: status, replyNote: note };
}

async function cancelScheduledEmail(id) {
  const num = parseInt(id, 10);
  if (!Number.isFinite(num) || num < 1) {
    const err = new Error('Invalid email history id.');
    err.status = 400;
    throw err;
  }
  await ensureEmailHistoryTable();
  const result = await pool.query(
    `UPDATE platform_scheduled_email
     SET status = 'cancelled', error = NULL
     WHERE id = $1 AND status = 'pending'
     RETURNING id`,
    [num]
  );
  if (!result.rowCount) {
    const err = new Error('Only a scheduled email that has not been sent can be cancelled.');
    err.status = 400;
    throw err;
  }
  return { id: num, status: 'cancelled' };
}

module.exports = {
  EMAIL_RE,
  ensureEmailHistoryTable,
  recordCustomClientEmail,
  listEmailHistory,
  updateEmailReply,
  cancelScheduledEmail,
};
