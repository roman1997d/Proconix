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

/**
 * Welcome email after company + manager onboarding (HTML + friendly English copy).
 */
function buildCompanyWelcomeEmailHtml(p) {
  const tokenDisplay = p.securityToken && p.securityToken !== '—' ? p.securityToken : '—';
  const intro =
    '<p style="margin:0 0 20px 0;font-size:16px;line-height:1.65;color:#e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    'Hi <strong style="color:#f8fafc;">' +
    escapeHtml(p.managerFirstName) +
    '</strong>, wonderful news — <strong style="color:#f8fafc;">' +
    escapeHtml(p.companyName) +
    '</strong> is now registered on Proconix! We are genuinely excited to have you on board and cannot wait to help your teams work smarter.</p>';

  const rows = [
    { label: 'Company created on', value: p.createdAtFormatted },
    { label: 'Plan selected', value: p.planLabel },
    { label: 'Company ID', value: p.companyId },
  ];
  const rowsHtml = rows
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

  const securityBox =
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:8px;">' +
    '<tr><td style="background-color:#0f172a;border-radius:10px;padding:20px 22px;border-left:4px solid #f59e0b;">' +
    '<span style="display:block;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#fcd34d;margin-bottom:10px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    'Security information · keep this safe' +
    '</span>' +
    '<p style="margin:0;font-size:15px;line-height:1.6;color:#e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    'Your <strong style="color:#f8fafc;">security token</strong> is: ' +
    '<span style="font-family:Consolas,Monaco,monospace;font-size:17px;font-weight:700;color:#fef3c7;letter-spacing:0.06em;">' +
    escapeHtml(tokenDisplay) +
    '</span></p>' +
    '<p style="margin:12px 0 0 0;font-size:14px;line-height:1.55;color:#94a3b8;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    "You will use this token whenever you contact Proconix support about your account, billing, or any changes — it helps us verify it is really you." +
    '</p></td></tr></table>';

  const nextSteps =
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;">' +
    '<tr><td style="background-color:#0f172a;border-radius:10px;padding:20px 22px;border-left:4px solid #2563eb;">' +
    '<span style="display:block;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#94a3b8;margin-bottom:10px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    'What happens next' +
    '</span>' +
    '<p style="margin:0;font-size:15px;line-height:1.65;color:#e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    'Your profile will be reviewed and approved by our platform team. If we need anything else, we will reach out at <strong style="color:#f8fafc;">' +
    escapeHtml(p.managerEmail) +
    '</strong> — the email you registered with.' +
    '</p></td></tr></table>';

  const thankYou =
    '<p style="margin:24px 0 0 0;font-size:15px;line-height:1.65;color:#cbd5e1;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    "Thank you for choosing <strong style=\"color:#f8fafc;\">Proconix</strong> — we are cheering for your next project win." +
    '</p>';

  const signature =
    '<p style="margin:24px 0 0 0;font-size:15px;line-height:1.6;color:#e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    'Kindest regards,<br>' +
    '<strong style="color:#f8fafc;font-size:16px;">Roman Demian</strong><br>' +
    '<span style="color:#94a3b8;font-size:14px;">CEO &amp; Founder, Proconix</span></p>';

  const footer =
    '<p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;">You received this because you completed company registration on Proconix.</p>';

  return (
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
    '<meta http-equiv="x-ua-compatible" content="ie=edge"></head><body style="margin:0;padding:0;background-color:#020617;">' +
    '<div style="display:none;font-size:1px;color:#020617;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">' +
    escapeHtml(`${p.companyName} is registered on Proconix — here are your details`) +
    '</div>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#020617;padding:32px 16px;">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);">' +
    '<tr><td style="height:4px;background-color:#22c55e;font-size:0;line-height:0;">&nbsp;</td></tr>' +
    '<tr><td style="padding:28px 32px 8px 32px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    '<span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;">' +
    'Welcome aboard' +
    '</span>' +
    '<h1 style="margin:12px 0 0 0;font-size:24px;font-weight:700;line-height:1.25;color:#f8fafc;letter-spacing:-0.02em;">' +
    'Your company is officially on Proconix' +
    '</h1></td></tr>' +
    '<tr><td style="padding:8px 32px 0 32px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    intro +
    '</td></tr>' +
    '<tr><td style="padding:16px 32px 8px 32px;">' +
    '<p style="margin:0 0 8px 0;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">Your registration details</p>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0">' +
    rowsHtml +
    '</table>' +
    securityBox +
    nextSteps +
    thankYou +
    signature +
    '</td></tr>' +
    '<tr><td style="padding:16px 32px 24px 32px;border-top:1px solid #334155;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    footer +
    '</td></tr></table></td></tr></table></body></html>'
  );
}

/**
 * Head manager account activated by platform admin — full access + nudge to create first project.
 * @param {{ firstName: string, email: string, companyName: string }} p
 */
function buildManagerActivatedEmailHtml(p) {
  const intro =
    '<p style="margin:0 0 18px 0;font-size:16px;line-height:1.65;color:#e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    'Hi <strong style="color:#f8fafc;">' +
    escapeHtml(p.firstName) +
    '</strong>, wonderful news — your manager account for <strong style="color:#f8fafc;">' +
    escapeHtml(p.companyName) +
    '</strong> is now <strong style="color:#4ade80;">active</strong>. You can sign in and start exploring everything Proconix has to offer.</p>';

  const access =
    '<p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#cbd5e1;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    'You now have <strong style="color:#f8fafc;">full access to the platform</strong> and <strong style="color:#f8fafc;">all modules</strong> included in your plan: projects and team assignments, work logs, quality assurance, planning, materials, site snags, and your company dashboard — everything is ready when you are.</p>';

  const modulesBox =
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:4px;">' +
    '<tr><td style="background-color:#0f172a;border-radius:10px;padding:18px 20px;border-left:4px solid #8b5cf6;">' +
    '<span style="display:block;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#c4b5fd;margin-bottom:12px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    'What you can use from day one' +
    '</span>' +
    '<ul style="margin:0;padding:0 0 0 18px;color:#e2e8f0;font-size:14px;line-height:1.7;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    '<li>Projects &amp; operative assignments</li>' +
    '<li>Work logs &amp; approvals</li>' +
    '<li>Quality assurance workflows</li>' +
    '<li>Task &amp; planning</li>' +
    '<li>Material management</li>' +
    '<li>Site snags</li>' +
    '</ul></td></tr></table>';

  const projectNudge =
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;">' +
    '<tr><td style="background-color:#0f172a;border-radius:10px;padding:20px 22px;border-left:4px solid #22c55e;">' +
    '<span style="display:block;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#86efac;margin-bottom:10px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    'First things first' +
    '</span>' +
    '<p style="margin:0;font-size:15px;line-height:1.65;color:#e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    'Before anything else, <strong style="color:#f8fafc;">create your first project</strong> from the dashboard. Projects tie your sites, teams, and daily work together — it is the step that really brings Proconix to life for your company.</p>' +
    '<p style="margin:12px 0 0 0;font-size:14px;line-height:1.55;color:#94a3b8;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    'Log in, open <strong style="color:#cbd5e1;">Projects</strong>, and add one site or job — you can refine details anytime.</p>' +
    '</td></tr></table>';

  const thankYou =
    '<p style="margin:24px 0 0 0;font-size:15px;line-height:1.65;color:#cbd5e1;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    'We are glad you are here. If you have questions, just reply to this email — we are happy to help.' +
    '</p>';

  const signature =
    '<p style="margin:24px 0 0 0;font-size:15px;line-height:1.6;color:#e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    'Kindest regards,<br>' +
    '<strong style="color:#f8fafc;font-size:16px;">Roman Demian</strong><br>' +
    '<span style="color:#94a3b8;font-size:14px;">CEO &amp; Founder, Proconix</span></p>';

  const footer =
    '<p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;">You received this because your Proconix manager account was activated.</p>';

  return (
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
    '<meta http-equiv="x-ua-compatible" content="ie=edge"></head><body style="margin:0;padding:0;background-color:#020617;">' +
    '<div style="display:none;font-size:1px;color:#020617;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">' +
    escapeHtml(`Your Proconix account is active — sign in and create your first project`) +
    '</div>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#020617;padding:32px 16px;">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);">' +
    '<tr><td style="height:4px;background-color:#8b5cf6;font-size:0;line-height:0;">&nbsp;</td></tr>' +
    '<tr><td style="padding:28px 32px 8px 32px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    '<span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;">' +
    'Account active' +
    '</span>' +
    '<h1 style="margin:12px 0 0 0;font-size:24px;font-weight:700;line-height:1.25;color:#f8fafc;letter-spacing:-0.02em;">' +
    'Welcome to the platform — you are all set' +
    '</h1></td></tr>' +
    '<tr><td style="padding:8px 32px 28px 32px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    intro +
    access +
    modulesBox +
    projectNudge +
    thankYou +
    signature +
    '</td></tr>' +
    '<tr><td style="padding:16px 32px 24px 32px;border-top:1px solid #334155;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    footer +
    '</td></tr></table></td></tr></table></body></html>'
  );
}

/**
 * Sent when platform admin sets head manager active from false to true.
 * @param {{ firstName: string, email: string, companyName: string }} p
 */
async function sendManagerAccountActivatedEmail(p) {
  const to = String(p.email || '').trim();
  if (!to) return;

  const from = (process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@proconix.uk').trim();
  const transport = createTransport();
  if (!transport) {
    const err = new Error('SMTP_HOST is not set; cannot send activation email.');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }

  const subject = 'Your Proconix account is active — welcome aboard!';
  const text = [
    `Hi ${p.firstName},`,
    '',
    `Great news — your manager account for "${p.companyName}" is now active. You can sign in and use the full platform.`,
    '',
    'You have access to all modules in your plan: projects, work logs, quality assurance, planning, materials, site snags, and your dashboard.',
    '',
    'First things first: create your first project from the dashboard. That connects your sites, teams, and daily work — it is what really brings Proconix to life.',
    '',
    'We are glad you are here. Reply to this email if you need help.',
    '',
    'Kindest regards,',
    'Roman Demian',
    'CEO & Founder, Proconix',
  ].join('\n');

  const html = buildManagerActivatedEmailHtml({
    firstName: p.firstName,
    companyName: p.companyName,
  });

  const replyTo = (process.env.SUPPORT_REPLY_EMAIL || process.env.CALLBACK_NOTIFY_EMAIL || '').trim() || undefined;
  const bccRaw = (process.env.COMPANY_WELCOME_BCC_EMAIL || 'rdemian732@gmail.com').trim();
  const bcc = bccRaw && to.toLowerCase() !== bccRaw.toLowerCase() ? bccRaw : undefined;

  await transport.sendMail({
    from,
    to,
    ...(bcc ? { bcc } : {}),
    replyTo: replyTo || from,
    subject,
    text,
    html,
  });
}

/**
 * Operative / supervisor invited by a manager — temporary password email.
 * @param {{
 *   firstName: string,
 *   email: string,
 *   temporaryPassword: string,
 *   managerName: string,
 *   companyName: string,
 *   role: string,
 *   isSupervisor: boolean
 * }} p
 */
function buildOperativeWelcomeEmailHtml(p) {
  const roleLabel = p.isSupervisor ? 'Supervisor' : p.role;
  const intro =
    '<p style="margin:0 0 18px 0;font-size:16px;line-height:1.65;color:#e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    'Hi <strong style="color:#f8fafc;">' +
    escapeHtml(p.firstName) +
    '</strong>, you have been registered on <strong style="color:#f8fafc;">Proconix</strong> by <strong style="color:#f8fafc;">' +
    escapeHtml(p.managerName) +
    '</strong> at <strong style="color:#f8fafc;">' +
    escapeHtml(p.companyName) +
    '</strong> in the role of <strong style="color:#38bdf8;">' +
    escapeHtml(roleLabel) +
    '</strong>.</p>';

  const credsBox =
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:8px;">' +
    '<tr><td style="background-color:#0f172a;border-radius:10px;padding:20px 22px;border-left:4px solid #f59e0b;">' +
    '<span style="display:block;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#fcd34d;margin-bottom:14px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    'Your temporary sign-in details' +
    '</span>' +
    '<p style="margin:0 0 12px 0;font-size:14px;color:#94a3b8;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">Email</p>' +
    '<p style="margin:0 0 16px 0;font-size:16px;font-weight:600;color:#f1f5f9;font-family:Consolas,Monaco,monospace;">' +
    escapeHtml(p.email) +
    '</p>' +
    '<p style="margin:0 0 12px 0;font-size:14px;color:#94a3b8;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">Temporary password</p>' +
    '<p style="margin:0;font-size:18px;font-weight:700;letter-spacing:0.04em;color:#fef3c7;font-family:Consolas,Monaco,monospace;">' +
    escapeHtml(p.temporaryPassword) +
    '</p></td></tr></table>';

  const nextStep =
    '<p style="margin:22px 0 0 0;font-size:15px;line-height:1.65;color:#cbd5e1;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    'Please <strong style="color:#f8fafc;">sign in using the temporary password above</strong>. On first login you will be asked to <strong style="color:#f8fafc;">set your own password</strong> — choose something memorable and keep it private.</p>';

  const support =
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;">' +
    '<tr><td style="background-color:#0f172a;border-radius:10px;padding:18px 20px;border-left:4px solid #2563eb;">' +
    '<span style="display:block;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#94a3b8;margin-bottom:10px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    'Need help?' +
    '</span>' +
    '<p style="margin:0;font-size:15px;line-height:1.65;color:#e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    'Our in-app chat is available in <strong style="color:#f8fafc;">English</strong>, <strong style="color:#f8fafc;">Romanian</strong>, and <strong style="color:#f8fafc;">Russian</strong>. You can also email us at ' +
    '<a href="mailto:info@proconix.com" style="color:#38bdf8;text-decoration:none;">info@proconix.com</a>.</p>' +
    '</td></tr></table>';

  const thankYou =
    '<p style="margin:24px 0 0 0;font-size:15px;line-height:1.65;color:#cbd5e1;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    'Thank you for choosing Proconix — we are glad to have you on the team.' +
    '</p>';

  const signature =
    '<p style="margin:24px 0 0 0;font-size:15px;line-height:1.6;color:#e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    'Kindest regards,<br>' +
    '<strong style="color:#f8fafc;font-size:16px;">Roman Demian</strong><br>' +
    '<span style="color:#94a3b8;font-size:14px;">Founder &amp; CEO, Proconix</span></p>';

  const footer =
    '<p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;">This message was sent because a company manager added you to Proconix.</p>';

  return (
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
    '<meta http-equiv="x-ua-compatible" content="ie=edge"></head><body style="margin:0;padding:0;background-color:#020617;">' +
    '<div style="display:none;font-size:1px;color:#020617;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">' +
    escapeHtml(`Your Proconix login details — sign in with your temporary password`) +
    '</div>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#020617;padding:32px 16px;">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);">' +
    '<tr><td style="height:4px;background-color:#0ea5e9;font-size:0;line-height:0;">&nbsp;</td></tr>' +
    '<tr><td style="padding:28px 32px 8px 32px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    '<span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;">' +
    'Team invitation' +
    '</span>' +
    '<h1 style="margin:12px 0 0 0;font-size:24px;font-weight:700;line-height:1.25;color:#f8fafc;letter-spacing:-0.02em;">' +
    'You are invited to Proconix' +
    '</h1></td></tr>' +
    '<tr><td style="padding:8px 32px 28px 32px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    intro +
    credsBox +
    nextStep +
    support +
    thankYou +
    signature +
    '</td></tr>' +
    '<tr><td style="padding:16px 32px 24px 32px;border-top:1px solid #334155;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    footer +
    '</td></tr></table></td></tr></table></body></html>'
  );
}

/**
 * @param {{
 *   firstName: string,
 *   email: string,
 *   temporaryPassword: string,
 *   managerName: string,
 *   companyName: string,
 *   role: string,
 *   isSupervisor: boolean
 * }} p
 */
async function sendOperativeWelcomeEmail(p) {
  const to = String(p.email || '').trim();
  if (!to) return;

  const from = (process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@proconix.uk').trim();
  const transport = createTransport();
  if (!transport) {
    const err = new Error('SMTP_HOST is not set; cannot send operative welcome email.');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }

  const roleLabel = p.isSupervisor ? 'Supervisor' : p.role;
  const subject = 'Welcome to Proconix — your temporary login details';
  const text = [
    `Hi ${p.firstName},`,
    '',
    `You have been registered on Proconix by ${p.managerName} at ${p.companyName} in the role of ${roleLabel}.`,
    '',
    'Temporary sign-in details:',
    `Email: ${p.email}`,
    `Temporary password: ${p.temporaryPassword}`,
    '',
    'Sign in with the temporary password first. You will then be prompted to set your own password.',
    '',
    'Need help? Our in-app chat supports English, Romanian, and Russian. You can also email info@proconix.com.',
    '',
    'Thank you for choosing Proconix.',
    '',
    'Kindest regards,',
    'Roman Demian',
    'Founder & CEO, Proconix',
  ].join('\n');

  const html = buildOperativeWelcomeEmailHtml({
    firstName: p.firstName,
    email: p.email,
    temporaryPassword: p.temporaryPassword,
    managerName: p.managerName,
    companyName: p.companyName,
    role: p.role,
    isSupervisor: p.isSupervisor,
  });

  const replyTo = (process.env.SUPPORT_REPLY_EMAIL || process.env.CALLBACK_NOTIFY_EMAIL || '').trim() || undefined;
  const bccRaw = (process.env.COMPANY_WELCOME_BCC_EMAIL || 'rdemian732@gmail.com').trim();
  const bcc = bccRaw && to.toLowerCase() !== bccRaw.toLowerCase() ? bccRaw : undefined;

  await transport.sendMail({
    from,
    to,
    ...(bcc ? { bcc } : {}),
    replyTo: replyTo || from,
    subject,
    text,
    html,
  });
}

/**
 * @param {{
 *   managerFirstName: string,
 *   managerEmail: string,
 *   companyName: string,
 *   planLabel: string,
 *   companyId: string,
 *   securityToken: string,
 *   createdAtFormatted: string
 * }} p
 */
async function sendCompanyWelcomeEmail(p) {
  const to = String(p.managerEmail || '').trim();
  if (!to) return;

  const from = (process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@proconix.uk').trim();
  const transport = createTransport();
  if (!transport) {
    const err = new Error('SMTP_HOST is not set; cannot send welcome email.');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }

  const subject = `Welcome to Proconix — ${p.companyName} is registered!`;
  const text = [
    `Hi ${p.managerFirstName},`,
    '',
    `Great news — "${p.companyName}" is now registered on Proconix! We are excited to have you with us.`,
    '',
    'Here are your registration details:',
    `- Company created on: ${p.createdAtFormatted}`,
    `- Plan selected: ${p.planLabel}`,
    `- Company ID: ${p.companyId}`,
    '',
    'Security information:',
    `Your security token is: ${p.securityToken}`,
    "Keep it safe — you'll need it when contacting Proconix support about your account or any changes.",
    '',
    'What happens next:',
    `Your profile will be reviewed and approved by our platform team. If we need anything, we will reach out at ${p.managerEmail}.`,
    '',
    'Thank you for choosing Proconix!',
    '',
    'Kindest regards,',
    'Roman Demian',
    'CEO & Founder, Proconix',
  ].join('\n');

  const html = buildCompanyWelcomeEmailHtml({
    managerFirstName: p.managerFirstName,
    companyName: p.companyName,
    createdAtFormatted: p.createdAtFormatted,
    planLabel: p.planLabel,
    companyId: p.companyId,
    securityToken: p.securityToken,
    managerEmail: p.managerEmail,
  });

  const replyTo = (process.env.SUPPORT_REPLY_EMAIL || process.env.CALLBACK_NOTIFY_EMAIL || '').trim() || undefined;

  const bccRaw = (process.env.COMPANY_WELCOME_BCC_EMAIL || 'rdemian732@gmail.com').trim();
  const bcc =
    bccRaw && to.toLowerCase() !== bccRaw.toLowerCase() ? bccRaw : undefined;

  await transport.sendMail({
    from,
    to,
    ...(bcc ? { bcc } : {}),
    replyTo: replyTo || from,
    subject,
    text,
    html,
  });
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

module.exports = {
  sendCallbackRequestEmail,
  sendContactUsEmail,
  sendCompanyWelcomeEmail,
  sendManagerAccountActivatedEmail,
  sendOperativeWelcomeEmail,
  createTransport,
};
