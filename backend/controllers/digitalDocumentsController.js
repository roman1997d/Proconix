/**
 * Digital documents & signatures API.
 * Files live under backend/uploads/{SanitizedName}_{companyId}_docs/
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../db/pool');
const { UPLOADS_ROOT } = require('../middleware/resolveCompanyDocsDir');
const { sendSignedDocumentEmail } = require('../lib/sendCallbackRequestEmail');

/**
 * Lazy-load PDF merge (pdf-lib). If dependencies were not installed after deploy,
 * requiring at module load would crash the whole server (502 from nginx).
 */
function getBuildSignedDocumentPdf() {
  try {
    return require('../lib/buildSignedDocumentPdf').buildSignedDocumentPdf;
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') {
      const e = new Error(
        'PDF signing is unavailable: on the server run npm install (package pdf-lib is required).'
      );
      e.code = 'PDF_MODULE_MISSING';
      throw e;
    }
    throw err;
  }
}

function tableMissing(err) {
  return err && err.code === '42P01';
}

async function insertAudit(client, documentId, action, actorType, actorId, details) {
  await client.query(
    `INSERT INTO digital_document_audit (document_id, action, actor_type, actor_id, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [documentId, action, actorType, actorId, details != null ? JSON.stringify(details) : null]
  );
}

const SIGNABLE_FIELD_TYPES = ['signature', 'initials', 'date', 'checkbox', 'text'];

/** Transparent 1×1 PNG — DB requires a file; used for checkbox/date/text values. */
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

function normalizeFieldsArray(fieldsJson) {
  if (Array.isArray(fieldsJson)) return fieldsJson;
  if (typeof fieldsJson === 'string') {
    try {
      return JSON.parse(fieldsJson);
    } catch (_) {
      return [];
    }
  }
  return [];
}

function validateFieldsJson(fields) {
  if (!Array.isArray(fields)) return 'fields must be an array';
  let count = 0;
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (!f || typeof f !== 'object') return 'Invalid field at index ' + i;
    if (typeof f.id !== 'string' || !f.id.trim()) return 'Each field requires a string id';
    if (!SIGNABLE_FIELD_TYPES.includes(f.type)) {
      return 'Invalid field type for ' + f.id + ' (use signature, initials, date, checkbox, or text).';
    }
    const p = parseInt(f.page, 10);
    if (!Number.isInteger(p) || p < 1) return 'Field ' + f.id + ' requires page >= 1';
    for (const k of ['x', 'y', 'w', 'h']) {
      const n = Number(f[k]);
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        return 'Field ' + f.id + ' requires ' + k + ' between 0 and 1 (relative to page).';
      }
    }
    if (f.for_user_id != null && f.for_user_id !== '') {
      const u = parseInt(f.for_user_id, 10);
      if (!Number.isInteger(u) || u < 1) return 'Invalid for_user_id on field ' + f.id;
    }
    count += 1;
  }
  if (count < 1) return 'Add at least one field on the document.';
  const hasInk = fields.some((f) => f && (f.type === 'signature' || f.type === 'initials'));
  if (!hasInk) return 'At least one signature or initials field is required.';
  return null;
}

function fieldAppliesToUser(f, userId) {
  if (!f || f.for_user_id == null || f.for_user_id === '') return true;
  const uid = parseInt(f.for_user_id, 10);
  return Number.isInteger(uid) && uid === userId;
}

function fieldRequiresOperativeInput(f) {
  return f && SIGNABLE_FIELD_TYPES.includes(f.type);
}

function requiredFieldIdsForUser(fields, userId) {
  const out = [];
  fields.forEach((f) => {
    if (!fieldRequiresOperativeInput(f)) return;
    if (!fieldAppliesToUser(f, userId)) return;
    if (f.required === false) return;
    out.push(String(f.id));
  });
  return out;
}

async function isDocumentFullySigned(client, documentId, fieldsJson) {
  const fields = normalizeFieldsArray(fieldsJson);
  const assignR = await client.query('SELECT user_id FROM digital_document_assignments WHERE document_id = $1', [
    documentId,
  ]);
  if (assignR.rows.length === 0) return false;
  for (let i = 0; i < assignR.rows.length; i++) {
    const uid = assignR.rows[i].user_id;
    const needed = requiredFieldIdsForUser(fields, uid);
    for (let j = 0; j < needed.length; j++) {
      const fid = needed[j];
      const sig = await client.query(
        'SELECT 1 FROM digital_document_signatures WHERE document_id = $1 AND user_id = $2 AND field_id = $3 LIMIT 1',
        [documentId, uid, fid]
      );
      if (sig.rows.length === 0) return false;
    }
  }
  return true;
}

/**
 * POST /api/documents/upload (multipart: file + title, description?, document_type?, project_id?)
 */
async function uploadDocument(req, res) {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'PDF file is required (form field name: file).',
    });
  }
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  if (!title || title.length < 2) {
    try {
      fs.unlinkSync(req.file.path);
    } catch (_) {
      /* ignore unlink errors */
    }
    return res.status(400).json({ success: false, message: 'Title is required (min 2 characters).' });
  }

  const description = typeof req.body.description === 'string' ? req.body.description.trim() : null;
  const documentType = typeof req.body.document_type === 'string' ? req.body.document_type.trim() : null;
  let projectId = null;
  if (req.body.project_id != null && req.body.project_id !== '') {
    const p = parseInt(req.body.project_id, 10);
    if (Number.isInteger(p) && p > 0) projectId = p;
  }

  const companyId = req.manager.company_id;
  const managerId = req.manager.id;
  const folderName = req.digitalDocsFolderName;
  const rel = `${folderName}/${req.file.filename}`;
  const fileUrl = `/uploads/${rel}`;

  const client = await pool.connect();
  try {
    if (projectId != null) {
      const pr = await client.query('SELECT id FROM projects WHERE id = $1 AND company_id = $2', [
        projectId,
        companyId,
      ]);
      if (!pr.rows.length) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (_) {
      /* ignore unlink errors */
    }
        return res.status(400).json({ success: false, message: 'Invalid project for your company.' });
      }
    }

    const ins = await client.query(
      `INSERT INTO digital_documents (
        company_id, created_by_manager_id, project_id, title, description, document_type,
        status, file_relative_path, file_url, original_filename, file_size_bytes, fields_json
      ) VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7, $8, $9, $10, '[]'::jsonb)
      RETURNING *`,
      [
        companyId,
        managerId,
        projectId,
        title,
        description,
        documentType,
        rel,
        fileUrl,
        req.file.originalname || null,
        req.file.size || null,
      ]
    );
    const row = ins.rows[0];
    await insertAudit(client, row.id, 'upload', 'manager', managerId, { file: rel });

    return res.status(201).json({
      success: true,
      document: mapDocumentRow(row),
    });
  } catch (err) {
    try {
      fs.unlinkSync(req.file.path);
    } catch (_) {
      /* ignore unlink errors */
    }
    if (tableMissing(err)) {
      return res.status(503).json({
        success: false,
        message: 'Digital documents tables are missing. Run scripts/create_digital_documents_tables.sql',
      });
    }
    console.error('uploadDocument:', err);
    return res.status(500).json({ success: false, message: err.message || 'Upload failed.' });
  } finally {
    client.release();
  }
}

function mapDocumentRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    company_id: row.company_id,
    created_by_manager_id: row.created_by_manager_id,
    project_id: row.project_id,
    title: row.title,
    description: row.description,
    document_type: row.document_type,
    status: row.status,
    file_url: row.file_url,
    file_relative_path: row.file_relative_path,
    original_filename: row.original_filename,
    file_size_bytes: row.file_size_bytes,
    fields_json: row.fields_json,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * PATCH /api/documents/:id/fields body: { fields: [...] }
 */
async function patchFields(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid document id.' });
  }
  let fields = req.body && req.body.fields != null ? req.body.fields : null;
  if (typeof fields === 'string') {
    try {
      fields = JSON.parse(fields);
    } catch (_) {
      return res.status(400).json({ success: false, message: 'Invalid fields JSON.' });
    }
  }
  const errMsg = validateFieldsJson(fields);
  if (errMsg) {
    return res.status(400).json({ success: false, message: errMsg });
  }

  const companyId = req.manager.company_id;
  const client = await pool.connect();
  try {
    const ex = await client.query(
      'SELECT id, status FROM digital_documents WHERE id = $1 AND company_id = $2',
      [id, companyId]
    );
    if (!ex.rows.length) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }
    const upd = await client.query(
      `UPDATE digital_documents SET fields_json = $1::jsonb, updated_at = NOW()
       WHERE id = $2 AND company_id = $3
       RETURNING *`,
      [JSON.stringify(fields), id, companyId]
    );
    await insertAudit(client, id, 'save_fields', 'manager', req.manager.id, { count: fields.length });

    return res.status(200).json({
      success: true,
      document: mapDocumentRow(upd.rows[0]),
    });
  } catch (err) {
    if (tableMissing(err)) {
      return res.status(503).json({
        success: false,
        message: 'Digital documents tables are missing. Run scripts/create_digital_documents_tables.sql',
      });
    }
    console.error('patchFields:', err);
    return res.status(500).json({ success: false, message: err.message || 'Update failed.' });
  } finally {
    client.release();
  }
}

/**
 * POST /api/documents/:id/assign body: { assignments: [{ user_id, deadline?, mandatory?, recurrence_days? }] }
 */
async function assign(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid document id.' });
  }
  const raw = req.body && Array.isArray(req.body.assignments) ? req.body.assignments : null;
  if (!raw || raw.length < 1) {
    return res.status(400).json({ success: false, message: 'At least one assignment (user_id) is required.' });
  }

  const companyId = req.manager.company_id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const doc = await client.query(
      'SELECT id, status, fields_json FROM digital_documents WHERE id = $1 AND company_id = $2',
      [id, companyId]
    );
    if (!doc.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }
    const arr = normalizeFieldsArray(doc.rows[0].fields_json);
    const fieldsErr = validateFieldsJson(arr);
    if (fieldsErr) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: fieldsErr || 'Save field layout first (Document Builder).',
      });
    }

    await client.query('DELETE FROM digital_document_assignments WHERE document_id = $1', [id]);

    for (let i = 0; i < raw.length; i += 1) {
      const a = raw[i] || {};
      const uid = parseInt(a.user_id, 10);
      if (!Number.isInteger(uid) || uid < 1) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Invalid user_id in assignments.' });
      }
      const ur = await client.query('SELECT id FROM users WHERE id = $1 AND company_id = $2', [uid, companyId]);
      if (!ur.rows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: `User ${uid} is not in your company.` });
      }
      let deadline = null;
      if (a.deadline != null && a.deadline !== '') {
        const d = new Date(a.deadline);
        deadline = Number.isNaN(d.getTime()) ? null : d.toISOString();
      }
      const mandatory = a.mandatory === true || a.mandatory === 'true';
      let recurrence = null;
      if (a.recurrence_days != null && a.recurrence_days !== '') {
        const n = parseInt(a.recurrence_days, 10);
        if (Number.isInteger(n) && n > 0) recurrence = n;
      }

      await client.query(
        `INSERT INTO digital_document_assignments (document_id, user_id, deadline, mandatory, recurrence_days)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, uid, deadline, mandatory, recurrence]
      );
    }

    await client.query(
      `UPDATE digital_documents SET status = 'pending_signatures', updated_at = NOW() WHERE id = $1`,
      [id]
    );
    await insertAudit(client, id, 'assign', 'manager', req.manager.id, { count: raw.length });

    await client.query('COMMIT');
    return res.status(200).json({ success: true, message: 'Assignments saved.', document_id: id });
  } catch (err) {
    await client.query('ROLLBACK');
    if (tableMissing(err)) {
      return res.status(503).json({
        success: false,
        message: 'Digital documents tables are missing. Run scripts/create_digital_documents_tables.sql',
      });
    }
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Duplicate assignment.' });
    }
    console.error('assign:', err);
    return res.status(500).json({ success: false, message: err.message || 'Assign failed.' });
  } finally {
    client.release();
  }
}

/**
 * GET /api/documents
 */
async function list(req, res) {
  const companyId = req.manager.company_id;
  const projectId = req.query.project_id ? parseInt(req.query.project_id, 10) : null;
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  let sql = `
    SELECT d.*,
      (SELECT COUNT(*)::int FROM digital_document_assignments a WHERE a.document_id = d.id) AS assignees_count,
      (SELECT COUNT(DISTINCT s.user_id)::int FROM digital_document_signatures s WHERE s.document_id = d.id) AS signed_users_count
    FROM digital_documents d
    WHERE d.company_id = $1`;
  const params = [companyId];
  let p = 2;

  if (Number.isInteger(projectId) && projectId > 0) {
    sql += ` AND d.project_id = $${p}`;
    params.push(projectId);
    p += 1;
  }
  if (status && ['draft', 'pending_signatures', 'completed', 'cancelled', 'expired'].includes(status)) {
    sql += ` AND d.status = $${p}`;
    params.push(status);
    p += 1;
  }
  if (q) {
    sql += ` AND (d.title ILIKE $${p} OR COALESCE(d.description,'') ILIKE $${p})`;
    params.push(`%${q}%`);
    p += 1;
  }
  sql += ' ORDER BY d.updated_at DESC';

  try {
    const r = await pool.query(sql, params);
    const documents = (r.rows || []).map((row) => ({
      ...mapDocumentRow(row),
      assignees_count: row.assignees_count,
      signed_users_count: row.signed_users_count,
      signatures_progress:
        row.assignees_count > 0
          ? `${row.signed_users_count}/${row.assignees_count}`
          : '0/0',
    }));
    return res.status(200).json({ success: true, documents });
  } catch (err) {
    if (tableMissing(err)) {
      return res.status(503).json({
        success: false,
        message: 'Digital documents tables are missing. Run scripts/create_digital_documents_tables.sql',
        documents: [],
      });
    }
    console.error('digitalDocuments list:', err);
    return res.status(500).json({ success: false, message: 'Failed to list documents.' });
  }
}

/**
 * GET /api/documents/:id
 */
async function getOne(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid document id.' });
  }
  const companyId = req.manager.company_id;
  try {
    const r = await pool.query(
      `SELECT d.*,
        (SELECT COUNT(*)::int FROM digital_document_assignments a WHERE a.document_id = d.id) AS assignees_count,
        (SELECT COUNT(DISTINCT s.user_id)::int FROM digital_document_signatures s WHERE s.document_id = d.id) AS signed_users_count
       FROM digital_documents d WHERE d.id = $1 AND d.company_id = $2`,
      [id, companyId]
    );
    if (!r.rows.length) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }
    const row = r.rows[0];
    const fieldsArr = normalizeFieldsArray(row.fields_json);

    const assignR = await pool.query(
      `SELECT a.user_id, a.deadline, a.mandatory, a.recurrence_days, u.name, u.email
       FROM digital_document_assignments a
       JOIN users u ON u.id = a.user_id
       WHERE a.document_id = $1
       ORDER BY u.name NULLS LAST, u.email`,
      [id]
    );
    const sigR = await pool.query(
      `SELECT user_id, field_id FROM digital_document_signatures WHERE document_id = $1`,
      [id]
    );
    const sigByUser = {};
    sigR.rows.forEach((s) => {
      if (!sigByUser[s.user_id]) sigByUser[s.user_id] = new Set();
      sigByUser[s.user_id].add(String(s.field_id));
    });

    const assignments = assignR.rows.map((a) => {
      const need = requiredFieldIdsForUser(fieldsArr, a.user_id);
      const have = sigByUser[a.user_id] || new Set();
      let done = 0;
      need.forEach((fid) => {
        if (have.has(fid)) done += 1;
      });
      const reqLen = need.length;
      return {
        user_id: a.user_id,
        name: a.name,
        email: a.email,
        deadline: a.deadline,
        mandatory: a.mandatory,
        recurrence_days: a.recurrence_days,
        required_fields: reqLen,
        completed_fields: done,
        is_complete: reqLen === 0 ? true : done >= reqLen,
      };
    });

    const sigDetailR = await pool.query(
      `SELECT s.field_id, s.user_id, s.signed_at, s.signature_image_url, s.client_meta,
              u.name AS user_name, u.email AS user_email
       FROM digital_document_signatures s
       JOIN users u ON u.id = s.user_id
       WHERE s.document_id = $1
       ORDER BY s.signed_at ASC`,
      [id]
    );
    const signatures = (sigDetailR.rows || []).map((srow) => ({
      field_id: String(srow.field_id),
      user_id: srow.user_id,
      user_name: srow.user_name,
      user_email: srow.user_email,
      signed_at: srow.signed_at,
      signature_image_url: srow.signature_image_url,
      client_meta: srow.client_meta,
    }));

    return res.status(200).json({
      success: true,
      document: {
        ...mapDocumentRow(row),
        assignees_count: row.assignees_count,
        signed_users_count: row.signed_users_count,
        assignments,
        signatures,
      },
    });
  } catch (err) {
    if (tableMissing(err)) {
      return res.status(503).json({
        success: false,
        message: 'Digital documents tables are missing.',
      });
    }
    console.error('getOne digital doc:', err);
    return res.status(500).json({ success: false, message: 'Failed to load document.' });
  }
}

/**
 * GET /api/documents/:id/audit
 */
async function getAudit(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid document id.' });
  }
  const companyId = req.manager.company_id;
  try {
    const d = await pool.query('SELECT id FROM digital_documents WHERE id = $1 AND company_id = $2', [id, companyId]);
    if (!d.rows.length) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }
    const r = await pool.query(
      'SELECT * FROM digital_document_audit WHERE document_id = $1 ORDER BY created_at ASC',
      [id]
    );
    return res.status(200).json({ success: true, audit: r.rows || [] });
  } catch (err) {
    if (tableMissing(err)) {
      return res.status(503).json({ success: false, audit: [] });
    }
    console.error('getAudit:', err);
    return res.status(500).json({ success: false, message: 'Failed to load audit.' });
  }
}

/**
 * GET /api/documents/:id/signed-pdf — PDF with signatures / field values merged (manager).
 */
async function downloadSignedPdf(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid document id.' });
  }
  const companyId = req.manager.company_id;
  try {
    const d = await pool.query(
      'SELECT * FROM digital_documents WHERE id = $1 AND company_id = $2',
      [id, companyId]
    );
    if (!d.rows.length) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }
    const sigs = await pool.query(
      `SELECT s.*, u.name AS user_name, u.email AS user_email
       FROM digital_document_signatures s
       LEFT JOIN users u ON u.id = s.user_id
       WHERE s.document_id = $1
       ORDER BY s.signed_at ASC`,
      [id]
    );
    const buildSignedDocumentPdf = getBuildSignedDocumentPdf();
    const buf = await buildSignedDocumentPdf(d.rows[0], sigs.rows || []);
    const rawTitle = d.rows[0].title || 'document';
    const safeFile = String(rawTitle)
      .replace(/[^\w\s\-]+/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 80);
    const filename = `signed-${safeFile || 'document'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"`);
    return res.status(200).send(buf);
  } catch (err) {
    if (err && err.code === 'PDF_MODULE_MISSING') {
      return res.status(503).json({ success: false, message: err.message });
    }
    if (tableMissing(err)) {
      return res.status(503).json({ success: false, message: 'Digital documents tables are missing.' });
    }
    console.error('downloadSignedPdf:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to build PDF.' });
  }
}

/**
 * POST /api/documents/:id/email-signed — send merged PDF to manager email (SMTP).
 */
async function emailSignedPdf(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid document id.' });
  }
  const companyId = req.manager.company_id;
  const managerEmail = req.manager.email && String(req.manager.email).trim();
  if (!managerEmail) {
    return res.status(400).json({ success: false, message: 'Manager email not available.' });
  }

  try {
    const d = await pool.query(
      'SELECT * FROM digital_documents WHERE id = $1 AND company_id = $2',
      [id, companyId]
    );
    if (!d.rows.length) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }
    const sigs = await pool.query(
      `SELECT s.*, u.name AS user_name, u.email AS user_email
       FROM digital_document_signatures s
       LEFT JOIN users u ON u.id = s.user_id
       WHERE s.document_id = $1
       ORDER BY s.signed_at ASC`,
      [id]
    );
    const docRow = d.rows[0];
    const buildSignedDocumentPdf = getBuildSignedDocumentPdf();
    const buf = await buildSignedDocumentPdf(docRow, sigs.rows || []);

    await sendSignedDocumentEmail({
      to: managerEmail,
      managerFirstName: req.manager.name,
      documentTitle: docRow.title || 'Document',
      pdfBuffer: buf,
    });

    const client = await pool.connect();
    try {
      await insertAudit(client, id, 'email_signed_pdf', 'manager', req.manager.id, { to: managerEmail });
    } finally {
      client.release();
    }

    return res.status(200).json({
      success: true,
      message: `Signed PDF was sent to ${managerEmail}.`,
    });
  } catch (err) {
    if (err && err.code === 'PDF_MODULE_MISSING') {
      return res.status(503).json({ success: false, message: err.message });
    }
    if (err.code === 'SMTP_NOT_CONFIGURED') {
      return res.status(503).json({
        success: false,
        message: 'Email is not configured on the server (set SMTP_HOST in .env).',
      });
    }
    if (tableMissing(err)) {
      return res.status(503).json({ success: false, message: 'Digital documents tables are missing.' });
    }
    console.error('emailSignedPdf:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to send email.' });
  }
}

function removeFileFromDisk(relPath) {
  if (!relPath || relPath.includes('..')) return;
  const full = path.join(UPLOADS_ROOT, relPath);
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch (_) {
    /* ignore */
  }
}

/**
 * DELETE /api/documents/:id
 */
async function remove(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid document id.' });
  }
  const companyId = req.manager.company_id;
  const client = await pool.connect();
  try {
    const r = await client.query(
      'SELECT file_relative_path FROM digital_documents WHERE id = $1 AND company_id = $2',
      [id, companyId]
    );
    if (!r.rows.length) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }
    const sigs = await client.query(
      'SELECT signature_image_rel_path FROM digital_document_signatures WHERE document_id = $1',
      [id]
    );
    await client.query('DELETE FROM digital_documents WHERE id = $1 AND company_id = $2', [id, companyId]);

    removeFileFromDisk(r.rows[0].file_relative_path);
    (sigs.rows || []).forEach((s) => removeFileFromDisk(s.signature_image_rel_path));

    return res.status(200).json({ success: true, message: 'Document deleted.' });
  } catch (err) {
    if (tableMissing(err)) {
      return res.status(503).json({ success: false, message: 'Digital documents tables are missing.' });
    }
    console.error('remove digital doc:', err);
    return res.status(500).json({ success: false, message: err.message || 'Delete failed.' });
  } finally {
    client.release();
  }
}

/**
 * POST /api/documents/:id/reset — manager: clear fields, assignments, signatures; PDF file unchanged; status → draft.
 */
async function resetDocument(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid document id.' });
  }
  const companyId = req.manager.company_id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const doc = await client.query(
      'SELECT id FROM digital_documents WHERE id = $1 AND company_id = $2',
      [id, companyId]
    );
    if (!doc.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }

    const sigs = await client.query(
      'SELECT signature_image_rel_path FROM digital_document_signatures WHERE document_id = $1',
      [id]
    );

    await client.query('DELETE FROM digital_document_signatures WHERE document_id = $1', [id]);
    await client.query('DELETE FROM digital_document_assignments WHERE document_id = $1', [id]);
    await client.query(
      `UPDATE digital_documents
       SET fields_json = '[]'::jsonb, status = 'draft', updated_at = NOW()
       WHERE id = $1 AND company_id = $2`,
      [id, companyId]
    );
    await insertAudit(client, id, 'reset', 'manager', req.manager.id, { cleared: 'fields_assignments_signatures' });

    await client.query('COMMIT');

    (sigs.rows || []).forEach((s) => removeFileFromDisk(s.signature_image_rel_path));

    return res.status(200).json({
      success: true,
      message: 'Document reset to the original PDF. Field layout, assignments and signatures were cleared.',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (tableMissing(err)) {
      return res.status(503).json({ success: false, message: 'Digital documents tables are missing.' });
    }
    console.error('resetDocument:', err);
    return res.status(500).json({ success: false, message: err.message || 'Reset failed.' });
  } finally {
    client.release();
  }
}

/**
 * GET /api/documents/operative/inbox — operatives only
 */
async function operativeInbox(req, res) {
  const userId = req.operative.id;
  const companyId = req.operative.company_id;
  try {
    const r = await pool.query(
      `SELECT d.*, a.deadline, a.mandatory,
        (SELECT COUNT(*)::int FROM digital_document_signatures s WHERE s.document_id = d.id AND s.user_id = $2) AS my_signatures_count
       FROM digital_documents d
       INNER JOIN digital_document_assignments a ON a.document_id = d.id AND a.user_id = $2
       WHERE d.company_id = $1 AND d.status = 'pending_signatures'
       ORDER BY a.deadline NULLS LAST, d.updated_at DESC`,
      [companyId, userId]
    );
    const documents = (r.rows || []).map((row) => ({
      ...mapDocumentRow(row),
      assignment_deadline: row.deadline,
      assignment_mandatory: row.mandatory,
      my_signatures_count: row.my_signatures_count,
    }));
    return res.status(200).json({ success: true, documents });
  } catch (err) {
    if (tableMissing(err)) {
      return res.status(503).json({ success: false, documents: [], message: 'Tables missing.' });
    }
    console.error('operativeInbox:', err);
    return res.status(500).json({ success: false, message: 'Failed to load inbox.' });
  }
}

/**
 * POST /api/documents/:id/sign — operative
 * Body: field_id, confirmed_read, signatureImageBase64 (signature/initials),
 * optional: checkbox_value, date_value, text_value for other field types.
 */
async function sign(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid document id.' });
  }
  const body = req.body || {};
  const fieldId = typeof body.field_id === 'string' ? body.field_id.trim() : '';
  const confirmedRead = body.confirmed_read === true || body.confirmed_read === 'true';
  const rawB64 = typeof body.signatureImageBase64 === 'string' ? body.signatureImageBase64.trim() : '';

  if (!fieldId) {
    return res.status(400).json({ success: false, message: 'field_id is required.' });
  }
  if (!confirmedRead) {
    return res.status(400).json({ success: false, message: 'You must confirm that you have read the document.' });
  }

  const userId = req.operative.id;
  const companyId = req.operative.company_id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const d = await client.query(
      'SELECT id, company_id, fields_json, status FROM digital_documents WHERE id = $1',
      [id]
    );
    if (!d.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }
    const doc = d.rows[0];
    if (doc.company_id !== companyId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    if (doc.status !== 'pending_signatures') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Document is not open for signing.' });
    }

    const asg = await client.query(
      'SELECT id FROM digital_document_assignments WHERE document_id = $1 AND user_id = $2',
      [id, userId]
    );
    if (!asg.rows.length) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'You are not assigned to this document.' });
    }

    const fields = normalizeFieldsArray(doc.fields_json);
    const fieldDef = fields.find((f) => f && String(f.id) === fieldId);
    if (!fieldDef || !SIGNABLE_FIELD_TYPES.includes(fieldDef.type)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Invalid field_id for this document.' });
    }
    if (!fieldAppliesToUser(fieldDef, userId)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'This field is not assigned to you.' });
    }

    let buf;
    const meta = { field_type: fieldDef.type };

    if (fieldDef.type === 'signature' || fieldDef.type === 'initials') {
      if (!rawB64) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'signatureImageBase64 is required for this field.' });
      }
      try {
        const b64 = rawB64.includes(',') ? rawB64.split(',')[1] : rawB64;
        buf = Buffer.from(b64, 'base64');
        if (!buf.length || buf.length > 5 * 1024 * 1024) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'Invalid signature image.' });
        }
      } catch (_) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Invalid base64 signature.' });
      }
    } else if (fieldDef.type === 'checkbox') {
      const ok = body.checkbox_value === true || body.checkbox_value === 'true';
      if (!ok) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'You must confirm this checkbox.' });
      }
      meta.checkbox_value = true;
      buf = PLACEHOLDER_PNG;
    } else if (fieldDef.type === 'date') {
      const dv = typeof body.date_value === 'string' ? body.date_value.trim() : '';
      if (!dv) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'date_value is required.' });
      }
      meta.date_value = dv;
      buf = PLACEHOLDER_PNG;
    } else if (fieldDef.type === 'text') {
      const tv = typeof body.text_value === 'string' ? body.text_value.trim() : '';
      if (!tv) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'text_value is required.' });
      }
      meta.text_value = tv;
      buf = PLACEHOLDER_PNG;
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Unsupported field type.' });
    }

    const fname = `sig-${id}-${userId}-${fieldId.replace(/[^a-zA-Z0-9_-]/g, '')}-${Date.now()}.png`;
    const rel = `${req.digitalDocsFolderName}/signatures/${fname}`;
    const abs = path.join(req.digitalDocsSignaturesDir, fname);
    fs.writeFileSync(abs, buf);
    const url = `/uploads/${rel}`;

    const mergedMeta =
      body.client_meta && typeof body.client_meta === 'object' ? { ...meta, ...body.client_meta } : meta;

    await client.query(
      `INSERT INTO digital_document_signatures (
        document_id, user_id, field_id, signature_image_rel_path, signature_image_url, confirmed_read, client_meta
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      ON CONFLICT (document_id, user_id, field_id)
      DO UPDATE SET
        signature_image_rel_path = EXCLUDED.signature_image_rel_path,
        signature_image_url = EXCLUDED.signature_image_url,
        confirmed_read = EXCLUDED.confirmed_read,
        signed_at = NOW(),
        client_meta = EXCLUDED.client_meta`,
      [id, userId, fieldId, rel, url, confirmedRead, mergedMeta]
    );

    await insertAudit(client, id, 'sign', 'operative', userId, { field_id: fieldId, type: fieldDef.type });

    const done = await isDocumentFullySigned(client, id, doc.fields_json);
    if (done) {
      await client.query(`UPDATE digital_documents SET status = 'completed', updated_at = NOW() WHERE id = $1`, [id]);
      await insertAudit(client, id, 'completed', 'system', null, {});
    }

    await client.query('COMMIT');
    return res.status(200).json({
      success: true,
      message: 'Field saved.',
      signature_url: url,
      document_completed: done,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (tableMissing(err)) {
      return res.status(503).json({
        success: false,
        message: 'Digital documents tables are missing.',
      });
    }
    if (err.code === '42P10' || err.message?.includes('ON CONFLICT')) {
      return res.status(500).json({
        success: false,
        message: 'Database constraint issue. Ensure migration includes UNIQUE (document_id, user_id, field_id).',
      });
    }
    console.error('sign digital doc:', err);
    return res.status(500).json({ success: false, message: err.message || 'Sign failed.' });
  } finally {
    client.release();
  }
}

/**
 * GET /api/documents/operative/document/:id — operative: view assigned document
 */
async function getOneOperative(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid document id.' });
  }
  const userId = req.operative.id;
  const companyId = req.operative.company_id;
  try {
    const r = await pool.query(
      `SELECT d.*,
        (SELECT COUNT(*)::int FROM digital_document_assignments a WHERE a.document_id = d.id) AS assignees_count,
        (SELECT COUNT(DISTINCT s.user_id)::int FROM digital_document_signatures s WHERE s.document_id = d.id) AS signed_users_count
       FROM digital_documents d
       INNER JOIN digital_document_assignments a ON a.document_id = d.id AND a.user_id = $3
       WHERE d.id = $1 AND d.company_id = $2`,
      [id, companyId, userId]
    );
    if (!r.rows.length) {
      return res.status(404).json({ success: false, message: 'Document not found or not assigned to you.' });
    }
    const row = r.rows[0];
    const fieldsArr = normalizeFieldsArray(row.fields_json);
    const needIds = requiredFieldIdsForUser(fieldsArr, userId);
    const sigMine = await pool.query(
      `SELECT field_id FROM digital_document_signatures WHERE document_id = $1 AND user_id = $2`,
      [id, userId]
    );
    const signedSet = new Set(sigMine.rows.map((x) => String(x.field_id)));
    let myCompleted = 0;
    needIds.forEach((fid) => {
      if (signedSet.has(fid)) myCompleted += 1;
    });
    return res.status(200).json({
      success: true,
      document: {
        ...mapDocumentRow(row),
        assignees_count: row.assignees_count,
        signed_users_count: row.signed_users_count,
        my_required_fields: needIds.length,
        my_completed_fields: myCompleted,
        my_field_ids_signed: sigMine.rows.map((x) => String(x.field_id)),
      },
    });
  } catch (err) {
    if (tableMissing(err)) {
      return res.status(503).json({ success: false, message: 'Digital documents tables are missing.' });
    }
    console.error('getOneOperative:', err);
    return res.status(500).json({ success: false, message: 'Failed to load document.' });
  }
}

module.exports = {
  uploadDocument,
  patchFields,
  assign,
  list,
  getOne,
  getAudit,
  downloadSignedPdf,
  emailSignedPdf,
  remove,
  resetDocument,
  operativeInbox,
  getOneOperative,
  sign,
};
