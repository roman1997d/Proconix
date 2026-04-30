const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

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
}).single('file');

module.exports = { uploadCloudFile };

