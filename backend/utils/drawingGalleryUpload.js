/**
 * Multer for Drawing Gallery: PDF + common images (+ optional DWG store-only).
 * Destination set on req.drawingUploadDir by drawingGalleryProjectMiddleware.
 */

const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const ALLOWED_EXT = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.dwg']);

function safeName(original) {
  const ext = path.extname(original || '').toLowerCase();
  const base = ALLOWED_EXT.has(ext) ? ext : '.bin';
  return `dg-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${base}`;
}

const drawingFileUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (!req.drawingUploadDir) {
        return cb(new Error('Drawing upload directory not configured'));
      }
      return cb(null, req.drawingUploadDir);
    },
    filename: (req, file, cb) => {
      cb(null, safeName(file.originalname));
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const ext = path.extname(name);
    if (!ALLOWED_EXT.has(ext)) {
      return cb(new Error('Allowed: PDF, PNG, JPG, GIF, WebP, DWG'));
    }
    cb(null, true);
  },
}).single('file');

module.exports = { drawingFileUpload, safeName };
