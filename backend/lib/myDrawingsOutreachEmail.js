/**
 * My Drawings prospect email + scheduled send queue.
 */

const { pool } = require('../db/pool');
const { createTransport } = require('./sendCallbackRequestEmail');

const PRESENTATION_URL = (
  process.env.MYDRAWINGS_PRESENTATION_URL || 'https://proconix.uk/mydrawings-prezentation'
).replace(/\/$/, '');
const PUBLIC_URL = (process.env.PROCONIX_PUBLIC_URL || 'https://proconix.uk').replace(/\/$/, '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function presentationUrl() {
  return PRESENTATION_URL.startsWith('http') ? PRESENTATION_URL : `${PUBLIC_URL}/mydrawings-prezentation`;
}

function buildMyDrawingsOutreachHtml() {
  const page = presentationUrl();
  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Stop building from outdated drawings</title>
</head>
<body style="margin:0;padding:0;background:#050508;color:#f4f7fb;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    The latest drawings and wall type specifications — on every worker’s phone.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#050508;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="padding:8px 8px 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.12em;color:#8d95a8;text-transform:uppercase;">
              Proconix · My Drawings
            </td>
          </tr>
          <tr>
            <td style="padding:0 8px 20px;font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:1.15;font-weight:700;color:#f4f7fb;">
              Stop building from outdated drawings.
            </td>
          </tr>
          <tr>
            <td style="padding:0 8px 28px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.5;color:#8d95a8;">
              How do you know your men are working from the latest drawing?
              My Drawings puts the current drawings and wall type specifications on every phone — online or offline.
            </td>
          </tr>
          <tr>
            <td style="padding:0 8px 28px;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="border-radius:999px;background:#f4f7fb;">
                    <a href="${page}" style="display:inline-block;padding:14px 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#050508;text-decoration:none;">
                      See My Drawings
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 8px 10px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#5c6478;">
              What changes on site
            </td>
          </tr>
          <tr>
            <td style="padding:0 8px 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#f4f7fb;">
              No more walking back to the cabin.<br>
              No more searching through folders.<br>
              No more building from yesterday’s print.
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#8d95a8;">
              Drawing → Wall Type → fire, acoustic, thickness, build-up.<br>
              A notification when a drawing is added or updated.<br>
              Works offline in basements, cores and lift shafts.<br>
              One company. Every site under control.
            </td>
          </tr>
          <tr>
            <td style="padding:28px 8px 8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#8d95a8;">
              On the App Store and Google Play.<br>
              <a href="${page}" style="color:#4d8cff;text-decoration:none;">${page.replace(/^https?:\/\//, '')}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 8px 0;border-top:1px solid rgba(220,232,255,0.08);font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#5c6478;">
              Proconix · info@proconix.uk<br>
              Reply to this email if you want a first site set up.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildMyDrawingsOutreachText() {
  const page = presentationUrl();
  return [
    'Stop building from outdated drawings.',
    '',
    'How do you know your men are working from the latest drawing?',
    'My Drawings puts the current drawings and wall type specifications on every phone — online or offline.',
    '',
    'See the product:',
    page,
    '',
    'No more walking back to the cabin.',
    'No more searching through folders.',
    'No more building from yesterday’s print.',
    '',
    'Drawing → Wall Type → fire, acoustic, thickness, build-up.',
    'A notification when a drawing is added or updated.',
    'Works offline. One company, every site under control.',
    '',
    'On the App Store and Google Play.',
    '',
    'Proconix · info@proconix.uk',
  ].join('\n');
}

async function sendMyDrawingsOutreachEmail({ to, adminEmail }) {
  const transport = createTransport();
  if (!transport) {
    const err = new Error('SMTP_HOST is not set; cannot send email.');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }
  const from = (process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@proconix.uk').trim();
  await transport.sendMail({
    from,
    to,
    replyTo: adminEmail || from,
    subject: 'Stop building from outdated drawings',
    text: buildMyDrawingsOutreachText(),
    html: buildMyDrawingsOutreachHtml(),
  });
}

async function ensureScheduleTable() {
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
}

async function queueMyDrawingsOutreach({ to, sendAt, adminEmail, adminName }) {
  const email = String(to || '').trim();
  if (!EMAIL_RE.test(email)) {
    const err = new Error('A valid client email is required.');
    err.status = 400;
    throw err;
  }
  const when = new Date(sendAt);
  if (Number.isNaN(when.getTime())) {
    const err = new Error('Choose a valid date and time.');
    err.status = 400;
    throw err;
  }
  const max = Date.now() + 366 * 24 * 60 * 60 * 1000;
  if (when.getTime() > max) {
    const err = new Error('Send time cannot be more than one year ahead.');
    err.status = 400;
    throw err;
  }

  await ensureScheduleTable();
  if (when.getTime() <= Date.now() + 20000) {
    await sendMyDrawingsOutreachEmail({ to: email, adminEmail });
    return { queued: false, sent: true, sendAt: when.toISOString() };
  }

  await pool.query(
    `INSERT INTO platform_scheduled_email
      (kind, to_email, send_at, status, admin_email, admin_name)
     VALUES ('mydrawings_outreach', $1, $2, 'pending', $3, $4)`,
    [email, when.toISOString(), adminEmail || '', adminName || '']
  );
  return { queued: true, sent: false, sendAt: when.toISOString() };
}

let flushing = false;
async function flushDueOutreachEmails() {
  if (flushing) return;
  flushing = true;
  try {
    await ensureScheduleTable();
    const due = await pool.query(
      `SELECT id, to_email, admin_email
       FROM platform_scheduled_email
       WHERE kind = 'mydrawings_outreach' AND status = 'pending' AND send_at <= NOW()
       ORDER BY send_at ASC
       LIMIT 20`
    );
    for (const row of due.rows) {
      try {
        await sendMyDrawingsOutreachEmail({ to: row.to_email, adminEmail: row.admin_email });
        await pool.query(
          `UPDATE platform_scheduled_email
           SET status = 'sent', sent_at = NOW(), error = NULL
           WHERE id = $1`,
          [row.id]
        );
      } catch (err) {
        await pool.query(
          `UPDATE platform_scheduled_email
           SET status = 'failed', error = $2
           WHERE id = $1`,
          [row.id, err && err.message ? String(err.message).slice(0, 400) : 'send failed']
        );
      }
    }
  } catch (err) {
    console.error('myDrawings outreach flush:', err && err.message ? err.message : err);
  } finally {
    flushing = false;
  }
}

function startMyDrawingsOutreachScheduler() {
  flushDueOutreachEmails().catch(() => {});
  setInterval(() => {
    flushDueOutreachEmails().catch(() => {});
  }, 30000);
}

module.exports = {
  EMAIL_RE,
  presentationUrl,
  buildMyDrawingsOutreachHtml,
  sendMyDrawingsOutreachEmail,
  queueMyDrawingsOutreach,
  startMyDrawingsOutreachScheduler,
};
