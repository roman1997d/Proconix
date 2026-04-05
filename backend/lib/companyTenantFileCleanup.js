/**
 * Collect upload paths and remove on-disk files when a company (tenant) is deleted
 * from platform administration. DB rows alone leave orphaned files under backend/uploads/.
 */

const fs = require('fs');
const path = require('path');
const { UPLOADS_ROOT } = require('../middleware/resolveCompanyDocsDir');

function isSafeUploadsPublicPath(u) {
  if (!u || typeof u !== 'string') return false;
  const s = u.trim();
  if (!s.startsWith('/uploads/')) return false;
  if (s.includes('..')) return false;
  return true;
}

function toAbsoluteUploadPath(u) {
  if (!isSafeUploadsPublicPath(u)) return null;
  const rel = u.trim().replace(/^\/uploads\//, '');
  if (!rel || rel.includes('..')) return null;
  const abs = path.resolve(path.join(UPLOADS_ROOT, rel));
  const root = UPLOADS_ROOT;
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

function addUploadPathToSet(set, u) {
  const abs = toAbsoluteUploadPath(u);
  if (abs) set.add(abs);
}

function parseJsonField(val, defaultVal) {
  if (val == null) return defaultVal;
  if (Array.isArray(val)) return val;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val || '[]');
  } catch (_) {
    return defaultVal;
  }
}

function collectPathsFromTimesheetJobs(jobs, set) {
  if (!Array.isArray(jobs)) return;
  jobs.forEach(function (job) {
    if (!job || typeof job !== 'object') return;
    ['photos', 'photoPaths', 'photo_urls'].forEach(function (key) {
      const arr = job[key];
      if (!Array.isArray(arr)) return;
      arr.forEach(function (item) {
        if (typeof item === 'string') addUploadPathToSet(set, item);
      });
    });
  });
}

function collectWorkLogFilePaths(row) {
  const set = new Set();
  if (!row) return [];
  if (row.invoice_file_path && typeof row.invoice_file_path === 'string') {
    addUploadPathToSet(set, row.invoice_file_path);
  }
  const photos = parseJsonField(row.photo_urls, []);
  if (Array.isArray(photos)) {
    photos.forEach(function (p) {
      if (typeof p === 'string') addUploadPathToSet(set, p);
    });
  }
  collectPathsFromTimesheetJobs(parseJsonField(row.timesheet_jobs, []), set);
  return Array.from(set);
}

async function safeQueryRows(client, sql, params) {
  try {
    const r = await client.query(sql, params);
    return r.rows || [];
  } catch (e) {
    if (e.code === '42P01' || e.code === '42703') return [];
    throw e;
  }
}

/**
 * Run inside the same transaction as tenant DELETEs, before any row removal,
 * so file_url columns are still readable.
 * @param {import('pg').PoolClient} client
 * @param {number} companyId
 * @returns {Promise<string[]>} absolute paths under UPLOADS_ROOT
 */
async function collectCompanyTenantUploadPaths(client, companyId) {
  const set = new Set();

  const wlRows = await safeQueryRows(
    client,
    `SELECT photo_urls, timesheet_jobs, invoice_file_path FROM work_logs WHERE company_id = $1`,
    [companyId]
  );
  wlRows.forEach(function (row) {
    collectWorkLogFilePaths(row).forEach(function (abs) {
      set.add(abs);
    });
  });

  const uploadRows = await safeQueryRows(
    client,
    `SELECT u.file_url FROM uploads u
     INNER JOIN users usr ON usr.id = u.user_id AND usr.company_id = $1
     WHERE u.file_url IS NOT NULL AND TRIM(u.file_url) <> ''`,
    [companyId]
  );
  uploadRows.forEach(function (r) {
    addUploadPathToSet(set, r.file_url);
  });

  const issueRows = await safeQueryRows(
    client,
    `SELECT i.file_url FROM issues i
     INNER JOIN users usr ON usr.id = i.user_id AND usr.company_id = $1
     WHERE i.file_url IS NOT NULL AND TRIM(i.file_url) <> ''`,
    [companyId]
  );
  issueRows.forEach(function (r) {
    addUploadPathToSet(set, r.file_url);
  });

  const photoRows = await safeQueryRows(
    client,
    `SELECT otp.file_url FROM operative_task_photos otp
     WHERE otp.user_id IN (SELECT id FROM users WHERE company_id = $1)
        OR (otp.task_source = 'planning' AND otp.task_id IN (
          SELECT t.id FROM planning_plan_tasks t
          INNER JOIN planning_plans p ON p.id = t.plan_id
          WHERE p.company_id = $1
        ))`,
    [companyId]
  );
  photoRows.forEach(function (r) {
    addUploadPathToSet(set, r.file_url);
  });

  return Array.from(set);
}

function unlinkQuietly(absPath) {
  return new Promise(function (resolve) {
    fs.unlink(absPath, function () {
      resolve();
    });
  });
}

/**
 * @param {string[]} absolutePaths
 */
async function unlinkCollectedUploadFiles(absolutePaths) {
  await Promise.all(absolutePaths.map(unlinkQuietly));
}

/**
 * Removes backend/uploads/{anything}_{companyId}_docs/ (PDFs, signatures, etc.).
 * @param {number} companyId
 */
function removeDigitalDocsCompanyFolders(companyId) {
  let names;
  try {
    names = fs.readdirSync(UPLOADS_ROOT);
  } catch (_) {
    return;
  }
  const suffix = `_${companyId}_docs`;
  names.forEach(function (name) {
    if (!name.endsWith(suffix)) return;
    const abs = path.join(UPLOADS_ROOT, name);
    try {
      fs.rmSync(abs, { recursive: true, force: true });
    } catch (e) {
      console.warn('companyTenantFileCleanup rmDir:', abs, e && e.message);
    }
  });
}

module.exports = {
  UPLOADS_ROOT,
  collectCompanyTenantUploadPaths,
  unlinkCollectedUploadFiles,
  removeDigitalDocsCompanyFolders,
};
