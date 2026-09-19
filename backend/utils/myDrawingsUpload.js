/**
 * Multer for My Drawings PDFs. Destination: req.myDrawingsUploadDir.
 */

const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

function safePdfFilename() {
  return `md-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.pdf`;
}

const uploadPdf = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (!req.myDrawingsUploadDir) {
        return cb(new Error('Upload directory not configured'));
      }
      return cb(null, req.myDrawingsUploadDir);
    },
    filename: (req, file, cb) => {
      cb(null, safePdfFilename());
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    const mimeOk = file.mimetype === 'application/pdf' || file.mimetype === 'application/x-pdf';
    const extOk = name.endsWith('.pdf');
    if (!mimeOk && !extOk) {
      return cb(new Error('Only PDF files are allowed'));
    }
    cb(null, true);
  },
}).single('file');

const uploadCompanyLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    const mimeOk = /image\/(jpeg|pjpeg|png|webp|gif)/.test(file.mimetype || '');
    const extOk = /\.(jpe?g|png|webp|gif)$/.test(name);
    if (!mimeOk && !extOk) {
      return cb(new Error('Logo must be a JPG, PNG, or WebP image.'));
    }
    cb(null, true);
  },
}).single('logo');

const uploadWallTypeImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    const mimeOk = /image\/(jpeg|pjpeg|png|webp|gif)/.test(file.mimetype || '');
    const extOk = /\.(jpe?g|png|webp|gif)$/.test(name);
    if (!mimeOk && !extOk) {
      return cb(new Error('Construction detail must be a JPG, PNG, or WebP image.'));
    }
    cb(null, true);
  },
}).single('image');

module.exports = { uploadPdf, uploadCompanyLogo, uploadWallTypeImage, safePdfFilename };
