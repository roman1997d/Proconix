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

module.exports = { uploadPdf, safePdfFilename };
