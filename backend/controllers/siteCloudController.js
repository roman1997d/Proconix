const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('../db/pool');
const { UPLOADS_ROOT } = require('../middleware/resolveCompanyDocsDir');
const { createTransport } = require('../lib/sendCallbackRequestEmail');

const MAX_FILES_PER_TENANT = parseInt(process.env.SITE_CLOUD_MAX_FILES || '1000', 10);
const DEFAULT_STORAGE_LIMIT_BYTES = 500 * 1024 * 1024;
const ALLOWED_FOLDERS = new Set(['files', 'drawing', 'images']);
const MAX_SCAN_BYTES = 2 * 1024 * 1024;
const SHARE_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const GLOBAL_SHARE_INDEX_PATH = path.join(UPLOADS_ROOT, 'site_cloud_share_links.json');
let shareCleanupSchedulerStarted = false;

function normalizeFolder(value) {
  const v = String(value || '').trim().toLowerCase();
  if (ALLOWED_FOLDERS.has(v)) return v;
  return 'files';
}

function basicMalwareScan(filePath) {
  const suspiciousSignatures = [
    { type: 'pe', bytes: [0x4d, 0x5a] }, // MZ
    { type: 'elf', bytes: [0x7f, 0x45, 0x4c, 0x46] }, // ELF
    { type: 'mach-o', bytes: [0xcf, 0xfa, 0xed, 0xfe] },
    { type: 'mach-o', bytes: [0xfe, 0xed, 0xfa, 0xcf] },
    { type: 'mach-o', bytes: [0xca, 0xfe, 0xba, 0xbe] },
  ];
  try {
    const stat = fs.statSync(filePath);
    const readLen = Math.max(0, Math.min(stat.size, MAX_SCAN_BYTES));
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(readLen);
    fs.readSync(fd, buf, 0, readLen, 0);
    fs.closeSync(fd);

    for (let i = 0; i < suspiciousSignatures.length; i += 1) {
      const sig = suspiciousSignatures[i];
      const bytes = sig.bytes;
      if (buf.length >= bytes.length && bytes.every((b, idx) => buf[idx] === b)) {
        return { ok: false, reason: `Blocked suspicious binary signature (${sig.type}).` };
      }
    }

    const headText = buf.toString('latin1');
    if (headText.includes('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR')) {
      return { ok: false, reason: 'Blocked malware test signature (EICAR).' };
    }
    return { ok: true };
  } catch (_) {
    return { ok: false, reason: 'Could not verify file safety. Upload blocked.' };
  }
}

function indexPath(req) {
  return path.join(req.digitalDocsCompanyDir, 'cloud_index.json');
}

function readIndex(req) {
  try {
    const p = indexPath(req);
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeIndex(req, items) {
  const p = indexPath(req);
  fs.writeFileSync(p, JSON.stringify(items, null, 2), 'utf8');
}

function readGlobalShareIndex() {
  try {
    if (!fs.existsSync(GLOBAL_SHARE_INDEX_PATH)) return [];
    const raw = fs.readFileSync(GLOBAL_SHARE_INDEX_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeGlobalShareIndex(items) {
  try {
    fs.mkdirSync(path.dirname(GLOBAL_SHARE_INDEX_PATH), { recursive: true });
    fs.writeFileSync(GLOBAL_SHARE_INDEX_PATH, JSON.stringify(items, null, 2), 'utf8');
  } catch (_) {}
}

function cleanupAndFindShare(token) {
  const all = readGlobalShareIndex();
  const now = Date.now();
  const valid = all.filter((s) => s && s.expires_at && new Date(s.expires_at).getTime() > now);
  if (valid.length !== all.length) writeGlobalShareIndex(valid);
  const found = valid.find((s) => s.token === token);
  return found || null;
}

function purgeExpiredShareLinks() {
  try {
    const all = readGlobalShareIndex();
    if (!all.length) return 0;
    const now = Date.now();
    const valid = all.filter((s) => s && s.expires_at && new Date(s.expires_at).getTime() > now);
    if (valid.length !== all.length) {
      writeGlobalShareIndex(valid);
      return all.length - valid.length;
    }
    return 0;
  } catch (_) {
    return 0;
  }
}

function startShareLinkCleanupScheduler() {
  if (shareCleanupSchedulerStarted) return;
  shareCleanupSchedulerStarted = true;
  const intervalMs = Math.max(60 * 1000, parseInt(process.env.SITE_CLOUD_SHARE_CLEANUP_MS || String(60 * 60 * 1000), 10));
  setInterval(() => {
    purgeExpiredShareLinks();
  }, intervalMs);
  purgeExpiredShareLinks();
}

function ensureCloudDir(req) {
  const dir = path.join(req.digitalDocsCompanyDir, 'cloud');
  fs.mkdirSync(dir, { recursive: true });
  req.siteCloudCompanyDir = dir;
  req.siteCloudFolderName = `${req.digitalDocsFolderName}/cloud`;
  return dir;
}

function mapItem(item) {
  return {
    id: item.id,
    folder: normalizeFolder(item.folder),
    stored_name: item.stored_name,
    original_name: item.original_name,
    mime_type: item.mime_type || 'application/octet-stream',
    size_bytes: item.size_bytes || 0,
    uploaded_at: item.uploaded_at,
    uploaded_by_manager_id: item.uploaded_by_manager_id,
  };
}

async function getTenantStorageLimitBytes(req) {
  const companyId = req && req.digitalDocsCompanyId;
  if (!Number.isInteger(companyId) || companyId < 1) return DEFAULT_STORAGE_LIMIT_BYTES;
  try {
    const r = await pool.query('SELECT cloud_storage_limit_mb FROM companies WHERE id = $1', [companyId]);
    if (!r.rows.length) return DEFAULT_STORAGE_LIMIT_BYTES;
    const mb = parseInt(String(r.rows[0].cloud_storage_limit_mb == null ? '' : r.rows[0].cloud_storage_limit_mb), 10);
    if (!Number.isInteger(mb) || mb < 1) return DEFAULT_STORAGE_LIMIT_BYTES;
    return mb * 1024 * 1024;
  } catch (_) {
    return DEFAULT_STORAGE_LIMIT_BYTES;
  }
}

function listFiles(req, res) {
  ensureCloudDir(req);
  const q = String(req.query.q || '').trim().toLowerCase();
  const folder = normalizeFolder(req.query.folder);
  const current = readIndex(req).filter((it) => {
    if (!it || !it.stored_name) return false;
    const full = path.join(req.siteCloudCompanyDir, it.stored_name);
    if (!fs.existsSync(full)) return false;
    if (normalizeFolder(it.folder) !== folder) return false;
    if (!q) return true;
    const hay = `${it.original_name || ''} ${it.stored_name || ''}`.toLowerCase();
    return hay.includes(q);
  });
  current.sort((a, b) => new Date(b.uploaded_at || 0) - new Date(a.uploaded_at || 0));
  return res.status(200).json({ success: true, files: current.map(mapItem) });
}

async function getStats(req, res) {
  ensureCloudDir(req);
  const limitBytes = await getTenantStorageLimitBytes(req);
  const activeItems = readIndex(req).filter((it) => {
    if (!it || !it.stored_name) return false;
    const full = path.join(req.siteCloudCompanyDir, it.stored_name);
    return fs.existsSync(full);
  });
  const totalFiles = activeItems.length;
  const usedBytes = activeItems.reduce((sum, it) => sum + (Number(it.size_bytes) || 0), 0);
  const averageBytes = totalFiles ? Math.round(usedBytes / totalFiles) : 0;
  return res.status(200).json({
    success: true,
    stats: {
      total_files: totalFiles,
      used_bytes: usedBytes,
      average_bytes: averageBytes,
      limit_bytes: limitBytes,
      usage_percent: limitBytes
        ? Math.min(100, (usedBytes / limitBytes) * 100)
        : 0,
    },
  });
}

async function uploadFile(req, res) {
  ensureCloudDir(req);
  if (!req.file) return res.status(400).json({ success: false, message: 'File is required.' });
  const scan = basicMalwareScan(req.file.path);
  if (!scan.ok) {
    try {
      fs.unlinkSync(req.file.path);
    } catch (_) {}
    return res.status(400).json({ success: false, message: scan.reason });
  }
  const items = readIndex(req);
  const activeItems = items.filter((it) => it && it.stored_name);
  if (activeItems.length >= MAX_FILES_PER_TENANT) {
    try {
      fs.unlinkSync(req.file.path);
    } catch (_) {}
    return res.status(400).json({
      success: false,
      message: `Tenant storage limit reached (max ${MAX_FILES_PER_TENANT} files).`,
    });
  }
  const usedBytes = activeItems.reduce((sum, it) => sum + (Number(it.size_bytes) || 0), 0);
  const maxTotalBytesPerTenant = await getTenantStorageLimitBytes(req);
  const nextTotal = usedBytes + (Number(req.file.size) || 0);
  if (nextTotal > maxTotalBytesPerTenant) {
    try {
      fs.unlinkSync(req.file.path);
    } catch (_) {}
    return res.status(400).json({
      success: false,
      message: 'Tenant storage quota reached. Delete files or request more space.',
    });
  }
  const entry = {
    id: `cf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    folder: normalizeFolder(req.body && req.body.folder),
    stored_name: req.file.filename,
    original_name: req.file.originalname || req.file.filename,
    mime_type: req.file.mimetype || 'application/octet-stream',
    size_bytes: req.file.size || 0,
    uploaded_at: new Date().toISOString(),
    uploaded_by_manager_id: req.manager.id,
  };
  items.push(entry);
  writeIndex(req, items);
  return res.status(201).json({ success: true, file: mapItem(entry) });
}

function sanitizeStoredName(raw) {
  const s = String(raw || '').trim();
  if (!s || s.includes('/') || s.includes('\\') || s.includes('..')) return '';
  return s;
}

function previewMetaForFile(fileName) {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  const map = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
  };
  return map[ext] || null;
}

function downloadFile(req, res) {
  ensureCloudDir(req);
  const stored = sanitizeStoredName(decodeURIComponent(req.params.name || ''));
  if (!stored) return res.status(400).json({ success: false, message: 'Invalid file name.' });
  const items = readIndex(req);
  const found = items.find((it) => it.stored_name === stored);
  if (!found) return res.status(404).json({ success: false, message: 'File not found.' });
  const full = path.join(req.siteCloudCompanyDir, stored);
  if (!fs.existsSync(full)) return res.status(404).json({ success: false, message: 'File missing on disk.' });
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
  return res.download(full, found.original_name || stored);
}

function viewFile(req, res) {
  ensureCloudDir(req);
  const stored = sanitizeStoredName(decodeURIComponent(req.params.name || ''));
  if (!stored) return res.status(400).json({ success: false, message: 'Invalid file name.' });
  const items = readIndex(req);
  const found = items.find((it) => it.stored_name === stored);
  if (!found) return res.status(404).json({ success: false, message: 'File not found.' });
  const full = path.join(req.siteCloudCompanyDir, stored);
  if (!fs.existsSync(full)) return res.status(404).json({ success: false, message: 'File missing on disk.' });
  const contentType = previewMetaForFile(found.original_name || stored);
  if (!contentType) {
    return res.status(415).json({
      success: false,
      message: 'Preview is not available for this file type. Use Download instead.',
    });
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename="${String(found.original_name || stored).replace(/"/g, '')}"`);
  return res.sendFile(full);
}

function removeFile(req, res) {
  ensureCloudDir(req);
  const stored = sanitizeStoredName(decodeURIComponent(req.params.name || ''));
  if (!stored) return res.status(400).json({ success: false, message: 'Invalid file name.' });
  const items = readIndex(req);
  const found = items.find((it) => it.stored_name === stored);
  if (!found) return res.status(404).json({ success: false, message: 'File not found.' });
  const full = path.join(req.siteCloudCompanyDir, stored);
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch (_) {
    return res.status(500).json({ success: false, message: 'Could not delete file from disk.' });
  }
  writeIndex(
    req,
    items.filter((it) => it.stored_name !== stored)
  );
  return res.status(200).json({ success: true, message: 'File deleted.' });
}

function generateShareLink(req, res) {
  ensureCloudDir(req);
  const stored = sanitizeStoredName(decodeURIComponent(req.params.name || ''));
  if (!stored) return res.status(400).json({ success: false, message: 'Invalid file name.' });
  const items = readIndex(req);
  const found = items.find((it) => it.stored_name === stored);
  if (!found) return res.status(404).json({ success: false, message: 'File not found.' });
  const full = path.join(req.siteCloudCompanyDir, stored);
  if (!fs.existsSync(full)) return res.status(404).json({ success: false, message: 'File missing on disk.' });

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + SHARE_LINK_TTL_MS).toISOString();
  const all = readGlobalShareIndex().filter((s) => s && s.expires_at && new Date(s.expires_at).getTime() > Date.now());
  all.push({
    token,
    company_folder_name: req.digitalDocsFolderName,
    stored_name: stored,
    original_name: found.original_name || stored,
    created_at: new Date().toISOString(),
    expires_at: expiresAt,
  });
  writeGlobalShareIndex(all);
  return res.status(201).json({
    success: true,
    share: {
      token,
      expires_at: expiresAt,
      path: `/api/site-cloud/share/${token}`,
    },
  });
}

function listSharedLinks(req, res) {
  ensureCloudDir(req);
  const all = readGlobalShareIndex();
  const now = Date.now();
  const valid = all.filter((s) => s && s.expires_at && new Date(s.expires_at).getTime() > now);
  if (valid.length !== all.length) writeGlobalShareIndex(valid);
  const mine = valid
    .filter((s) => String(s.company_folder_name || '') === String(req.digitalDocsFolderName || ''))
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .map((s) => ({
      token: s.token,
      original_name: s.original_name || s.stored_name,
      created_at: s.created_at,
      expires_at: s.expires_at,
      view_path: `/site_cloud_share_view.html?token=${encodeURIComponent(s.token)}`,
    }));
  return res.status(200).json({ success: true, links: mine });
}

function revokeSharedLink(req, res) {
  ensureCloudDir(req);
  const token = String(req.params.token || '').trim();
  if (!token) return res.status(400).json({ success: false, message: 'Invalid share token.' });
  const all = readGlobalShareIndex();
  const before = all.length;
  const kept = all.filter((s) => {
    if (!s || s.token !== token) return true;
    return String(s.company_folder_name || '') !== String(req.digitalDocsFolderName || '');
  });
  if (kept.length === before) {
    return res.status(404).json({ success: false, message: 'Share link not found.' });
  }
  writeGlobalShareIndex(kept);
  return res.status(200).json({ success: true, message: 'Share link revoked.' });
}

function downloadSharedFile(req, res) {
  const token = String(req.params.token || '').trim();
  if (!token) return res.status(400).send('Invalid share token.');
  const found = cleanupAndFindShare(token);
  if (!found) return res.status(404).send('Share link not found or expired.');
  const full = path.join(UPLOADS_ROOT, String(found.company_folder_name || ''), 'cloud', String(found.stored_name || ''));
  if (!fs.existsSync(full)) return res.status(404).send('Shared file no longer exists.');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
  return res.download(full, found.original_name || found.stored_name);
}

function viewSharedFile(req, res) {
  const token = String(req.params.token || '').trim();
  if (!token) return res.status(400).send('Invalid share token.');
  const found = cleanupAndFindShare(token);
  if (!found) return res.status(404).send('Share link not found or expired.');
  const full = path.join(UPLOADS_ROOT, String(found.company_folder_name || ''), 'cloud', String(found.stored_name || ''));
  if (!fs.existsSync(full)) return res.status(404).send('Shared file no longer exists.');
  const contentType = previewMetaForFile(found.original_name || found.stored_name);
  if (!contentType) return res.status(415).send('Preview unavailable for this file type.');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename="${String(found.original_name || found.stored_name).replace(/"/g, '')}"`);
  return res.sendFile(full);
}

async function sendFileByEmail(req, res) {
  ensureCloudDir(req);
  const stored = sanitizeStoredName(decodeURIComponent(req.params.name || ''));
  if (!stored) return res.status(400).json({ success: false, message: 'Invalid file name.' });
  const to = String((req.body && req.body.email) || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ success: false, message: 'Valid recipient email is required.' });
  }
  const items = readIndex(req);
  const found = items.find((it) => it.stored_name === stored);
  if (!found) return res.status(404).json({ success: false, message: 'File not found.' });
  const full = path.join(req.siteCloudCompanyDir, stored);
  if (!fs.existsSync(full)) return res.status(404).json({ success: false, message: 'File missing on disk.' });

  const transport = createTransport();
  if (!transport) {
    return res.status(503).json({
      success: false,
      message: 'Email is not configured on server (SMTP missing).',
    });
  }
  const from = (process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@proconix.uk').trim();
  const managerName = [req.manager && req.manager.name, req.manager && req.manager.surname]
    .filter(Boolean)
    .join(' ')
    .trim() || 'Manager';
  let companyName = 'your company';
  try {
    const cr = await pool.query('SELECT name FROM companies WHERE id = $1', [req.manager.company_id]);
    if (cr.rows.length && cr.rows[0].name) companyName = String(cr.rows[0].name).trim();
  } catch (_) {}
  const proconixUrl = (process.env.PROCONIX_PUBLIC_URL || 'https://proconix.uk').trim();
  const subject = `Proconix Cloud shared file: ${found.original_name || stored}`;
  const text = [
    'Hello,',
    ``,
    `${managerName} from ${companyName} shared a file with you from Proconix Cloud.`,
    `File: ${found.original_name || stored}`,
    ``,
    'Best regards,',
    `Proconix.uk (${proconixUrl})`,
  ].join('\n');

  await transport.sendMail({
    from,
    to,
    subject,
    text,
    attachments: [
      {
        filename: found.original_name || stored,
        path: full,
        contentType: found.mime_type || 'application/octet-stream',
      },
    ],
  });

  return res.status(200).json({ success: true, message: 'File sent by email.' });
}

module.exports = {
  ensureCloudDir,
  listFiles,
  getStats,
  uploadFile,
  downloadFile,
  viewFile,
  removeFile,
  generateShareLink,
  listSharedLinks,
  revokeSharedLink,
  downloadSharedFile,
  viewSharedFile,
  sendFileByEmail,
  startShareLinkCleanupScheduler,
};

