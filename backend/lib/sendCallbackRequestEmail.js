/**
 * Send "Request a callback" notification (default recipient: rdemian732@gmail.com).
 * Requires SMTP_* in .env (see .env.example).
 */

const nodemailer = require('nodemailer');

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Modern branded HTML for mail clients (table layout + inline CSS).
 * @param {{
 *   preheader: string,
 *   badge: string,
 *   title: string,
 *   subtitle: string,
 *   rows: { label: string, value: string }[],
 *   messageBlock?: { title: string, text: string }
 * }} o
 */
function buildProconixEmailHtml(o) {
  var rowsHtml = o.rows
    .map(function (r) {
      return (
        '<tr><td style="padding:14px 0;border-bottom:1px solid #334155;vertical-align:top;">' +
        '<span style="display:block;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#94a3b8;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
        escapeHtml(r.label) +
        '</span>' +
        '<span style="display:block;margin-top:6px;font-size:16px;line-height:1.45;color:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
        escapeHtml(r.value) +
        '</span></td></tr>'
      );
    })
    .join('');

  var msgBlock = '';
  if (o.messageBlock) {
    msgBlock =
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;">' +
      '<tr><td style="background-color:#0f172a;border-radius:10px;padding:20px 22px;border-left:4px solid #2563eb;">' +
      '<span style="display:block;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#94a3b8;margin-bottom:10px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
      escapeHtml(o.messageBlock.title) +
      '</span>' +
      '<p style="margin:0;font-size:15px;line-height:1.6;color:#e2e8f0;white-space:pre-wrap;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
      escapeHtml(o.messageBlock.text) +
      '</p></td></tr></table>';
  }

  return (
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
    '<meta http-equiv="x-ua-compatible" content="ie=edge"></head><body style="margin:0;padding:0;background-color:#020617;">' +
    '<div style="display:none;font-size:1px;color:#020617;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">' +
    escapeHtml(o.preheader) +
    '</div>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#020617;padding:32px 16px;">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);">' +
    '<tr><td style="height:4px;background-color:#2563eb;font-size:0;line-height:0;">&nbsp;</td></tr>' +
    '<tr><td style="padding:28px 32px 8px 32px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    '<span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;">' +
    escapeHtml(o.badge) +
    '</span>' +
    '<h1 style="margin:12px 0 8px 0;font-size:24px;font-weight:700;line-height:1.25;color:#f8fafc;letter-spacing:-0.02em;">' +
    escapeHtml(o.title) +
    '</h1>' +
    '<p style="margin:0 0 24px 0;font-size:15px;line-height:1.55;color:#94a3b8;">' +
    escapeHtml(o.subtitle) +
    '</p></td></tr>' +
    '<tr><td style="padding:0 32px 32px 32px;">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0">' +
    rowsHtml +
    '</table>' +
    msgBlock +
    '</td></tr>' +
    '<tr><td style="padding:16px 32px 24px 32px;border-top:1px solid #334155;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    '<p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;">· <strong style="color:#94a3b8;">Proconix</strong> — construction workflow platform</p>' +
    '<p style="margin:8px 0 0 0;font-size:12px;color:#475569;">Use <strong style="color:#94a3b8;">Reply</strong> to respond directly to the sender.</p>' +
    '</td></tr></table></td></tr></table></body></html>'
  );
}

function createTransport() {
  const host = process.env.SMTP_HOST;
  if (!host || !String(host).trim()) {
    return null;
  }
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure =
    process.env.SMTP_SECURE === 'true' ||
    process.env.SMTP_SECURE === '1' ||
    String(port) === '465';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS != null ? String(process.env.SMTP_PASS) : '';
  return nodemailer.createTransport({
    host: host.trim(),
    port,
    secure,
    auth: user && String(user).trim() ? { user: user.trim(), pass } : undefined,
  });
}

/**
 * @param {{ fullName: string, email: string, phone: string }} payload
 * @returns {Promise<void>}
 */
async function sendCallbackRequestEmail(payload) {
  const { fullName, email, phone } = payload;
  const to = (process.env.CALLBACK_NOTIFY_EMAIL || 'rdemian732@gmail.com').trim();
  const from = (process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@proconix.uk').trim();

  const transport = createTransport();
  if (!transport) {
    const err = new Error('SMTP_HOST is not set; cannot send callback email.');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }

  const subject = `Proconix — Callback request from ${fullName}`;
  const text = [
    'New callback request (See plans / Request a Callback form)',
    '',
    `Name: ${fullName}`,
    `Email: ${email}`,
    `Phone: ${phone}`,
  ].join('\n');

  const html = buildProconixEmailHtml({
    preheader: `${fullName} requested a callback — ${phone}`,
    badge: 'Plans · Request a callback',
    title: 'Someone asked for a callback',
    subtitle: 'Details from the See plans page form. Reply to this email to reach them at their address.',
    rows: [
      { label: 'Full name', value: fullName },
      { label: 'Email', value: email },
      { label: 'Phone', value: phone },
    ],
  });

  await transport.sendMail({
    from,
    to,
    replyTo: email,
    subject,
    text,
    html,
  });
}

/**
 * Contact Us page form → same inbox as callback (CALLBACK_NOTIFY_EMAIL / rdemian732@gmail.com).
 * @param {{ name: string, company: string, email: string, phone: string, role: string, message: string }} payload
 */
async function sendContactUsEmail(payload) {
  const { name, company, email, phone, role, message } = payload;
  const to = (process.env.CALLBACK_NOTIFY_EMAIL || 'rdemian732@gmail.com').trim();
  const from = (process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@proconix.uk').trim();

  const transport = createTransport();
  if (!transport) {
    const err = new Error('SMTP_HOST is not set; cannot send contact form email.');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }

  const roleLine = role ? `Role: ${role}` : 'Role: (not specified)';
  const subject = `Proconix — Contact form from ${name}`;
  const text = [
    'New message (Contact Us page)',
    '',
    `Name: ${name}`,
    `Company: ${company}`,
    `Email: ${email}`,
    `Phone: ${phone}`,
    roleLine,
    '',
    'Message:',
    message,
  ].join('\n');

  const roleDisplay = role || 'Not specified';
  const html = buildProconixEmailHtml({
    preheader: `${name} · ${company} — new Contact form message`,
    badge: 'Website · Contact us',
    title: 'New message from your site',
    subtitle:
      'Submitted via the Contact Us page. Summary below — the full note is in the highlighted block.',
    rows: [
      { label: 'Full name', value: name },
      { label: 'Company', value: company },
      { label: 'Work email', value: email },
      { label: 'Phone', value: phone },
      { label: 'Role', value: roleDisplay },
    ],
    messageBlock: { title: 'How can we help?', text: message },
  });

  await transport.sendMail({
    from,
    to,
    replyTo: email,
    subject,
    text,
    html,
  });
}

module.exports = { sendCallbackRequestEmail, sendContactUsEmail, createTransport };
