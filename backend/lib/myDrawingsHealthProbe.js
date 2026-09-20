/**
 * Canary drawing + wall-type image served through the real My Drawings download routes.
 * The probe files live under uploads/mydrawings/.health/ and are never user documents.
 */

const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const http = require('http');
const path = require('path');
const { UPLOADS_ROOT } = require('../middleware/resolveCompanyDocsDir');

const HEALTH_PROBE_ID = 'health-probe';
const HEALTH_PROBE_HEADER = 'x-proconix-health-probe';
const HEALTH_PROBE_TOKEN = crypto.randomBytes(24).toString('hex');
const CHECK_TIMEOUT_MS = 2500;
const MAX_BODY_BYTES = 64 * 1024;

const PROBE_DIR = path.join(UPLOADS_ROOT, 'mydrawings', '.health');
const PROBE_PDF_NAME = 'probe.pdf';
const PROBE_JPEG_NAME = 'probe.jpg';
const PROBE_PDF_REL = 'mydrawings/.health/probe.pdf';
const PROBE_JPEG_REL = 'mydrawings/.health/probe.jpg';

const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n' +
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n' +
    '3 0 obj<</Type/Page/MediaBox[0 0 72 72]/Parent 2 0 R>>endobj\n' +
    'trailer<</Root 1 0 R>>\n' +
    '%%EOF\n',
  'utf8'
);

/* 1x1 JPEG — not a user photo */
const MINIMAL_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8Af//Z',
  'base64'
);

function healthProbeContext() {
  return {
    healthProbe: true,
    role: 'admin',
    workspace: { id: 0, name: 'health-probe' },
    project: { id: 0, name: 'health-probe' },
  };
}

function healthProbeDrawingItem() {
  return {
    id: HEALTH_PROBE_ID,
    healthProbe: true,
    workspace_id: null,
    project_id: null,
    number: 'HEALTH-PROBE',
    title: 'Health probe',
    relative_path: PROBE_PDF_REL,
    stored_filename: PROBE_PDF_NAME,
    mime_type: 'application/pdf',
  };
}

function probePdfAbs() {
  return path.join(PROBE_DIR, PROBE_PDF_NAME);
}

function probeJpegAbs() {
  return path.join(PROBE_DIR, PROBE_JPEG_NAME);
}

function isHealthProbeId(id) {
  return String(id || '') === HEALTH_PROBE_ID;
}

function headerToken(req) {
  const raw = req && req.headers && req.headers[HEALTH_PROBE_HEADER];
  return raw == null ? '' : String(raw).trim();
}

function tokensMatch(provided) {
  const a = Buffer.from(String(provided || ''), 'utf8');
  const b = Buffer.from(HEALTH_PROBE_TOKEN, 'utf8');
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch (_) {
    return false;
  }
}

function isHealthProbeDownload(req) {
  if (!req || req.method !== 'GET') return false;
  if (!isHealthProbeId(req.params && req.params.id)) return false;
  if (!tokensMatch(headerToken(req))) return false;
  const url = String(req.originalUrl || req.url || '').split('?')[0];
  return /\/drawings\/health-probe\/file$/.test(url) || /\/wall-types\/health-probe\/image$/.test(url);
}

async function ensureProbeFiles() {
  await fsp.mkdir(PROBE_DIR, { recursive: true });
  const pdf = probePdfAbs();
  const jpeg = probeJpegAbs();
  await writeIfMissing(pdf, MINIMAL_PDF);
  await writeIfMissing(jpeg, MINIMAL_JPEG);
  return { pdf, jpeg };
}

async function writeIfMissing(abs, buf) {
  try {
    const st = await fsp.stat(abs);
    if (st.isFile() && st.size >= 20) return;
  } catch (_) {
    /* create */
  }
  await fsp.writeFile(abs, buf);
}

function loopbackBases() {
  const bases = [];
  const explicit = String(process.env.PROCONIX_INTERNAL_HEALTH_URL || '').trim();
  if (explicit) {
    bases.push(explicit.replace(/\/api\/health(?:\/.*)?$/, ''));
  }
  const port = parseInt(process.env.PORT || '3000', 10);
  bases.push(`http://127.0.0.1:${port}`);
  bases.push(`http://localhost:${port}`);
  bases.push(`http://[::1]:${port}`);
  return bases.filter((b, i, arr) => b && arr.indexOf(b) === i);
}

function httpGetBuffer(url, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers, timeout: timeoutMs }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY_BYTES) {
          req.destroy();
          reject(Object.assign(new Error('too large'), { code: 'ETOOLARGE' }));
          return;
        }
        chunks.push(c);
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          contentType: String(res.headers['content-type'] || ''),
          body: Buffer.concat(chunks),
        });
      });
    });
    req.on('timeout', () => {
      req.destroy();
      reject(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));
    });
    req.on('error', reject);
  });
}

async function httpGetFirstReachable(pathname) {
  const headers = { [HEALTH_PROBE_HEADER]: HEALTH_PROBE_TOKEN };
  let lastErr = null;
  for (const base of loopbackBases()) {
    const url = `${base}${pathname}`;
    try {
      return await httpGetBuffer(url, headers, CHECK_TIMEOUT_MS);
    } catch (err) {
      lastErr = err;
      const code = err && err.code;
      if (code !== 'ECONNREFUSED' && code !== 'ENOTFOUND' && code !== 'EHOSTUNREACH' && code !== 'EAI_AGAIN') {
        throw err;
      }
    }
  }
  throw lastErr || Object.assign(new Error('unreachable'), { code: 'ECONNREFUSED' });
}

function publicCode(err) {
  if (!err) return 'failed';
  if (err.code) return String(err.code);
  return 'failed';
}

function summarizePdf(res, latencyMs) {
  const body = res.body || Buffer.alloc(0);
  const looksPdf = body.slice(0, 4).toString('utf8') === '%PDF';
  const jsonError = /json/i.test(res.contentType);
  let status = 'ok';
  let code;
  if (res.statusCode !== 200) {
    status = 'error';
    code = `HTTP_${res.statusCode}`;
  } else if (jsonError || !looksPdf || body.length < 20) {
    status = 'error';
    code = jsonError ? 'ENOTFILE' : 'ENOTPDF';
  }
  const out = {
    status,
    http_status: res.statusCode,
    bytes: body.length,
    pdf: looksPdf,
    latency_ms: latencyMs,
  };
  if (code) out.code = code;
  return out;
}

function summarizeJpeg(res, latencyMs) {
  const body = res.body || Buffer.alloc(0);
  const looksJpeg = body.length >= 2 && body[0] === 0xff && body[1] === 0xd8;
  const jsonError = /json/i.test(res.contentType);
  let status = 'ok';
  let code;
  if (res.statusCode !== 200) {
    status = 'error';
    code = `HTTP_${res.statusCode}`;
  } else if (jsonError || !looksJpeg || body.length < 20) {
    status = 'error';
    code = jsonError ? 'ENOTFILE' : 'ENOTJPEG';
  }
  const out = {
    status,
    http_status: res.statusCode,
    bytes: body.length,
    jpeg: looksJpeg,
    latency_ms: latencyMs,
  };
  if (code) out.code = code;
  return out;
}

async function probeRoute(pathname, kind) {
  const t0 = Date.now();
  try {
    const res = await httpGetFirstReachable(pathname);
    const latency = Date.now() - t0;
    return kind === 'jpeg' ? summarizeJpeg(res, latency) : summarizePdf(res, latency);
  } catch (err) {
    return {
      status: 'error',
      code: publicCode(err),
      latency_ms: Date.now() - t0,
    };
  }
}

async function checkMyDrawingsDownload() {
  try {
    await ensureProbeFiles();
  } catch (err) {
    return {
      status: 'error',
      code: publicCode(err),
      web: { status: 'error' },
      mobile: { status: 'error' },
      image: { status: 'error' },
      image_mobile: { status: 'error' },
    };
  }
  const [web, mobile, image, imageMobile] = await Promise.all([
    probeRoute('/api/my-drawings/drawings/health-probe/file', 'pdf'),
    probeRoute('/api/drawings/health-probe/file', 'pdf'),
    probeRoute('/api/my-drawings/wall-types/health-probe/image', 'jpeg'),
    probeRoute('/api/wall-types/health-probe/image', 'jpeg'),
  ]);
  const status =
    web.status === 'ok' &&
    mobile.status === 'ok' &&
    image.status === 'ok' &&
    imageMobile.status === 'ok'
      ? 'ok'
      : 'error';
  return { status, web, mobile, image, image_mobile: imageMobile };
}

module.exports = {
  HEALTH_PROBE_ID,
  HEALTH_PROBE_HEADER,
  PROBE_PDF_REL,
  PROBE_JPEG_REL,
  healthProbeContext,
  healthProbeDrawingItem,
  probePdfAbs,
  probeJpegAbs,
  isHealthProbeId,
  isHealthProbeDownload,
  ensureProbeFiles,
  checkMyDrawingsDownload,
};
