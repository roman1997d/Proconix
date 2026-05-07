/**
 * Finds files under backend/uploads with no matching row in scanned DB paths
 * nor Site Cloud index JSON trash/active entries.
 */

const fs = require('fs');
const path = require('path');
const { UPLOADS_ROOT } = require('../middleware/resolveCompanyDocsDir');
const { collectGlobalDbReferencedUploadAbsolutePaths } = require('./companyTenantFileCleanup');

function normalizeAbs(p) {
  try {
    return path.resolve(String(p || ''));
  } catch (_) {
    return '';
  }
}

function sanitizeCloudStoredName(raw) {
  const s = String(raw || '').trim();
  if (!s || s.includes('/') || s.includes('\\') || s.includes('..')) return '';
  return s;
}

/** Mark Site Cloud indexes + referenced blobs as used. */
function addCloudIndexReferencedPaths(set) {
  if (!fs.existsSync(UPLOADS_ROOT)) return;
  let entries;
  try {
    entries = fs.readdirSync(UPLOADS_ROOT, { withFileTypes: true });
  } catch (_) {
    return;
  }

  const sharePath = path.join(UPLOADS_ROOT, 'site_cloud_share_links.json');
  try {
    if (fs.existsSync(sharePath) && fs.statSync(sharePath).isFile()) {
      set.add(normalizeAbs(sharePath));
    }
  } catch (_) {}

  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    if (!e || !e.isDirectory() || !/_\d+_docs$/.test(e.name)) continue;
    const docsDir = path.join(UPLOADS_ROOT, e.name);
    const cloudDir = path.join(docsDir, 'cloud');
    const trashDir = path.join(docsDir, 'cloud_trash');
    [
      path.join(docsDir, 'cloud_index.json'),
      path.join(docsDir, 'cloud_trash_index.json'),
      path.join(docsDir, 'cloud_folders_index.json'),
    ].forEach((jp) => {
      try {
        if (fs.existsSync(jp) && fs.statSync(jp).isFile()) {
          set.add(normalizeAbs(jp));
        }
      } catch (_) {}
    });

    const idxPath = path.join(docsDir, 'cloud_index.json');
    try {
      if (fs.existsSync(idxPath)) {
        const items = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
        if (Array.isArray(items)) {
          for (let j = 0; j < items.length; j += 1) {
            const sn = sanitizeCloudStoredName(items[j] && items[j].stored_name);
            if (sn) set.add(normalizeAbs(path.join(cloudDir, sn)));
          }
        }
      }
    } catch (_) {}

    const tidx = path.join(docsDir, 'cloud_trash_index.json');
    try {
      if (fs.existsSync(tidx)) {
        const items = JSON.parse(fs.readFileSync(tidx, 'utf8'));
        if (Array.isArray(items)) {
          for (let k = 0; k < items.length; k += 1) {
            const tn = sanitizeCloudStoredName(items[k] && items[k].trashed_name);
            if (tn) set.add(normalizeAbs(path.join(trashDir, tn)));
          }
        }
      }
    } catch (_) {}
  }
}

function walkAllFilesSync(root, onFile) {
  const q = [root];
  while (q.length) {
    const dir = q.shift();
    let list;
    try {
      list = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (let i = 0; i < list.length; i += 1) {
      const e = list[i];
      const full = path.join(dir, e.name);
      if (e.isDirectory()) q.push(full);
      else if (e.isFile()) onFile(full);
    }
  }
}

async function buildReferencedNormalizedSet(dbPool) {
  const ref = await collectGlobalDbReferencedUploadAbsolutePaths(dbPool);
  addCloudIndexReferencedPaths(ref);
  const refNorm = new Set();
  ref.forEach(function (p) {
    const n = normalizeAbs(p);
    if (n) refNorm.add(n);
  });
  return refNorm;
}

/**
 * @param {import('pg').Pool} dbPool
 * @param {number} maxListLength
 */
async function scanUploadOrphans(dbPool, maxListLength) {
  const cap = Math.max(1, Math.min(50000, Number(maxListLength) || 10000));
  if (!fs.existsSync(UPLOADS_ROOT)) {
    return {
      orphans: [],
      total_scanned_files: 0,
      total_orphans: 0,
      referenced_unique_paths: 0,
      truncated: false,
      max_files: cap,
      root_path: UPLOADS_ROOT,
    };
  }

  const refNorm = await buildReferencedNormalizedSet(dbPool);
  const rootR = normalizeAbs(UPLOADS_ROOT);

  /** @type {Array<{path:string,size_bytes:number,modified_at:string}>} */
  const orphans = [];
  let totalScanned = 0;
  let totalOrphans = 0;

  walkAllFilesSync(UPLOADS_ROOT, function (absFile) {
    totalScanned += 1;
    const n = normalizeAbs(absFile);
    if (!n || (n !== rootR && !n.startsWith(rootR + path.sep))) return;
    if (refNorm.has(n)) return;
    totalOrphans += 1;
    if (orphans.length >= cap) return;
    try {
      const st = fs.statSync(absFile);
      orphans.push({
        path: path.relative(UPLOADS_ROOT, absFile).split(path.sep).join('/'),
        size_bytes: Number(st.size) || 0,
        modified_at: st.mtime ? st.mtime.toISOString() : '',
      });
    } catch (_) {}
  });

  orphans.sort(function (a, b) {
    return new Date(b.modified_at || 0) - new Date(a.modified_at || 0);
  });

  return {
    orphans,
    total_scanned_files: totalScanned,
    total_orphans: totalOrphans,
    referenced_unique_paths: refNorm.size,
    truncated: totalOrphans > orphans.length,
    max_files: cap,
    root_path: UPLOADS_ROOT,
  };
}

function assertSafeRelativeUploadPath(relPath) {
  const rel = String(relPath || '').trim();
  if (!rel || rel.includes('..') || rel.startsWith('/') || rel.startsWith('\\')) {
    return { ok: false, message: 'Invalid file path.' };
  }
  const root = path.resolve(UPLOADS_ROOT);
  const full = path.resolve(root, rel);
  if (full !== root && !full.startsWith(root + path.sep)) {
    return { ok: false, message: 'Path is outside backend/uploads.' };
  }
  try {
    if (!fs.existsSync(full)) return { ok: false, message: 'File not found.' };
    const st = fs.statSync(full);
    if (!st.isFile()) return { ok: false, message: 'Only files can be deleted.' };
  } catch (_) {
    return { ok: false, message: 'File not accessible.' };
  }
  return { ok: true, full };
}

function deleteOrphanFileByRelPath(relPath) {
  const check = assertSafeRelativeUploadPath(relPath);
  if (!check.ok) return { ok: false, message: check.message };
  try {
    fs.unlinkSync(check.full);
    return { ok: true, message: 'File deleted.' };
  } catch (e) {
    return { ok: false, message: (e && e.message) || 'Failed to delete file.' };
  }
}

async function purgeAllUploadOrphans(dbPool) {
  if (!fs.existsSync(UPLOADS_ROOT)) {
    return { deleted: 0, failed: 0, message: 'No uploads root.' };
  }
  const refNorm = await buildReferencedNormalizedSet(dbPool);
  const rootR = normalizeAbs(UPLOADS_ROOT);
  let deleted = 0;
  let failed = 0;
  walkAllFilesSync(UPLOADS_ROOT, function (absFile) {
    const n = normalizeAbs(absFile);
    if (!n || (n !== rootR && !n.startsWith(rootR + path.sep))) return;
    if (refNorm.has(n)) return;
    try {
      const st = fs.statSync(absFile);
      if (!st.isFile()) return;
      fs.unlinkSync(absFile);
      deleted += 1;
    } catch (_) {
      failed += 1;
    }
  });
  return { deleted, failed };
}

module.exports = {
  scanUploadOrphans,
  deleteOrphanFileByRelPath,
  purgeAllUploadOrphans,
};
