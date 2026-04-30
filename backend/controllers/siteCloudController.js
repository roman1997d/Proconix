const fs = require('fs');
const path = require('path');

const MAX_FILES_PER_TENANT = parseInt(process.env.SITE_CLOUD_MAX_FILES || '1000', 10);
const MAX_TOTAL_BYTES_PER_TENANT = parseInt(
  process.env.SITE_CLOUD_MAX_TOTAL_BYTES || String(5 * 1024 * 1024 * 1024),
  10
);

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
    stored_name: item.stored_name,
    original_name: item.original_name,
    mime_type: item.mime_type || 'application/octet-stream',
    size_bytes: item.size_bytes || 0,
    uploaded_at: item.uploaded_at,
    uploaded_by_manager_id: item.uploaded_by_manager_id,
  };
}

function listFiles(req, res) {
  ensureCloudDir(req);
  const q = String(req.query.q || '').trim().toLowerCase();
  const current = readIndex(req).filter((it) => {
    if (!it || !it.stored_name) return false;
    const full = path.join(req.siteCloudCompanyDir, it.stored_name);
    if (!fs.existsSync(full)) return false;
    if (!q) return true;
    const hay = `${it.original_name || ''} ${it.stored_name || ''}`.toLowerCase();
    return hay.includes(q);
  });
  current.sort((a, b) => new Date(b.uploaded_at || 0) - new Date(a.uploaded_at || 0));
  return res.status(200).json({ success: true, files: current.map(mapItem) });
}

function uploadFile(req, res) {
  ensureCloudDir(req);
  if (!req.file) return res.status(400).json({ success: false, message: 'File is required.' });
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
  const nextTotal = usedBytes + (Number(req.file.size) || 0);
  if (nextTotal > MAX_TOTAL_BYTES_PER_TENANT) {
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

module.exports = {
  ensureCloudDir,
  listFiles,
  uploadFile,
  downloadFile,
  removeFile,
};

