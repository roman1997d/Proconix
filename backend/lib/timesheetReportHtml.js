'use strict';

const fs = require('fs');
const path = require('path');
const { buildTotalTimeText } = require('../templates/pdfkit/proconixPdfTemplate');

/** Same tree as express.static for `/uploads` (backend/uploads). */
var UPLOADS_ROOT = path.resolve(path.join(__dirname, '..', 'uploads'));

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDurationText(job) {
  job = job || {};
  var dur = job.duration != null ? Number(job.duration) : NaN;
  var unit = String(job.duration_unit || job.durationUnit || 'hours').toLowerCase();
  if (dur == null || isNaN(dur)) return '—';
  var n = dur;
  var u = unit === 'days' ? 'days' : 'hours';
  var plural = Math.abs(n - 1) < 1e-9 ? u.replace(/s$/i, '') : u;
  var num =
    Math.abs(n - Math.round(n)) < 1e-9
      ? String(Math.round(n))
      : (Math.round(n * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
  return num + ' ' + plural;
}

function jobPhotos(job) {
  if (!job || typeof job !== 'object') return [];
  var raw = []
    .concat(Array.isArray(job.photos) ? job.photos : [])
    .concat(Array.isArray(job.photoUrls) ? job.photoUrls : [])
    .concat(Array.isArray(job.photo_paths) ? job.photo_paths : [])
    .concat(Array.isArray(job.photoPaths) ? job.photoPaths : []);
  var out = [];
  var seen = {};
  raw.forEach(function (p) {
    var s = '';
    if (typeof p === 'string') s = p.trim();
    else if (p && typeof p === 'object') {
      s = String(p.url || p.path || p.filePath || p.file_path || p.file_url || p.src || '').trim();
    }
    if (!s) return;
    if (/^uploads\//i.test(s)) s = '/' + s.replace(/^\/+/, '');
    var k = s.toLowerCase();
    if (seen[k]) return;
    seen[k] = true;
    out.push(s);
  });
  return out;
}

/** Embed server-stored uploads so the HTML shows images without relying on browser path resolution. */
function localUploadPathToDataUrl(publicPath) {
  if (!publicPath || typeof publicPath !== 'string') return null;
  var p = publicPath.trim();
  if (!p.startsWith('/uploads/') || p.indexOf('..') >= 0) return null;
  var rel = p.replace(/^\/uploads\//, '');
  var abs = path.resolve(path.join(UPLOADS_ROOT, rel));
  if (abs !== UPLOADS_ROOT && !abs.startsWith(UPLOADS_ROOT + path.sep)) return null;
  try {
    var buf = fs.readFileSync(abs);
    var ext = path.extname(abs).toLowerCase();
    var mime = 'image/jpeg';
    if (ext === '.png') mime = 'image/png';
    else if (ext === '.gif') mime = 'image/gif';
    else if (ext === '.webp') mime = 'image/webp';
    else if (ext === '.svg') mime = 'image/svg+xml';
    else if (ext === '.bmp') mime = 'image/bmp';
    return 'data:' + mime + ';base64,' + buf.toString('base64');
  } catch (_) {
    return null;
  }
}

function resolveImgSrcForHtml(u) {
  var t = String(u || '').trim();
  if (!t) return '';
  if (/^data:image\//i.test(t)) return t;
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith('/uploads/')) {
    var embedded = localUploadPathToDataUrl(t);
    if (embedded) return embedded;
  }
  return t;
}

/**
 * Self-contained printable time sheet report (HTML).
 * Client fallback in operative_dashboard.js should mirror payload fields.
 */
function buildTimesheetHtmlDocument(opts) {
  opts = opts || {};
  var jobs = Array.isArray(opts.jobs) ? opts.jobs : [];
  var workerName = opts.workerName || 'Operative';
  var projectName = opts.projectName || '—';
  var workType = opts.workType || '—';
  var totalBeforeTax =
    opts.totalBeforeTax != null && !isNaN(Number(opts.totalBeforeTax)) ? Number(opts.totalBeforeTax) : 0;
  var periodRange = opts.periodRange || '—';
  var logoDataUrl = opts.logoDataUrl && String(opts.logoDataUrl).trim() ? String(opts.logoDataUrl).trim() : '';
  var workDescription = opts.workDescription != null ? String(opts.workDescription).trim() : '';
  var totalTimeText = buildTotalTimeText(jobs);

  var summaryRows = [
    { label: 'Worker(s)', value: workerName },
    { label: 'Project', value: projectName },
    { label: 'Work type', value: workType },
    { label: 'Total (before tax)', value: '£' + totalBeforeTax.toFixed(2) },
    { label: 'Total time', value: totalTimeText },
  ];

  var summaryHtml = summaryRows
    .map(function (row) {
      return (
        '<div class="sum-row"><span class="sum-label">' +
        escapeHtml(row.label) +
        '</span><span class="sum-val">' +
        escapeHtml(row.value) +
        '</span></div>'
      );
    })
    .join('');

  var jobsHtml = jobs
    .map(function (job, jobIdx) {
      job = job || {};
      var location = job.location != null && String(job.location).trim() ? String(job.location).trim() : '—';
      var description = job.description != null && String(job.description).trim() ? String(job.description).trim() : '—';
      var stageRaw = job.stage || 'ongoing';
      var stage = stageRaw === 'complete' ? 'completed' : String(stageRaw);
      var progressPct = job.progress_pct != null ? job.progress_pct : job.progressPct;
      var durationText = fmtDurationText(job);
      var stageClass = stage === 'completed' ? 'stage-done' : 'stage-ongoing';
      var progLine =
        stage === 'ongoing' && progressPct != null && !isNaN(Number(progressPct))
          ? '<p class="job-meta"><strong>Progress:</strong> ' + escapeHtml(String(progressPct)) + '%</p>'
          : '';

      var photos = jobPhotos(job);
      var photosHtml = '';
      if (photos.length) {
        photosHtml =
          '<div class="job-photos">' +
          photos
            .map(function (url) {
              var u = String(url).trim();
              if (!u) return '';
              var src = resolveImgSrcForHtml(u);
              return '<figure class="ph"><img src="' + escapeHtml(src) + '" alt=""></figure>';
            })
            .join('') +
          '</div>';
      }

      return (
        '<article class="job-card">' +
        '<div class="job-accent"></div>' +
        '<div class="job-inner">' +
        '<h3 class="job-title">Job ' +
        (jobIdx + 1) +
        ' · ' +
        escapeHtml(location) +
        '</h3>' +
        '<p class="job-label">Description</p>' +
        '<div class="job-desc">' +
        escapeHtml(description).replace(/\r\n|\r|\n/g, '<br>') +
        '</div>' +
        '<p class="job-meta job-time"><strong>Time spent:</strong> ' +
        escapeHtml(durationText) +
        '</p>' +
        '<p class="job-meta ' +
        stageClass +
        '"><strong>Job stage:</strong> ' +
        escapeHtml(stage) +
        '</p>' +
        progLine +
        photosHtml +
        '</div></article>'
      );
    })
    .join('');

  var logoBlock = '';
  if (logoDataUrl && (/^data:image\//i.test(logoDataUrl) || logoDataUrl.indexOf('/uploads/') === 0)) {
    var logoSrc = resolveImgSrcForHtml(logoDataUrl);
    logoBlock = '<div class="logo-wrap"><img class="logo" src="' + escapeHtml(logoSrc) + '" alt=""></div>';
  }

  var descBlock = '';
  if (workDescription) {
    descBlock =
      '<section class="intro"><h2>Summary</h2><p class="intro-text">' +
      escapeHtml(workDescription).replace(/\r\n|\r|\n/g, '<br>') +
      '</p></section>';
  }

  return (
    '<!DOCTYPE html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>Time Sheet Report</title>\n' +
    '<style>\n' +
    '*{box-sizing:border-box}\n' +
    'body{margin:0;font-family:Helvetica,Arial,sans-serif;background:#f1f5f9;color:#0f172a;line-height:1.45}\n' +
    '.wrap{max-width:900px;margin:0 auto;padding:24px 20px 48px}\n' +
    'header{background:#0f172a;color:#fff;padding:28px 32px 32px;border-radius:0 0 12px 12px;position:relative}\n' +
    'header h1{margin:0 0 6px;font-size:1.75rem;font-weight:700}\n' +
    'header .sub{color:#94a3b8;font-size:0.95rem}\n' +
    '.logo-wrap{position:absolute;right:28px;top:24px}\n' +
    '.logo{width:56px;height:56px;object-fit:contain;border-radius:8px;background:#fff;padding:4px}\n' +
    '.period-band{margin-top:20px;background:#e2e8f0;border:1px solid #cbd5e1;border-radius:10px;padding:14px 18px;display:flex;flex-wrap:wrap;gap:8px;align-items:baseline}\n' +
    '.period-band strong{color:#0f172a;font-size:0.85rem}\n' +
    '.period-band .dates{color:#1e40af;font-weight:700;font-size:1.05rem}\n' +
    '.summary{margin-top:22px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}\n' +
    '.sum-row{display:flex;justify-content:space-between;gap:16px;padding:12px 16px;border-bottom:1px solid #e2e8f0}\n' +
    '.sum-row:nth-child(odd){background:#f8fafc}\n' +
    '.sum-label{color:#475569;font-weight:600;font-size:0.88rem}\n' +
    '.sum-val{color:#0f172a;text-align:right;font-size:0.95rem}\n' +
    'section.jobs{margin-top:28px}\n' +
    'section.jobs>h2{font-size:1.35rem;margin:0 0 16px;padding-bottom:8px;border-bottom:3px solid #2563eb}\n' +
    '.job-card{display:flex;margin-bottom:20px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;overflow:hidden}\n' +
    '.job-accent{width:5px;flex-shrink:0;background:#2563eb}\n' +
    '.job-inner{flex:1;padding:18px 20px}\n' +
    '.job-title{margin:0 0 12px;font-size:1.1rem;color:#0f172a}\n' +
    '.job-label{margin:0 0 4px;font-size:0.72rem;font-weight:700;color:#475569;letter-spacing:0.04em}\n' +
    '.job-desc{margin:0 0 12px;font-size:0.95rem;white-space:pre-wrap}\n' +
    '.job-meta{margin:6px 0;font-size:0.92rem}\n' +
    '.job-time{color:#1e40af;font-weight:600}\n' +
    '.stage-done{color:#15803d;font-weight:600}\n' +
    '.stage-ongoing{color:#b45309;font-weight:600}\n' +
    '.job-photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-top:16px}\n' +
    '.job-photos .ph{margin:0;background:#fff;border:1px solid #94a3b8;border-radius:8px;overflow:hidden}\n' +
    '.job-photos img{display:block;width:100%;height:auto;max-height:280px;object-fit:contain}\n' +
    'section.intro{margin-top:24px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px 18px}\n' +
    'section.intro h2{margin:0 0 10px;font-size:1rem;color:#0f172a}\n' +
    '.intro-text{margin:0;font-size:0.95rem;white-space:pre-wrap}\n' +
    'footer{margin-top:36px;padding-top:16px;border-top:1px solid #cbd5e1;text-align:center;font-size:0.82rem;color:#64748b}\n' +
    '@media print{body{background:#fff}.wrap{max-width:none;padding:0}header{border-radius:0}}\n' +
    '</style>\n' +
    '</head>\n' +
    '<body>\n' +
    '<div class="wrap">\n' +
    '<header>\n' +
    logoBlock +
    '<h1>Time Sheet Report</h1>\n' +
    '<p class="sub">Generated by Proconix Work Reports</p>\n' +
    '<div class="period-band"><strong>For period of time:</strong> <span class="dates">' +
    escapeHtml(periodRange) +
    '</span></div>\n' +
    '</header>\n' +
    '<div class="summary">' +
    summaryHtml +
    '</div>\n' +
    descBlock +
    '<section class="jobs"><h2>Job list</h2>' +
    (jobsHtml || '<p class="intro-text">No jobs.</p>') +
    '</section>\n' +
    '<footer>Generated by Proconix Work Reports · proconix.uk</footer>\n' +
    '</div>\n' +
    '</body>\n' +
    '</html>\n'
  );
}

module.exports = {
  buildTimesheetHtmlDocument,
  escapeHtml,
};
