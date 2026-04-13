/**
 * After requireManagerAuth + resolveCompanyDocsDir:
 * Validates :projectId belongs to manager's company and prepares drawing upload dir.
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../db/pool');

async function drawingGalleryProjectForManagerUpload(req, res, next) {
  if (!req.manager || req.manager.company_id == null) {
    return res.status(401).json({ success: false, message: 'Manager session required.' });
  }
  if (!req.digitalDocsCompanyDir) {
    return res.status(500).json({ success: false, message: 'Company upload path not configured.' });
  }

  const projectId = parseInt(req.params.projectId, 10);
  if (!Number.isInteger(projectId) || projectId < 1) {
    return res.status(400).json({ success: false, message: 'Invalid project id.' });
  }

  const companyId = req.manager.company_id;
  try {
    const r = await pool.query('SELECT id FROM projects WHERE id = $1 AND company_id = $2', [projectId, companyId]);
    if (r.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Project not found or access denied.' });
    }
    req.drawingProjectId = projectId;
    req.drawingUploadDir = path.join(req.digitalDocsCompanyDir, 'drawings', `project_${projectId}`);
    fs.mkdirSync(req.drawingUploadDir, { recursive: true });
    return next();
  } catch (err) {
    console.error('drawingGalleryProjectForManagerUpload:', err);
    return res.status(500).json({ success: false, message: 'Failed to verify project.' });
  }
}

module.exports = { drawingGalleryProjectForManagerUpload };
