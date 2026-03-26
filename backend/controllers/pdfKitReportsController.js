const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { pool } = require('../db/pool');
const {
  formatDateRange,
  resolveImageToBuffer,
  renderTimesheet,
  renderWorkReport,
} = require('../templates/pdfkit/proconixPdfTemplate');

async function getWorkerAndProjectMeta(req, payload) {
  payload = payload || {};
  var op = req && req.operative ? req.operative : null;

  var workerName = payload.workerName || payload.worker_name || null;
  var projectName = payload.project || payload.projectName || payload.project_name || null;
  var projectId = payload.project_id || payload.projectId || null;

  if (!workerName && op && op.id != null) {
    try {
      var r = await pool.query('SELECT name, email FROM users WHERE id = $1', [op.id]);
      if (r.rows && r.rows[0]) {
        workerName = r.rows[0].name || r.rows[0].email || null;
      }
    } catch (_) {
      /* Best-effort */
    }
  }

  if (!projectName) {
    if (!projectId && op && op.id != null) {
      try {
        var u = await pool.query('SELECT project_id FROM users WHERE id = $1', [op.id]);
        if (u.rows && u.rows[0] && u.rows[0].project_id != null) projectId = u.rows[0].project_id;
      } catch (_) {
        /* ignore */
      }
    }

    if (!projectId && op && op.id != null) {
      try {
        var pa = await pool.query(
          'SELECT project_id FROM project_assignments WHERE user_id = $1 ORDER BY assigned_at DESC LIMIT 1',
          [op.id]
        );
        if (pa.rows && pa.rows[0] && pa.rows[0].project_id != null) projectId = pa.rows[0].project_id;
      } catch (_) {
        /* ignore */
      }
    }

    if (projectId != null) {
      try {
        var p = await pool.query('SELECT COALESCE(project_name, name) AS name FROM projects WHERE id = $1', [projectId]);
        if (p.rows && p.rows[0] && p.rows[0].name != null) projectName = p.rows[0].name;
      } catch (_) {
        /* ignore */
      }
    }
  }

  if (!workerName) workerName = 'Operative';
  if (!projectName) projectName = '—';
  return { workerName, projectName };
}

function mergePhotoList(payload) {
  var raw = []
    .concat(Array.isArray(payload.photos) ? payload.photos : [])
    .concat(Array.isArray(payload.photoUrls) ? payload.photoUrls : [])
    .concat(Array.isArray(payload.photo_urls) ? payload.photo_urls : [])
    .concat(Array.isArray(payload.photoPaths) ? payload.photoPaths : []);
  var seen = new Set();
  var out = [];
  raw.forEach(function (p) {
    if (p == null || typeof p !== 'string') return;
    var k = p.trim();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(k);
  });
  return out;
}

async function generateTimesheetPdf(req, res) {
  try {
    var payload = req.body || {};
    var jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
    var logoValue = payload.logoDataUrl || payload.logo_data_url || payload.logoFilePath || payload.logo_file_path || null;

    var workType = payload.work_type || payload.workType || '—';
    var beforeRaw = payload.total_before_tax != null ? payload.total_before_tax : payload.totalBeforeTax;
    var totalBeforeTax = beforeRaw != null ? Number(beforeRaw) : 0;

    var dateFrom = payload.period_from || payload.periodFrom || payload.date_from || payload.dateFrom || '';
    var dateTo = payload.period_to || payload.periodTo || payload.date_to || payload.dateTo || '';
    if (!dateTo) dateTo = dateFrom;
    var periodRange = formatDateRange(dateFrom, dateTo);

    var meta = await getWorkerAndProjectMeta(req, payload);

    var fileDate = new Date().toISOString().slice(0, 10);
    var fileName = 'timesheet_report_' + fileDate + '.pdf';
    var outPath = path.join(__dirname, '../uploads/worklogs/timesheets', fileName);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    var doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });
    var stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    var logoBuf = logoValue ? resolveImageToBuffer(logoValue) : null;

    renderTimesheet(doc, {
      jobs: jobs,
      workerName: meta.workerName,
      projectName: meta.projectName,
      workType: workType,
      totalBeforeTax: totalBeforeTax,
      periodRange: periodRange,
      logoBuf: logoBuf,
    });

    doc.end();

    return await new Promise(function (resolve, reject) {
      stream.on('finish', function () {
        resolve(
          res.status(200).json({
            success: true,
            pdfUrl: '/uploads/worklogs/timesheets/' + fileName,
            pdfPath: '/uploads/worklogs/timesheets/' + fileName,
          })
        );
      });
      stream.on('error', reject);
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to generate timesheet PDF.' });
  }
}

async function generateWorkReportPdf(req, res) {
  try {
    var payload = req.body || {};
    var photos = mergePhotoList(payload);
    var logoValue = payload.logoDataUrl || payload.logo_data_url || payload.logoFilePath || payload.logo_file_path || null;

    var workSummary = payload.work_performed || payload.workPerformed || payload.work_summary || payload.summary || '—';
    var notes = payload.notes || payload.extra_notes || payload.extraNotes || '—';
    var beforeRaw = payload.total_before_tax != null ? payload.total_before_tax : payload.totalBeforeTax;
    var totalBeforeTax = beforeRaw != null ? Number(beforeRaw) : 0;

    var from = payload.date_from || payload.dateFrom || payload.work_date_from || payload.workDateFrom || '';
    var to = payload.date_to || payload.dateTo || payload.work_date_to || payload.workDateTo || '';
    var periodRange = formatDateRange(from, to);

    var meta = await getWorkerAndProjectMeta(req, payload);
    var location = payload.location || payload.block || payload.floor || payload.zone || '—';

    var fileDate = new Date().toISOString().slice(0, 10);
    var fileName = 'work_report_' + fileDate + '.pdf';
    var outPath = path.join(__dirname, '../uploads/worklogs/work-reports', fileName);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    var doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });
    var stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    var logoBuf = logoValue ? resolveImageToBuffer(logoValue) : null;

    renderWorkReport(doc, {
      photos: photos,
      workSummary: workSummary,
      notes: notes,
      totalBeforeTax: totalBeforeTax,
      periodRange: periodRange,
      workerName: meta.workerName,
      projectName: meta.projectName,
      location: location,
      logoBuf: logoBuf,
    });

    doc.end();

    return await new Promise(function (resolve, reject) {
      stream.on('finish', function () {
        var url = '/uploads/worklogs/work-reports/' + fileName;
        resolve(res.status(200).json({ success: true, pdfUrl: url, pdfPath: url }));
      });
      stream.on('error', reject);
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to generate work report PDF.' });
  }
}

module.exports = {
  generateTimesheetPdf,
  generateWorkReportPdf,
};
