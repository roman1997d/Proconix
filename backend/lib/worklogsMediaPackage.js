/**
 * Manager Work Logs — ZIP media package grouped by location (time sheet line location, QA job, or work-log path).
 */

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { pool } = require('../db/pool');

const UPLOADS_ROOT = path.resolve(path.join(__dirname, '..', 'uploads'));

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

function buildWorkersDisplayLine(workerName, collaboratorsDisplayVal) {
  const primary = (workerName && String(workerName).trim()) || '';
  const cd = parseJsonField(collaboratorsDisplayVal, []);
  const seen = new Set();
  const out = [];
  function pushName(n) {
    const s = String(n || '').trim();
    if (!s) return;
    const k = s.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(s);
  }
  pushName(primary);
  if (Array.isArray(cd)) {
    cd.forEach((x) => {
      if (x && x.name) pushName(x.name);
    });
  }
  return out.join(', ');
}

function listFiltersFromReq(req) {
  const q = req.query || {};
  return {
    worker: (q.worker && String(q.worker).trim()) || '',
    dateFrom: (q.dateFrom && String(q.dateFrom).trim()) || '',
    dateTo: (q.dateTo && String(q.dateTo).trim()) || '',
    location: (q.location && String(q.location).trim()) || '',
    status: (q.status && String(q.status).trim()) || '',
    search: (q.search && String(q.search).trim()) || '',
  };
}

function buildWorkLogsFilterQuery(companyId, filters) {
  const worker = filters.worker || '';
  const dateFrom = filters.dateFrom || '';
  const dateTo = filters.dateTo || '';
  const location = filters.location || '';
  const status = filters.status || '';
  const search = filters.search || '';

  let query = `
      SELECT id, company_id, job_display_id, worker_name, project, block, floor, apartment, zone,
             work_type, quantity, unit_price, total, status, description, submitted_at,
             work_was_edited, edit_history, photo_urls, timesheet_jobs, invoice_file_path,
             operative_archived, operative_archived_at,
             archived,
             collaborator_user_ids, collaborators_display
      FROM work_logs
      WHERE company_id = $1 AND archived = false
    `;
  const params = [companyId];
  let idx = 2;

  if (worker) {
    query += ` AND worker_name = $${idx}`;
    params.push(worker);
    idx++;
  }
  if (status) {
    query += ` AND status = $${idx}`;
    params.push(status);
    idx++;
  }
  if (dateFrom) {
    query += ` AND submitted_at >= $${idx}::date`;
    params.push(dateFrom);
    idx++;
  }
  if (dateTo) {
    query += ` AND submitted_at <= ($${idx}::date + INTERVAL '1 day')`;
    params.push(dateTo);
    idx++;
  }
  if (location) {
    query += ` AND (
        LOWER(COALESCE(project,'') || ' ' || COALESCE(block,'') || ' ' || COALESCE(floor,'') || ' ' || COALESCE(apartment,'') || ' ' || COALESCE(zone,'')) LIKE $${idx}
      )`;
    params.push(`%${location.toLowerCase()}%`);
    idx++;
  }
  if (search) {
    query += ` AND (
        LOWER(COALESCE(job_display_id,'')) LIKE $${idx}
        OR LOWER(COALESCE(description,'')) LIKE $${idx}
      )`;
    params.push(`%${search.toLowerCase()}%`);
    idx++;
  }

  query += ` ORDER BY submitted_at DESC`;
  return { query, params };
}

async function queryWorkLogsWithColumnFallbacks(companyId, query, params) {
  try {
    return await pool.query(query, params);
  } catch (err) {
    if (err && err.code === '42703' && /collaborators_display|collaborator_user_ids/i.test(err.message || '')) {
      const qNoCollab = query.replace(/\s*,\s*collaborator_user_ids\s*,\s*collaborators_display\s*/i, '');
      try {
        return await pool.query(qNoCollab, params);
      } catch (err2) {
        if (err2 && err2.code === '42703' && /(timesheet_jobs|operative_archived)/i.test(err2.message || '')) {
          const fallbackQuery = qNoCollab.replace(', timesheet_jobs', '').replace(', operative_archived, operative_archived_at', '');
          return await pool.query(fallbackQuery, params);
        }
        throw err2;
      }
    }
    if (err && err.code === '42703' && /(timesheet_jobs|operative_archived)/i.test(err.message || '')) {
      let fallbackQuery = query.replace(', timesheet_jobs', '').replace(', operative_archived, operative_archived_at', '');
      fallbackQuery = fallbackQuery.replace(/\s*,\s*collaborator_user_ids\s*,\s*collaborators_display\s*/i, '');
      return await pool.query(fallbackQuery, params);
    }
    throw err;
  }
}

function getJSZipCtor() {
  try {
    return require('jszip');
  } catch (_) {
    return null;
  }
}

function sanitizeMediaFolderKey(raw, fallbackKey) {
  let s = String(raw || '').trim();
  if (!s) s = String(fallbackKey || '').trim();
  if (!s) return '_unspecified';
  s = s
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^\.+|\.+$/g, '')
    .replace(/^_|_$/g, '');
  return s.slice(0, 80) || '_unspecified';
}

function compositePathFromRow(row) {
  if (!row) return '';
  const p = [row.project, row.block, row.floor, row.apartment, row.zone].filter((x) => x != null && String(x).trim() !== '');
  return p.map((x) => String(x).trim()).join(' / ');
}

function collectMediaByLocationFromRows(rows) {
  /** @type {Record<string, { display: string, urls: string[], lines: string[], seenUrl: Set<string>, seenLine: Set<string> }>} */
  const out = {};
  function ensure(key, display) {
    if (!out[key]) {
      out[key] = {
        display: display || key,
        urls: [],
        lines: [],
        seenUrl: new Set(),
        seenLine: new Set(),
      };
    }
    return out[key];
  }
  function addUrl(key, display, url) {
    if (!isSafeUploadsPublicPath(url)) return;
    const b = ensure(key, display);
    if (b.seenUrl.has(url)) return;
    b.seenUrl.add(url);
    b.urls.push(url);
  }
  function addLine(key, display, line) {
    const b = ensure(key, display);
    if (b.seenLine.has(line)) return;
    b.seenLine.add(line);
    b.lines.push(line);
  }

  (rows || []).forEach((row) => {
    const jobId = row.job_display_id || String(row.id);
    const workers = buildWorkersDisplayLine(row.worker_name, row.collaborators_display);
    const submitted = row.submitted_at ? new Date(row.submitted_at).toISOString().slice(0, 10) : '—';
    const desc = row.description ? String(row.description).trim().replace(/\s+/g, ' ').slice(0, 220) : '';
    const comp = compositePathFromRow(row);
    const defaultKey = sanitizeMediaFolderKey(comp, '_unspecified');
    const defaultDisplay = comp || '(unspecified)';

    const photos = parseJsonField(row.photo_urls, []);
    if (Array.isArray(photos)) {
      const top = photos.filter((u) => typeof u === 'string');
      if (top.length) {
        addLine(
          defaultKey,
          defaultDisplay,
          `Work entry ${jobId} | ${workers} | ${submitted} | Work log photos (${top.length}) | ${desc || '—'}`
        );
        top.forEach((url) => {
          addUrl(defaultKey, defaultDisplay, url);
        });
      }
    }

    const ts = parseJsonField(row.timesheet_jobs, []);
    if (!Array.isArray(ts)) return;

    ts.forEach((block) => {
      if (!block || typeof block !== 'object') return;
      if (block.type === 'timesheet_meta') return;
      if (block.type === 'qa_price_work') {
        const entries = Array.isArray(block.entries) ? block.entries : [];
        entries.forEach((ent) => {
          if (!ent || typeof ent !== 'object') return;
          const jn =
            ent.jobNumber != null && String(ent.jobNumber).trim() !== ''
              ? String(ent.jobNumber).trim()
              : String(ent.qaJobId != null ? ent.qaJobId : 'QA');
          const jt = (ent.jobTitle && String(ent.jobTitle).trim()) || '';
          const qaKey = sanitizeMediaFolderKey(`QA_${jn}`, 'qa_price_work');
          const qaDisplay = `QA job ${jn}${jt ? ` — ${jt}` : ''}`;
          const spu = ent.stepPhotoUrls || ent.step_photo_urls;
          if (!spu || typeof spu !== 'object') return;
          Object.keys(spu).forEach((sk) => {
            const arr = spu[sk];
            if (!Array.isArray(arr)) return;
            const urls = arr.filter((u) => typeof u === 'string');
            if (!urls.length) return;
            addLine(qaKey, qaDisplay, `Work entry ${jobId} | ${workers} | ${submitted} | QA step ${sk} | ${desc || '—'}`);
            urls.forEach((url) => {
              addUrl(qaKey, qaDisplay, url);
            });
          });
        });
        return;
      }
      const lineLoc = (block.location && String(block.location).trim()) || '';
      const lineKey = sanitizeMediaFolderKey(lineLoc, defaultKey);
      const lineDisplay = lineLoc || defaultDisplay;
      const arr = block.photos || block.photoPaths || block.photo_urls;
      const urls = Array.isArray(arr) ? arr.filter((u) => typeof u === 'string') : [];
      if (!urls.length) return;
      const dur = block.duration != null ? String(block.duration) : '';
      const duu = block.duration_unit || block.durationUnit || 'hours';
      const ld = (block.description && String(block.description).trim().slice(0, 140)) || '—';
      addLine(
        lineKey,
        lineDisplay,
        `Work entry ${jobId} | ${workers} | ${submitted} | Time sheet @ ${lineDisplay} | duration ${dur} ${duu} | ${ld}`
      );
      urls.forEach((url) => {
        addUrl(lineKey, lineDisplay, url);
      });
    });
  });

  return out;
}

function readUploadBufferSafe(publicUrl) {
  const abs = toAbsoluteUploadPath(publicUrl);
  if (!abs || !fs.existsSync(abs)) return null;
  try {
    return fs.readFileSync(abs);
  } catch (_) {
    return null;
  }
}

function buildLocationSummaryPdf(displayName, bodyLines) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks = [];
    doc.on('data', (d) => chunks.push(d));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(16).fillColor('#0f172a').text(`Work log media — ${String(displayName || '—')}`);
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#475569').text(`Generated: ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`);
    doc.moveDown(1);
    doc.fontSize(10).fillColor('#111827');
    if (bodyLines && bodyLines.length) {
      bodyLines.forEach((line) => {
        doc.text(String(line), { paragraphGap: 5 });
      });
    } else {
      doc.text('No text lines were recorded for this folder in the selected range.');
    }
    doc.end();
  });
}

function getCompanyId(req) {
  if (req.manager && req.manager.company_id != null) return req.manager.company_id;
  return null;
}

async function mediaPackage(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) {
    return res.status(403).json({ success: false, message: 'Access denied. Company not found.' });
  }

  const filters = listFiltersFromReq(req);
  const { query, params } = buildWorkLogsFilterQuery(companyId, filters);

  try {
    const result = await queryWorkLogsWithColumnFallbacks(companyId, query, params);
    const folders = collectMediaByLocationFromRows(result.rows);
    const keys = Object.keys(folders);
    const JSZip = getJSZipCtor();
    if (!JSZip) {
      return res.status(500).json({ success: false, message: 'JSZip is not available on the server.' });
    }
    const zip = new JSZip();
    let totalFiles = 0;
    for (let i = 0; i < keys.length; i++) {
      const folderKey = keys[i];
      const bag = folders[folderKey];
      const folder = zip.folder(folderKey);
      const usedNames = new Set();
      for (let u = 0; u < bag.urls.length; u++) {
        const url = bag.urls[u];
        const buf = readUploadBufferSafe(url);
        if (!buf) continue;
        totalFiles++;
        let base = path.basename(String(url).split('?')[0]) || 'photo.jpg';
        if (!/\.[a-z0-9]+$/i.test(base)) base += '.jpg';
        let name = base;
        let n = 0;
        while (usedNames.has(name)) {
          n++;
          name = `${path.parse(base).name}_${n}${path.extname(base)}`;
        }
        usedNames.add(name);
        folder.file(name, buf);
      }
      const pdfBuf = await buildLocationSummaryPdf(bag.display, bag.lines);
      folder.file('location_summary.pdf', pdfBuf);
    }
    if (keys.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No media folders matched the current filters (no photos in scope).',
      });
    }
    const outBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="worklogs_media_${Date.now()}.zip"`);
    return res.send(outBuf);
  } catch (err) {
    if (err && err.code === '42P01') {
      return res.status(404).json({ success: false, message: 'Work logs table not found.' });
    }
    console.error('worklogsMediaPackage:', err);
    return res.status(500).json({ success: false, message: 'Failed to build media package.' });
  }
}

module.exports = {
  mediaPackage,
  listFiltersFromReq,
  buildWorkLogsFilterQuery,
  queryWorkLogsWithColumnFallbacks,
};
