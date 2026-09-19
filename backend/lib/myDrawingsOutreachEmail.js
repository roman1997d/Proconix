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

function registerUrl() {
  return `${PUBLIC_URL}/companystart`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cleanName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function personName(firstName, lastName) {
  return [cleanName(firstName), cleanName(lastName)].filter(Boolean).join(' ');
}

function normalizeTemplate(value) {
  return String(value || '').toLowerCase() === 'familiar' ? 'familiar' : 'problem';
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

function buildFamiliarOutreachHtml(firstName, lastName) {
  const page = presentationUrl();
  const join = registerUrl();
  const name = personName(firstName, lastName) || 'echipă';
  const safeName = escapeHtml(name);
  return `<!DOCTYPE html>
<html lang="ro">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>My Drawings — o soluție pentru șantier</title>
</head>
<body style="margin:0;padding:0;background:#f4f1ea;color:#2a241c;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    Bună, ${safeName}. Din propria experiență știm cât de greu e paperwork-ul de pe șantier.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1ea;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fffdf8;border-radius:16px;">
          <tr>
            <td style="padding:28px 28px 8px;font-family:Georgia,Times,serif;font-size:13px;color:#8a7d6b;">
              Proconix · My Drawings
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 18px;font-family:Georgia,Times,serif;font-size:26px;line-height:1.3;color:#2a241c;">
              Bună, ${safeName},
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#4a4338;">
              Din propria experiență înțelegem cât este de dificil să ții echipa pe ultima revizie:
              printuri în cabină, foldere de PDF-uri, paperwork pe șantier și oameni care întreabă
              „care drawing e cel bun?”.
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#4a4338;">
              Venim cu o soluție foarte bună, creată special pentru muncitorii de șantier.
              Noi vrem să le ușurăm partea de paperwork: My Drawings le pune desenele
              și specificațiile de wall type pe telefon — nu le adaugă încă o corvoadă.
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#4a4338;">
              Aplicația ajută la: ultima revizie pe telefon, Wall Types lângă drawing,
              notificare când un drawing e adăugat sau actualizat, și lucru offline
              când semnalul dispare în subsol sau în core.
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 22px;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="border-radius:999px;background:#2a241c;">
                    <a href="${page}" style="display:inline-block;padding:12px 20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#fffdf8;text-decoration:none;">
                      Pagina de prezentare
                    </a>
                  </td>
                  <td width="10"></td>
                  <td style="border-radius:999px;border:1px solid #2a241c;">
                    <a href="${join}" style="display:inline-block;padding:12px 20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#2a241c;text-decoration:none;">
                      Înregistrare
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#4a4338;">
              Dacă sunteți interesat, puteți vizualiza pagina noastră de prezentare
              sau mergeți direct la înregistrare.
              Aplicația este <strong>gratis pentru clienții noi</strong> — nu pierdeți nimic, doar câștigați.
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 8px;font-family:Georgia,Times,serif;font-size:18px;line-height:1.5;color:#2a241c;">
              Vom fi bucuroși să vă avem alături.
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#8a7d6b;">
              <a href="mailto:info@proconix.uk" style="color:#2a241c;text-decoration:none;">info@proconix.uk</a><br>
              <a href="${page}" style="color:#8a7d6b;">${page.replace(/^https?:\/\//, '')}</a>
              ·
              <a href="${join}" style="color:#8a7d6b;">${join.replace(/^https?:\/\//, '')}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildFamiliarOutreachText(firstName, lastName) {
  const page = presentationUrl();
  const join = registerUrl();
  const name = personName(firstName, lastName) || 'echipă';
  return [
    `Bună, ${name},`,
    '',
    'Din propria experiență înțelegem cât este de dificil să ții echipa pe ultima revizie: printuri în cabină, foldere de PDF-uri, paperwork pe șantier.',
    '',
    'Venim cu o soluție foarte bună, creată special pentru muncitorii de șantier. Vrem să le ușurăm partea de paperwork: My Drawings le pune desenele și wall type-urile pe telefon.',
    '',
    'Ajută la ultima revizie pe telefon, Wall Types lângă drawing, notificare la update și lucru offline.',
    '',
    'Pagina de prezentare:',
    page,
    '',
    'Înregistrare:',
    join,
    '',
    'Aplicația este gratis pentru clienții noi — nu pierdeți nimic, doar câștigați.',
    '',
    'Vom fi bucuroși să vă avem alături.',
    '',
    'info@proconix.uk',
  ].join('\n');
}

async function sendMyDrawingsOutreachEmail({ to, adminEmail, template, firstName, lastName }) {
  const transport = createTransport();
  if (!transport) {
    const err = new Error('SMTP_HOST is not set; cannot send email.');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }
  const from = (process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@proconix.uk').trim();
  const familiar = normalizeTemplate(template) === 'familiar';
  await transport.sendMail({
    from,
    to,
    replyTo: familiar ? 'info@proconix.uk' : (adminEmail || 'info@proconix.uk'),
    subject: familiar
      ? 'My Drawings — o soluție pentru paperwork-ul de pe șantier'
      : 'Stop building from outdated drawings',
    text: familiar
      ? buildFamiliarOutreachText(firstName, lastName)
      : buildMyDrawingsOutreachText(),
    html: familiar
      ? buildFamiliarOutreachHtml(firstName, lastName)
      : buildMyDrawingsOutreachHtml(),
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
  await pool.query(`ALTER TABLE platform_scheduled_email ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb`);
}

async function queueMyDrawingsOutreach({ to, sendAt, adminEmail, adminName, template, firstName, lastName }) {
  const email = String(to || '').trim();
  if (!EMAIL_RE.test(email)) {
    const err = new Error('A valid client email is required.');
    err.status = 400;
    throw err;
  }
  const tpl = normalizeTemplate(template);
  const first = cleanName(firstName);
  const last = cleanName(lastName);
  if (tpl === 'familiar' && (!first || !last)) {
    const err = new Error('First name and last name are required for template 2.');
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
    await sendMyDrawingsOutreachEmail({
      to: email,
      adminEmail,
      template: tpl,
      firstName: first,
      lastName: last,
    });
    return { queued: false, sent: true, sendAt: when.toISOString() };
  }

  const payload = { template: tpl, firstName: first, lastName: last };
  await pool.query(
    `INSERT INTO platform_scheduled_email
      (kind, to_email, send_at, status, admin_email, admin_name, payload)
     VALUES ('mydrawings_outreach', $1, $2, 'pending', $3, $4, $5::jsonb)`,
    [email, when.toISOString(), adminEmail || '', adminName || '', JSON.stringify(payload)]
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
      `SELECT id, to_email, admin_email, payload
       FROM platform_scheduled_email
       WHERE kind = 'mydrawings_outreach' AND status = 'pending' AND send_at <= NOW()
       ORDER BY send_at ASC
       LIMIT 20`
    );
    for (const row of due.rows) {
      try {
        const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
        await sendMyDrawingsOutreachEmail({
          to: row.to_email,
          adminEmail: row.admin_email,
          template: payload.template,
          firstName: payload.firstName,
          lastName: payload.lastName,
        });
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
  buildFamiliarOutreachHtml,
};
