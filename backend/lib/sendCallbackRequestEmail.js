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

  const html = `<p><strong>New callback request</strong> (See plans)</p>
<ul>
<li><strong>Name:</strong> ${escapeHtml(fullName)}</li>
<li><strong>Email:</strong> ${escapeHtml(email)}</li>
<li><strong>Phone:</strong> ${escapeHtml(phone)}</li>
</ul>`;

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

  const html = `<p><strong>New message</strong> (Contact Us)</p>
<ul>
<li><strong>Name:</strong> ${escapeHtml(name)}</li>
<li><strong>Company:</strong> ${escapeHtml(company)}</li>
<li><strong>Email:</strong> ${escapeHtml(email)}</li>
<li><strong>Phone:</strong> ${escapeHtml(phone)}</li>
<li><strong>Role:</strong> ${escapeHtml(role || '(not specified)')}</li>
</ul>
<p><strong>Message:</strong></p>
<p style="white-space:pre-wrap;">${escapeHtml(message)}</p>`;

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
