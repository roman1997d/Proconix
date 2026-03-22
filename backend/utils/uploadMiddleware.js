const path = require('path');
const multer = require('multer');
const fs = require('fs');

const uploadDir = path.resolve(__dirname, '../uploads');
const issuesDir = path.join(uploadDir, 'issues');
const documentsDir = path.join(uploadDir, 'documents');
const worklogsDir = path.join(uploadDir, 'worklogs');
const taskPhotosDir = path.join(uploadDir, 'task-photos');

[uploadDir, issuesDir, documentsDir, worklogsDir, taskPhotosDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function safeFilename(original) {
  const ext = path.extname(original || '') || '';
  const base = Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  return base + ext.toLowerCase();
}

const storageIssues = multer.diskStorage({
  destination: (req, file, cb) => cb(null, issuesDir),
  filename: (req, file, cb) => cb(null, safeFilename(file.originalname)),
});

const storageDocuments = multer.diskStorage({
  destination: (req, file, cb) => cb(null, documentsDir),
  filename: (req, file, cb) => cb(null, safeFilename(file.originalname)),
});

const uploadIssueFile = multer({
  storage: storageIssues,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('file');

const uploadDocumentFile = multer({
  storage: storageDocuments,
  limits: { fileSize: 15 * 1024 * 1024 },
}).single('file');

const storageWorklogs = multer.diskStorage({
  destination: (req, file, cb) => cb(null, worklogsDir),
  filename: (req, file, cb) => cb(null, safeFilename(file.originalname)),
});

const uploadWorklogFile = multer({
  storage: storageWorklogs,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('file');

const storageTaskPhotos = multer.diskStorage({
  destination: (req, file, cb) => cb(null, taskPhotosDir),
  filename: (req, file, cb) => cb(null, safeFilename(file.originalname)),
});

const uploadTaskPhotoFile = multer({
  storage: storageTaskPhotos,
  limits: { fileSize: 8 * 1024 * 1024 },
}).single('file');

const UPLOAD_SUBPATH = {
  issues: 'issues/',
  documents: 'documents/',
  worklogs: 'worklogs/',
  'task-photos': 'task-photos/',
};

function injectFileUrl(type) {
  return (req, res, next) => {
    if (req.file) {
      const sub = UPLOAD_SUBPATH[type] || 'worklogs/';
      req.body.file_url = '/uploads/' + sub + req.file.filename;
    }
    next();
  };
}

module.exports = {
  uploadIssueFile,
  uploadDocumentFile,
  uploadWorklogFile,
  uploadTaskPhotoFile,
  injectFileUrl,
};
