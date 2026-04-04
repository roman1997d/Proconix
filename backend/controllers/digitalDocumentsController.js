/**
 * Digital documents & signatures API.
 * Files live under backend/uploads/{SanitizedName}_{companyId}_docs/
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../db/pool');
const { UPLOADS_ROOT } = require('../middleware/resolveCompanyDocsDir');

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

function validateFieldsJson(fields) {
  if (!Array.isArray(fields)) return 'fields must be an array';
  const sig = fields.filter((f) => f && f.type === 'signature');
  if (sig.length < 1) return 'At least one signature field is required';
  return null;
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
    const fields = doc.rows[0].fields_json;
    const arr = Array.isArray(fields) ? fields : typeof fields === 'string' ? JSON.parse(fields) : [];
    if (validateFieldsJson(arr)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Save signature fields first (PATCH fields with at least one signature field).',
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
    return res.status(200).json({
      success: true,
      document: {
        ...mapDocumentRow(row),
        assignees_count: row.assignees_count,
        signed_users_count: row.signed_users_count,
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
  if (!rawB64) {
    return res.status(400).json({ success: false, message: 'signatureImageBase64 is required.' });
  }

  let buf;
  try {
    const b64 = rawB64.includes(',') ? rawB64.split(',')[1] : rawB64;
    buf = Buffer.from(b64, 'base64');
    if (!buf.length || buf.length > 5 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'Invalid signature image.' });
    }
  } catch (_) {
    return res.status(400).json({ success: false, message: 'Invalid base64 signature.' });
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

    const fields = Array.isArray(doc.fields_json) ? doc.fields_json : [];
    const fieldOk = fields.some((f) => f && String(f.id) === fieldId && f.type === 'signature');
    if (!fieldOk) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Invalid field_id for this document.' });
    }

    const fname = `sig-${id}-${userId}-${fieldId.replace(/[^a-zA-Z0-9_-]/g, '')}-${Date.now()}.png`;
    const rel = `${req.digitalDocsFolderName}/signatures/${fname}`;
    const abs = path.join(req.digitalDocsSignaturesDir, fname);
    fs.writeFileSync(abs, buf);
    const url = `/uploads/${rel}`;

    await client.query(
      `INSERT INTO digital_document_signatures (
        document_id, user_id, field_id, signature_image_rel_path, signature_image_url, confirmed_read, client_meta
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (document_id, user_id, field_id)
      DO UPDATE SET
        signature_image_rel_path = EXCLUDED.signature_image_rel_path,
        signature_image_url = EXCLUDED.signature_image_url,
        confirmed_read = EXCLUDED.confirmed_read,
        signed_at = NOW(),
        client_meta = EXCLUDED.client_meta`,
      [
        id,
        userId,
        fieldId,
        rel,
        url,
        confirmedRead,
        body.client_meta && typeof body.client_meta === 'object' ? JSON.stringify(body.client_meta) : null,
      ]
    );

    await insertAudit(client, id, 'sign', 'operative', userId, { field_id: fieldId });

    const assignCount = await client.query(
      `SELECT COUNT(*)::int AS c FROM digital_document_assignments WHERE document_id = $1`,
      [id]
    );
    const ac = assignCount.rows[0].c;
    if (ac > 0) {
      const remaining = await client.query(
        `SELECT COUNT(*)::int AS c FROM digital_document_assignments a
         WHERE a.document_id = $1 AND NOT EXISTS (
           SELECT 1 FROM digital_document_signatures s
           WHERE s.document_id = a.document_id AND s.user_id = a.user_id
         )`,
        [id]
      );
      if (remaining.rows[0].c === 0) {
        await client.query(
          `UPDATE digital_documents SET status = 'completed', updated_at = NOW() WHERE id = $1`,
          [id]
        );
        await insertAudit(client, id, 'completed', 'system', null, {});
      }
    }

    await client.query('COMMIT');
    return res.status(200).json({
      success: true,
      message: 'Signature recorded.',
      signature_url: url,
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
    return res.status(200).json({
      success: true,
      document: {
        ...mapDocumentRow(row),
        assignees_count: row.assignees_count,
        signed_users_count: row.signed_users_count,
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
  remove,
  operativeInbox,
  getOneOperative,
  sign,
};
