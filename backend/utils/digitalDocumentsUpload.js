/**
 * Multer for PDF uploads into req.digitalDocsCompanyDir (set by resolveCompanyDocsDir).
 */

const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

function safePdfFilename(original) {
  const ext = path.extname(original || '').toLowerCase() === '.pdf' ? '.pdf' : '.pdf';
  return `doc-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
}

const uploadPdf = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (!req.digitalDocsCompanyDir) {
        return cb(new Error('Upload directory not configured'));
      }
      return cb(null, req.digitalDocsCompanyDir);
    },
    filename: (req, file, cb) => {
      cb(null, safePdfFilename(file.originalname));
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const mimeOk = file.mimetype === 'application/pdf' || file.mimetype === 'application/x-pdf';
    const extOk = name.endsWith('.pdf');
    if (!mimeOk && !extOk) {
      return cb(new Error('Only PDF files are allowed'));
    }
    cb(null, true);
  },
}).single('file');

module.exports = { uploadPdf, safePdfFilename };
