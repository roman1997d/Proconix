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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_email_contact_note (
      email TEXT PRIMARY KEY,
      note TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function cleanNote(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 400);
}

function cleanContactNote(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim().slice(0, 4000);
}

function normalizeContactEmail(value) {
  return String(value || '').trim().toLowerCase();
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
    contactNote: row.contact_note || '',
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
      LOWER(e.to_email) LIKE $${params.length}
      OR LOWER(COALESCE(e.payload->>'firstName', '')) LIKE $${params.length}
      OR LOWER(COALESCE(e.payload->>'lastName', '')) LIKE $${params.length}
      OR LOWER(COALESCE(e.payload->>'subject', '')) LIKE $${params.length}
      OR LOWER(COALESCE(n.note, '')) LIKE $${params.length}
    )`);
  }
  if (SEND_STATUSES.has(status)) {
    params.push(status);
    where.push(`e.status = $${params.length}`);
  }
  if (status === 'awaiting') {
    where.push(`e.status = 'sent' AND e.reply_status = 'none'`);
  }
  if (REPLY_STATUSES.has(reply)) {
    params.push(reply);
    where.push(`e.reply_status = $${params.length}`);
  }
  const rows = await pool.query(
    `SELECT e.id, e.kind, e.to_email, e.send_at, e.status, e.admin_email, e.admin_name, e.error,
            e.created_at, e.sent_at, e.payload, e.reply_status, e.reply_note, e.reply_at,
            COALESCE(n.note, '') AS contact_note
     FROM platform_scheduled_email e
     LEFT JOIN platform_email_contact_note n ON n.email = LOWER(e.to_email)
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY COALESCE(e.sent_at, e.send_at, e.created_at) DESC
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

async function upsertContactNote({ to, note }) {
  const email = normalizeContactEmail(to);
  if (!EMAIL_RE.test(email)) {
    const err = new Error('A valid contact email is required.');
    err.status = 400;
    throw err;
  }
  await ensureEmailHistoryTable();
  const text = cleanContactNote(note);
  if (!text) {
    await pool.query(`DELETE FROM platform_email_contact_note WHERE email = $1`, [email]);
    return { to: email, note: '' };
  }
  await pool.query(
    `INSERT INTO platform_email_contact_note (email, note, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (email) DO UPDATE SET note = EXCLUDED.note, updated_at = NOW()`,
    [email, text]
  );
  return { to: email, note: text };
}

async function deleteContact(to) {
  const email = normalizeContactEmail(to);
  if (!EMAIL_RE.test(email)) {
    const err = new Error('A valid contact email is required.');
    err.status = 400;
    throw err;
  }
  await ensureEmailHistoryTable();
  const emails = await pool.query(
    `DELETE FROM platform_scheduled_email
     WHERE LOWER(to_email) = $1
     RETURNING id`,
    [email]
  );
  const notes = await pool.query(
    `DELETE FROM platform_email_contact_note
     WHERE email = $1
     RETURNING email`,
    [email]
  );
  if (!emails.rowCount && !notes.rowCount) {
    const err = new Error('Contact not found.');
    err.status = 404;
    throw err;
  }
  return { to: email, removedEmails: emails.rowCount, removedNote: Boolean(notes.rowCount) };
}

module.exports = {
  EMAIL_RE,
  ensureEmailHistoryTable,
  recordCustomClientEmail,
  listEmailHistory,
  updateEmailReply,
  cancelScheduledEmail,
  upsertContactNote,
  deleteContact,
};
