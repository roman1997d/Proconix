const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.txt',
  '.csv',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.zip',
  '.rar',
  '.7z',
]);

const DANGEROUS_EXTENSIONS = new Set([
  '.exe',
  '.msi',
  '.bat',
  '.cmd',
  '.sh',
  '.ps1',
  '.js',
  '.jar',
  '.com',
  '.scr',
  '.vb',
  '.vbs',
  '.php',
  '.py',
  '.rb',
  '.pl',
  '.apk',
]);

function safeBaseName(name) {
  return String(name || 'file')
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'file';
}

function buildStoredName(original) {
  const ext = path.extname(String(original || '')).toLowerCase().slice(0, 12);
  const base = safeBaseName(original);
  return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${base}${ext}`;
}

function isAllowedUpload(originalName) {
  const ext = path.extname(String(originalName || '')).toLowerCase();
  if (!ext) return false;
  if (DANGEROUS_EXTENSIONS.has(ext)) return false;
  return ALLOWED_EXTENSIONS.has(ext);
}

const uploadCloudFile = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (!req.siteCloudCompanyDir) return cb(new Error('Cloud directory not configured'));
      cb(null, req.siteCloudCompanyDir);
    },
    filename: (req, file, cb) => {
      cb(null, buildStoredName(file.originalname));
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!isAllowedUpload(file.originalname)) {
      return cb(new Error('Blocked file type. Allowed: docs, images, archives, and PDF.'));
    }
    cb(null, true);
  },
}).single('file');

module.exports = { uploadCloudFile };

