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
const DELETED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
let deletedCleanupSchedulerStarted = false;

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

function trashIndexPath(req) {
  return path.join(req.digitalDocsCompanyDir, 'cloud_trash_index.json');
}

function readTrashIndex(req) {
  try {
    const p = trashIndexPath(req);
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeTrashIndex(req, items) {
  const p = trashIndexPath(req);
  fs.writeFileSync(p, JSON.stringify(items, null, 2), 'utf8');
}

function folderIndexPath(req) {
  return path.join(req.digitalDocsCompanyDir, 'cloud_folders_index.json');
}

function normalizeSubfolderName(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const cleaned = raw.replace(/\s+/g, ' ').slice(0, 32);
  if (!/^[a-zA-Z0-9 _-]+$/.test(cleaned)) return '';
  return cleaned;
}

function readFolderIndex(req) {
  try {
    const p = folderIndexPath(req);
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((n) => normalizeSubfolderName(n)).filter(Boolean);
  } catch (_) {
    return [];
  }
}

function writeFolderIndex(req, names) {
  const p = folderIndexPath(req);
  const unique = Array.from(new Set((Array.isArray(names) ? names : []).map((n) => normalizeSubfolderName(n)).filter(Boolean)));
  fs.writeFileSync(p, JSON.stringify(unique, null, 2), 'utf8');
}

async function removeDrawingGalleryVersionForCloudItem(req, item) {
  try {
    if (!item) return false;
    const versionId = parseInt(item.drawing_version_id, 10);
    if (!Number.isInteger(versionId) || versionId < 1) return false;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const vr = await client.query(
        `SELECT v.id, v.series_id, v.relative_path, s.company_id
         FROM drawing_version v
         JOIN drawing_series s ON s.id = v.series_id
         WHERE v.id = $1`,
        [versionId]
      );
      if (!vr.rows.length) {
        await client.query('ROLLBACK');
        return false;
      }
      const v = vr.rows[0];
      if (parseInt(v.company_id, 10) !== parseInt(req.digitalDocsCompanyId, 10)) {
        await client.query('ROLLBACK');
        return false;
      }
      await client.query('DELETE FROM drawing_version WHERE id = $1', [versionId]);
      const remain = await client.query('SELECT id, version_number FROM drawing_version WHERE series_id = $1 ORDER BY version_number DESC', [v.series_id]);
      if (!remain.rows.length) {
        await client.query('DELETE FROM drawing_series WHERE id = $1', [v.series_id]);
      } else {
        await client.query(`UPDATE drawing_version SET status = 'archived' WHERE series_id = $1`, [v.series_id]);
        await client.query(`UPDATE drawing_version SET status = 'active' WHERE id = $1`, [remain.rows[0].id]);
      }
      await client.query('COMMIT');
      if (v.relative_path) {
        const abs = path.join(UPLOADS_ROOT, String(v.relative_path).split('/').join(path.sep));
        try {
          if (fs.existsSync(abs)) fs.unlinkSync(abs);
        } catch (_) {}
      }
      return true;
    } catch (_) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
      return false;
    } finally {
      client.release();
    }
  } catch (_) {
    return false;
  }
}

function resolveFolder(req, value) {
  const raw = String(value || '').trim().toLowerCase();
  if (ALLOWED_FOLDERS.has(raw)) return raw;
  const extras = readFolderIndex(req);
  const found = extras.find((n) => String(n || '').toLowerCase() === raw);
  return found || 'files';
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

function purgeExpiredDeletedForRequest(req) {
  ensureCloudDir(req);
  const now = Date.now();
  const items = readTrashIndex(req);
  if (!items.length) return 0;
  const kept = [];
  let removed = 0;
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    const ts = new Date(it && it.deleted_at ? it.deleted_at : 0).getTime();
    if (!ts || now - ts < DELETED_RETENTION_MS) {
      kept.push(it);
      continue;
    }
    const full = path.join(req.siteCloudTrashDir, String(it.trashed_name || ''));
    try {
      if (fs.existsSync(full)) fs.unlinkSync(full);
    } catch (_) {}
    removed += 1;
  }
  if (removed > 0) writeTrashIndex(req, kept);
  return removed;
}

function purgeExpiredDeletedForAllTenants() {
  try {
    if (!fs.existsSync(UPLOADS_ROOT)) return 0;
    const now = Date.now();
    const entries = fs.readdirSync(UPLOADS_ROOT, { withFileTypes: true });
    let removedTotal = 0;
    for (let i = 0; i < entries.length; i += 1) {
      const e = entries[i];
      if (!e || !e.isDirectory() || !/_\d+_docs$/.test(e.name)) continue;
      const docsDir = path.join(UPLOADS_ROOT, e.name);
      const trashDir = path.join(docsDir, 'cloud_trash');
      const idxPath = path.join(docsDir, 'cloud_trash_index.json');
      if (!fs.existsSync(idxPath)) continue;
      let items;
      try {
        const raw = fs.readFileSync(idxPath, 'utf8');
        const parsed = JSON.parse(raw);
        items = Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        items = [];
      }
      if (!items.length) continue;
      const kept = [];
      let removed = 0;
      for (let j = 0; j < items.length; j += 1) {
        const it = items[j];
        const ts = new Date(it && it.deleted_at ? it.deleted_at : 0).getTime();
        if (!ts || now - ts < DELETED_RETENTION_MS) {
          kept.push(it);
          continue;
        }
        const full = path.join(trashDir, String(it.trashed_name || ''));
        try {
          if (fs.existsSync(full)) fs.unlinkSync(full);
        } catch (_) {}
        removed += 1;
      }
      if (removed > 0) {
        fs.writeFileSync(idxPath, JSON.stringify(kept, null, 2), 'utf8');
        removedTotal += removed;
      }
    }
    return removedTotal;
  } catch (_) {
    return 0;
  }
}

function startDeletedFilesCleanupScheduler() {
  if (deletedCleanupSchedulerStarted) return;
  deletedCleanupSchedulerStarted = true;
  const intervalMs = Math.max(
    60 * 1000,
    parseInt(process.env.SITE_CLOUD_DELETED_CLEANUP_MS || String(60 * 60 * 1000), 10)
  );
  setInterval(() => {
    purgeExpiredDeletedForAllTenants();
  }, intervalMs);
  purgeExpiredDeletedForAllTenants();
}

function ensureCloudDir(req) {
  const dir = path.join(req.digitalDocsCompanyDir, 'cloud');
  const trashDir = path.join(req.digitalDocsCompanyDir, 'cloud_trash');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(trashDir, { recursive: true });
  req.siteCloudCompanyDir = dir;
  req.siteCloudTrashDir = trashDir;
  req.siteCloudFolderName = `${req.digitalDocsFolderName}/cloud`;
  return dir;
}

function mapItem(item) {
  return {
    id: item.id,
    folder: item.folder,
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
  const folder = resolveFolder(req, req.query.folder);
  const current = readIndex(req).filter((it) => {
    if (!it || !it.stored_name) return false;
    const full = path.join(req.siteCloudCompanyDir, it.stored_name);
    if (!fs.existsSync(full)) return false;
    if (String(it.folder || 'files') !== folder) return false;
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
    folder: resolveFolder(req, req.body && req.body.folder),
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

async function removeFile(req, res) {
  ensureCloudDir(req);
  purgeExpiredDeletedForRequest(req);
  const stored = sanitizeStoredName(decodeURIComponent(req.params.name || ''));
  if (!stored) return res.status(400).json({ success: false, message: 'Invalid file name.' });
  const items = readIndex(req);
  const found = items.find((it) => it.stored_name === stored);
  if (!found) return res.status(404).json({ success: false, message: 'File not found.' });
  const full = path.join(req.siteCloudCompanyDir, stored);
  const trashedName = `${Date.now()}_${stored}`;
  const trashFull = path.join(req.siteCloudTrashDir, trashedName);
  try {
    if (fs.existsSync(full)) fs.renameSync(full, trashFull);
  } catch (_) {
    return res.status(500).json({ success: false, message: 'Could not move file to deleted folder.' });
  }
  writeIndex(
    req,
    items.filter((it) => it.stored_name !== stored)
  );
  const trashItems = readTrashIndex(req);
  trashItems.push({
    trash_id: `td_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    trashed_name: trashedName,
    original_name: found.original_name || stored,
    mime_type: found.mime_type || 'application/octet-stream',
    size_bytes: found.size_bytes || 0,
    folder: found.folder || 'files',
    deleted_at: new Date().toISOString(),
  });
  writeTrashIndex(req, trashItems);
  const shares = readGlobalShareIndex().filter(
    (s) =>
      !(
        String(s.company_folder_name || '') === String(req.digitalDocsFolderName || '') &&
        String(s.stored_name || '') === stored
      )
  );
  writeGlobalShareIndex(shares);
  const drawingGalleryRemoved = await removeDrawingGalleryVersionForCloudItem(req, found);
  return res.status(200).json({
    success: true,
    message: 'File moved to Deleted.',
    drawing_gallery_removed: !!drawingGalleryRemoved,
  });
}

function listDeletedFiles(req, res) {
  ensureCloudDir(req);
  purgeExpiredDeletedForRequest(req);
  const q = String(req.query.q || '').trim().toLowerCase();
  const items = readTrashIndex(req)
    .filter((it) => {
      if (!it || !it.trashed_name) return false;
      const full = path.join(req.siteCloudTrashDir, it.trashed_name);
      if (!fs.existsSync(full)) return false;
      if (!q) return true;
      return String(it.original_name || '').toLowerCase().includes(q);
    })
    .sort((a, b) => new Date(b.deleted_at || 0) - new Date(a.deleted_at || 0))
    .map((it) => ({
      trash_id: it.trash_id,
      original_name: it.original_name,
      mime_type: it.mime_type || 'application/octet-stream',
      size_bytes: it.size_bytes || 0,
      folder: it.folder || 'files',
      deleted_at: it.deleted_at,
      delete_after_at: new Date(new Date(it.deleted_at || Date.now()).getTime() + DELETED_RETENTION_MS).toISOString(),
    }));
  return res.status(200).json({ success: true, files: items });
}

function restoreDeletedFile(req, res) {
  ensureCloudDir(req);
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ success: false, message: 'Invalid deleted item id.' });
  const trashItems = readTrashIndex(req);
  const idx = trashItems.findIndex((it) => String(it.trash_id || '') === id);
  if (idx < 0) return res.status(404).json({ success: false, message: 'Deleted file not found.' });
  const item = trashItems[idx];
  const fromFull = path.join(req.siteCloudTrashDir, String(item.trashed_name || ''));
  if (!fs.existsSync(fromFull)) return res.status(404).json({ success: false, message: 'Deleted file missing on disk.' });
  const baseStored = sanitizeStoredName(item.original_name || '') || `restored_${Date.now()}`;
  let restoredStored = baseStored;
  let targetFull = path.join(req.siteCloudCompanyDir, restoredStored);
  let n = 1;
  while (fs.existsSync(targetFull)) {
    const ext = path.extname(baseStored);
    const nameNoExt = ext ? baseStored.slice(0, -ext.length) : baseStored;
    restoredStored = `${nameNoExt}_${n}${ext}`;
    targetFull = path.join(req.siteCloudCompanyDir, restoredStored);
    n += 1;
  }
  try {
    fs.renameSync(fromFull, targetFull);
  } catch (_) {
    return res.status(500).json({ success: false, message: 'Could not restore file.' });
  }
  const items = readIndex(req);
  items.push({
    id: `cf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    folder: resolveFolder(req, item.folder),
    stored_name: restoredStored,
    original_name: item.original_name || restoredStored,
    mime_type: item.mime_type || 'application/octet-stream',
    size_bytes: item.size_bytes || 0,
    uploaded_at: new Date().toISOString(),
    uploaded_by_manager_id: req.manager.id,
  });
  writeIndex(req, items);
  trashItems.splice(idx, 1);
  writeTrashIndex(req, trashItems);
  return res.status(200).json({ success: true, message: 'File restored.' });
}

function permanentlyDeleteFile(req, res) {
  ensureCloudDir(req);
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ success: false, message: 'Invalid deleted item id.' });
  const trashItems = readTrashIndex(req);
  const idx = trashItems.findIndex((it) => String(it.trash_id || '') === id);
  if (idx < 0) return res.status(404).json({ success: false, message: 'Deleted file not found.' });
  const item = trashItems[idx];
  const full = path.join(req.siteCloudTrashDir, String(item.trashed_name || ''));
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch (_) {
    return res.status(500).json({ success: false, message: 'Could not delete file permanently.' });
  }
  trashItems.splice(idx, 1);
  writeTrashIndex(req, trashItems);
  return res.status(200).json({ success: true, message: 'File permanently deleted.' });
}

function listExtraFolders(req, res) {
  ensureCloudDir(req);
  const filesFolders = readIndex(req)
    .map((it) => String((it && it.folder) || '').trim())
    .filter((n) => n && !ALLOWED_FOLDERS.has(String(n).toLowerCase()));
  const deletedFolders = readTrashIndex(req)
    .map((it) => String((it && it.folder) || '').trim())
    .filter((n) => n && !ALLOWED_FOLDERS.has(String(n).toLowerCase()));
  const all = Array.from(new Set(readFolderIndex(req).concat(filesFolders, deletedFolders))).sort((a, b) => a.localeCompare(b));
  writeFolderIndex(req, all);
  return res.status(200).json({ success: true, folders: all });
}

function createExtraFolder(req, res) {
  ensureCloudDir(req);
  const name = normalizeSubfolderName(req.body && req.body.name);
  if (!name) {
    return res.status(400).json({
      success: false,
      message: 'Folder name is required (letters, numbers, space, - or _, max 32 chars).',
    });
  }
  if (ALLOWED_FOLDERS.has(name.toLowerCase())) {
    return res.status(400).json({ success: false, message: 'This folder name is reserved.' });
  }
  const all = readFolderIndex(req);
  const exists = all.some((n) => n.toLowerCase() === name.toLowerCase());
  if (!exists) all.push(name);
  writeFolderIndex(req, all);
  return res.status(201).json({ success: true, folder: name });
}

function deleteExtraFolder(req, res) {
  ensureCloudDir(req);
  purgeExpiredDeletedForRequest(req);
  const raw = decodeURIComponent(req.params.name || '');
  const folderName = normalizeSubfolderName(raw);
  if (!folderName) return res.status(400).json({ success: false, message: 'Invalid folder name.' });
  if (ALLOWED_FOLDERS.has(folderName.toLowerCase())) {
    return res.status(400).json({ success: false, message: 'Default folders cannot be deleted.' });
  }

  const indexFolders = readFolderIndex(req);
  const filesFolders = readIndex(req)
    .map((it) => normalizeSubfolderName(it && it.folder))
    .filter((n) => n && !ALLOWED_FOLDERS.has(String(n).toLowerCase()));
  const deletedFolders = readTrashIndex(req)
    .map((it) => normalizeSubfolderName(it && it.folder))
    .filter((n) => n && !ALLOWED_FOLDERS.has(String(n).toLowerCase()));
  const allFolders = Array.from(new Set(indexFolders.concat(filesFolders, deletedFolders)));
  const exists = allFolders.some((n) => String(n || '').toLowerCase() === folderName.toLowerCase());
  if (!exists) return res.status(404).json({ success: false, message: 'Folder not found.' });

  const items = readIndex(req);
  const toMove = items.filter((it) => String(it.folder || '').toLowerCase() === folderName.toLowerCase());
  const keep = items.filter((it) => String(it.folder || '').toLowerCase() !== folderName.toLowerCase());
  const trashItems = readTrashIndex(req);
  const movedStoredNames = [];

  for (let i = 0; i < toMove.length; i += 1) {
    const it = toMove[i];
    const stored = sanitizeStoredName(it && it.stored_name);
    if (!stored) continue;
    const full = path.join(req.siteCloudCompanyDir, stored);
    if (!fs.existsSync(full)) continue;
    const trashedName = `${Date.now()}_${stored}`;
    const trashFull = path.join(req.siteCloudTrashDir, trashedName);
    try {
      fs.renameSync(full, trashFull);
      movedStoredNames.push(stored);
      trashItems.push({
        trash_id: `td_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        trashed_name: trashedName,
        original_name: it.original_name || stored,
        mime_type: it.mime_type || 'application/octet-stream',
        size_bytes: it.size_bytes || 0,
        folder: it.folder || folderName,
        deleted_at: new Date().toISOString(),
      });
      removeDrawingGalleryVersionForCloudItem(req, it);
    } catch (_) {}
  }

  writeIndex(req, keep);
  writeTrashIndex(req, trashItems);

  if (movedStoredNames.length) {
    const movedSet = new Set(movedStoredNames);
    const shares = readGlobalShareIndex().filter(
      (s) =>
        !(
          String(s.company_folder_name || '') === String(req.digitalDocsFolderName || '') &&
          movedSet.has(String(s.stored_name || ''))
        )
    );
    writeGlobalShareIndex(shares);
  }

  const nextFolders = indexFolders.filter((n) => String(n || '').toLowerCase() !== folderName.toLowerCase());
  writeFolderIndex(req, nextFolders);

  return res.status(200).json({
    success: true,
    message: 'Folder deleted. Files moved to Deleted.',
    moved_files: movedStoredNames.length,
  });
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

function moveFileToFolder(req, res) {
  ensureCloudDir(req);
  const stored = sanitizeStoredName(decodeURIComponent(req.params.name || ''));
  if (!stored) return res.status(400).json({ success: false, message: 'Invalid file name.' });
  const targetFolder = resolveFolder(req, req.body && req.body.folder);
  const items = readIndex(req);
  const idx = items.findIndex((it) => it && it.stored_name === stored);
  if (idx < 0) return res.status(404).json({ success: false, message: 'File not found.' });
  const current = items[idx];
  if (String(current.folder || 'files') === String(targetFolder)) {
    return res.status(200).json({ success: true, message: 'File is already in this folder.', file: mapItem(current) });
  }
  items[idx] = Object.assign({}, current, { folder: targetFolder });
  writeIndex(req, items);
  return res.status(200).json({ success: true, message: 'File moved successfully.', file: mapItem(items[idx]) });
}

module.exports = {
  ensureCloudDir,
  listFiles,
  listExtraFolders,
  createExtraFolder,
  deleteExtraFolder,
  listDeletedFiles,
  getStats,
  uploadFile,
  downloadFile,
  viewFile,
  removeFile,
  restoreDeletedFile,
  permanentlyDeleteFile,
  generateShareLink,
  listSharedLinks,
  revokeSharedLink,
  downloadSharedFile,
  viewSharedFile,
  sendFileByEmail,
  moveFileToFolder,
  startShareLinkCleanupScheduler,
  startDeletedFilesCleanupScheduler,
};

