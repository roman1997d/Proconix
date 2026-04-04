/**
 * Resolves backend/uploads/{SanitizedCompanyName}_{companyId}_docs/ for digital documents.
 * Creates directories including a `signatures` subfolder.
 * Attach after requireManagerAuth (uses req.manager.company_id).
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../db/pool');

const UPLOADS_ROOT = path.resolve(__dirname, '..', 'uploads');

function sanitizeCompanyFolderName(name) {
  const s = String(name || 'company')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return s || 'company';
}

/**
 * Folder pattern: {sanitized_name}_{companyId}_docs (unique per tenant).
 */
async function resolveCompanyDocsDir(req, res, next) {
  if (!req.manager || req.manager.company_id == null) {
    return res.status(401).json({ success: false, message: 'Manager session required.' });
  }
  const companyId = req.manager.company_id;
  try {
    const r = await pool.query('SELECT name FROM companies WHERE id = $1', [companyId]);
    const rawName = r.rows[0]?.name != null ? String(r.rows[0].name) : `company${companyId}`;
    const safe = sanitizeCompanyFolderName(rawName);
    const folderName = `${safe}_${companyId}_docs`;
    const abs = path.join(UPLOADS_ROOT, folderName);
    const sigDir = path.join(abs, 'signatures');
    fs.mkdirSync(abs, { recursive: true });
    fs.mkdirSync(sigDir, { recursive: true });
    req.digitalDocsCompanyDir = abs;
    req.digitalDocsFolderName = folderName;
    req.digitalDocsSignaturesDir = sigDir;
    req.digitalDocsCompanyId = companyId;
    return next();
  } catch (err) {
    console.error('resolveCompanyDocsDir:', err);
    return res.status(500).json({ success: false, message: 'Could not prepare upload directory.' });
  }
}

/**
 * For operative sign: load document, verify company, set paths (no manager on req).
 */
async function resolveCompanyDocsDirForDocument(req, res, next) {
  const docId = parseInt(req.params.id, 10);
  if (!Number.isInteger(docId) || docId < 1) {
    return res.status(400).json({ success: false, message: 'Invalid document id.' });
  }
  if (!req.operative) {
    return res.status(401).json({ success: false, message: 'Operative session required.' });
  }
  try {
    const d = await pool.query('SELECT company_id FROM digital_documents WHERE id = $1', [docId]);
    if (!d.rows.length) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }
    const companyId = d.rows[0].company_id;
    if (companyId !== req.operative.company_id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    const r = await pool.query('SELECT name FROM companies WHERE id = $1', [companyId]);
    const rawName = r.rows[0]?.name != null ? String(r.rows[0].name) : `company${companyId}`;
    const safe = sanitizeCompanyFolderName(rawName);
    const folderName = `${safe}_${companyId}_docs`;
    const abs = path.join(UPLOADS_ROOT, folderName);
    const sigDir = path.join(abs, 'signatures');
    fs.mkdirSync(abs, { recursive: true });
    fs.mkdirSync(sigDir, { recursive: true });
    req.digitalDocsCompanyDir = abs;
    req.digitalDocsFolderName = folderName;
    req.digitalDocsSignaturesDir = sigDir;
    req.digitalDocsCompanyId = companyId;
    req.digitalDocumentId = docId;
    return next();
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({
        success: false,
        message: 'Digital documents tables are missing. Run scripts/create_digital_documents_tables.sql',
      });
    }
    console.error('resolveCompanyDocsDirForDocument:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = {
  UPLOADS_ROOT,
  sanitizeCompanyFolderName,
  resolveCompanyDocsDir,
  resolveCompanyDocsDirForDocument,
};
