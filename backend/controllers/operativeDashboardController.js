/**
 * Operative dashboard API: work hours, project, issues, uploads, tasks.
 * All handlers expect req.operative (set by requireOperativeAuth).
 */

const { pool } = require('../db/pool');

function getOperative(req) {
  const op = req.operative;
  if (!op || op.id == null) return null;
  return op;
}

/**
 * GET /api/operatives/me
 * Returns current operative info (for "logged in as" display).
 */
async function getMe(req, res) {
  const op = getOperative(req);
  if (!op) return res.status(401).json({ success: false, message: 'Unauthorized.' });

  try {
    const result = await pool.query(
      'SELECT id, name, email, company_id, project_id FROM users WHERE id = $1',
      [op.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const u = result.rows[0];
    return res.status(200).json({
      success: true,
      user: {
        id: u.id,
        name: u.name || '',
        email: u.email || '',
        company_id: u.company_id,
        project_id: u.project_id,
      },
    });
  } catch (err) {
    console.error('getMe error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load profile.' });
  }
}

/**
 * POST /api/operatives/work-hours/clock-in
 * Body: { project_id? } optional
 */
async function clockIn(req, res) {
  const op = getOperative(req);
  if (!op) return res.status(401).json({ success: false, message: 'Unauthorized.' });

  const projectId = req.body && req.body.project_id != null ? req.body.project_id : null;

  try {
    const result = await pool.query(
      `INSERT INTO work_hours (user_id, project_id, clock_in)
       VALUES ($1, $2, NOW())
       RETURNING id, user_id, project_id, clock_in, clock_out`,
      [op.id, projectId]
    );
    return res.status(201).json({
      success: true,
      message: 'Clocked in.',
      work_hour: result.rows[0],
    });
  } catch (err) {
    console.error('clockIn error:', err);
    return res.status(500).json({ success: false, message: 'Failed to clock in.' });
  }
}

/**
 * POST /api/operatives/work-hours/clock-out
 * Clocks out the most recent open record (clock_out IS NULL) for this user.
 */
async function clockOut(req, res) {
  const op = getOperative(req);
  if (!op) return res.status(401).json({ success: false, message: 'Unauthorized.' });

  try {
    const result = await pool.query(
      `UPDATE work_hours
       SET clock_out = NOW()
       WHERE id = (
         SELECT id FROM work_hours
         WHERE user_id = $1 AND clock_out IS NULL
         ORDER BY clock_in DESC LIMIT 1
       )
       RETURNING id, user_id, project_id, clock_in, clock_out`,
      [op.id]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No active clock-in found.' });
    }
    return res.status(200).json({
      success: true,
      message: 'Clocked out.',
      work_hour: result.rows[0],
    });
  } catch (err) {
    console.error('clockOut error:', err);
    return res.status(500).json({ success: false, message: 'Failed to clock out.' });
  }
}

/**
 * GET /api/operatives/work-hours/status
 * Returns current status (last clock-in if no clock_out) and today's total hours.
 */
async function workHoursStatus(req, res) {
  const op = getOperative(req);
  if (!op) return res.status(401).json({ success: false, message: 'Unauthorized.' });

  try {
    const current = await pool.query(
      `SELECT id, clock_in, clock_out FROM work_hours
       WHERE user_id = $1 AND clock_out IS NULL
       ORDER BY clock_in DESC LIMIT 1`,
      [op.id]
    );

    const today = await pool.query(
      `SELECT
         COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(clock_out, NOW()) - clock_in)) / 3600), 0)::numeric(10,2) AS hours_today
       FROM work_hours
       WHERE user_id = $1 AND clock_in::date = CURRENT_DATE`,
      [op.id]
    );

    const hoursToday = parseFloat(today.rows[0]?.hours_today || 0, 10);

    return res.status(200).json({
      success: true,
      clockedIn: current.rows.length > 0,
      current: current.rows[0] || null,
      hoursToday,
    });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(200).json({
        success: true,
        clockedIn: false,
        current: null,
        hoursToday: 0,
      });
    }
    console.error('workHoursStatus error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch status.' });
  }
}

/**
 * GET /api/operatives/work-hours/weekly
 * Returns hours per day for the current week (Mon–Sun).
 */
async function workHoursWeekly(req, res) {
  const op = getOperative(req);
  if (!op) return res.status(401).json({ success: false, message: 'Unauthorized.' });

  try {
    const result = await pool.query(
      `SELECT
         date_trunc('day', clock_in)::date AS day,
         SUM(EXTRACT(EPOCH FROM (COALESCE(clock_out, NOW()) - clock_in)) / 3600)::numeric(10,2) AS hours
       FROM work_hours
       WHERE user_id = $1
         AND clock_in >= date_trunc('week', CURRENT_DATE)
         AND clock_in < date_trunc('week', CURRENT_DATE) + interval '7 days'
       GROUP BY date_trunc('day', clock_in)::date
       ORDER BY day`,
      [op.id]
    );

    const total = result.rows.reduce((sum, r) => sum + parseFloat(r.hours || 0, 10), 0);

    return res.status(200).json({
      success: true,
      byDay: result.rows.map((r) => ({ day: r.day, hours: parseFloat(r.hours, 10) })),
      totalHours: Math.round(total * 100) / 100,
    });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(200).json({
        success: true,
        byDay: [],
        totalHours: 0,
      });
    }
    console.error('workHoursWeekly error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch weekly hours.' });
  }
}

/**
 * GET /api/operatives/project/current
 * Returns the project assigned to the operative (users.project_id or project_assignments -> projects).
 */
async function getCurrentProject(req, res) {
  const op = getOperative(req);
  if (!op) return res.status(401).json({ success: false, message: 'Unauthorized.' });

  try {
    let projectId = null;

    try {
      let userRow = await pool.query(
        'SELECT project_id FROM users WHERE id = $1',
        [op.id]
      );
      if (userRow.rows.length > 0 && userRow.rows[0].project_id != null) {
        projectId = userRow.rows[0].project_id;
      }
    } catch (userErr) {
      if (userErr.code === '42703') {
        try {
          await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS project_id INT');
          const retry = await pool.query('SELECT project_id FROM users WHERE id = $1', [op.id]);
          if (retry.rows.length > 0 && retry.rows[0].project_id != null) projectId = retry.rows[0].project_id;
        } catch (_) {}
      }
    }

    if (projectId == null) {
      try {
        const paRow = await pool.query(
          'SELECT project_id FROM project_assignments WHERE user_id = $1 ORDER BY assigned_at DESC LIMIT 1',
          [op.id]
        );
        if (paRow.rows.length > 0 && paRow.rows[0].project_id != null) {
          projectId = paRow.rows[0].project_id;
        }
      } catch (paErr) {
        if (paErr.code !== '42P01') console.error('getCurrentProject project_assignments:', paErr.message);
      }
    }

    if (projectId == null) {
      console.log('getCurrentProject: opId=%s no projectId (users.project_id and project_assignments)', op.id);
      return res.status(200).json({ success: true, project: null });
    }

    let projRow;
    try {
      projRow = await pool.query(
        'SELECT id, company_id, COALESCE(project_name, name) AS name, address, start_date, description FROM projects WHERE id = $1',
        [projectId]
      );
    } catch (projErr) {
      if (projErr.code === '42703') {
        projRow = await pool.query(
          'SELECT id, company_id, project_name AS name, address, start_date, description FROM projects WHERE id = $1',
          [projectId]
        );
      } else {
        throw projErr;
      }
    }

    if (projRow.rows.length === 0) {
      return res.status(200).json({ success: true, project: null });
    }

    const p = projRow.rows[0];
    const projectName = p.name != null ? String(p.name).trim() : null;
    console.log('getCurrentProject: opId=%s projectId=%s name=%s', op.id, projectId, projectName || p.name);
    return res.status(200).json({
      success: true,
      project: {
        id: p.id,
        name: projectName || 'Project',
        address: p.address,
        start_date: p.start_date,
        description: p.description,
      },
    });
  } catch (err) {
    console.error('getCurrentProject error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch project.' });
  }
}

/**
 * POST /api/operatives/issues
 * Body: title, description, file_url (optional; set by multer or form)
 */
async function reportIssue(req, res) {
  const op = getOperative(req);
  if (!op) return res.status(401).json({ success: false, message: 'Unauthorized.' });

  const title = (req.body && req.body.title) ? String(req.body.title).trim() : '';
  const description = (req.body && req.body.description) ? String(req.body.description).trim() : null;
  const fileUrl = (req.body && req.body.file_url) ? String(req.body.file_url).trim() : null;
  const projectId = req.body && req.body.project_id != null ? req.body.project_id : null;

  if (!title) {
    return res.status(400).json({ success: false, message: 'Title is required.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO issues (user_id, project_id, title, description, file_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, project_id, title, description, file_url, created_at`,
      [op.id, projectId, title, description, fileUrl]
    );
    return res.status(201).json({
      success: true,
      message: 'Issue reported.',
      issue: result.rows[0],
    });
  } catch (err) {
    console.error('reportIssue error:', err);
    return res.status(500).json({ success: false, message: 'Failed to report issue.' });
  }
}

/**
 * POST /api/operatives/uploads
 * Body: description, file_url (set by multer)
 */
async function uploadDocument(req, res) {
  const op = getOperative(req);
  if (!op) return res.status(401).json({ success: false, message: 'Unauthorized.' });

  const fileUrl = (req.body && req.body.file_url) ? String(req.body.file_url).trim() : null;
  const description = (req.body && req.body.description) ? String(req.body.description).trim() : null;
  const projectId = req.body && req.body.project_id != null ? req.body.project_id : null;

  if (!fileUrl) {
    return res.status(400).json({ success: false, message: 'File is required.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO uploads (user_id, project_id, file_url, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, project_id, file_url, description, created_at`,
      [op.id, projectId, fileUrl, description]
    );
    return res.status(201).json({
      success: true,
      message: 'Upload saved.',
      upload: result.rows[0],
    });
  } catch (err) {
    console.error('uploadDocument error:', err);
    return res.status(500).json({ success: false, message: 'Failed to save upload.' });
  }
}

/**
 * GET /api/operatives/tasks
 * Returns tasks assigned to the operative.
 */
async function getTasks(req, res) {
  const op = getOperative(req);
  if (!op) return res.status(401).json({ success: false, message: 'Unauthorized.' });

  try {
    const result = await pool.query(
      `SELECT id, user_id, project_id, name, deadline, status, created_at
       FROM tasks
       WHERE user_id = $1
       ORDER BY deadline ASC NULLS LAST, created_at DESC`,
      [op.id]
    );
    return res.status(200).json({
      success: true,
      tasks: result.rows,
    });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(200).json({ success: true, tasks: [] });
    }
    console.error('getTasks error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch tasks.' });
  }
}

/**
 * GET /api/operatives/work-log
 * Returns work log entries submitted by the current operative (for "My work entries" list).
 */
function rowToWorkLogEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    jobId: row.job_display_id,
    workType: row.work_type,
    project: row.project,
    block: row.block,
    floor: row.floor,
    apartment: row.apartment,
    zone: row.zone,
    quantity: row.quantity != null ? Number(row.quantity) : null,
    unitPrice: row.unit_price != null ? Number(row.unit_price) : null,
    total: row.total != null ? Number(row.total) : null,
    status: row.status || 'pending',
    submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
  };
}

async function getMyWorkLogs(req, res) {
  const op = getOperative(req);
  if (!op) return res.status(401).json({ success: false, message: 'Unauthorized.' });

  try {
    const result = await pool.query(
      `SELECT id, job_display_id, worker_name, project, block, floor, apartment, zone,
              work_type, quantity, unit_price, total, status, submitted_at
       FROM work_logs
       WHERE submitted_by_user_id = $1
       ORDER BY submitted_at DESC
       LIMIT 100`,
      [op.id]
    );
    const entries = result.rows.map(rowToWorkLogEntry);
    return res.status(200).json({ success: true, entries });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(200).json({ success: true, entries: [] });
    }
    console.error('getMyWorkLogs error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load work entries.' });
  }
}

/**
 * POST /api/operatives/work-log/upload
 * Single file upload for work log (photo or document). Returns path for use in work-log submit.
 */
async function workLogUpload(req, res) {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded.' });
  }
  const filePath = '/uploads/worklogs/' + req.file.filename;
  return res.status(200).json({ success: true, path: filePath });
}

/**
 * Next job_display_id for company (WL-001, WL-002, ...).
 */
async function nextJobDisplayId(companyId) {
  try {
    const r = await pool.query(
      `SELECT COALESCE(MAX(
        CASE WHEN job_display_id ~ '^WL-[0-9]+$'
          THEN NULLIF(REGEXP_REPLACE(job_display_id, '^WL-', ''), '')::INT
          ELSE 0
        END
      ), 0) + 1 AS n FROM work_logs WHERE company_id = $1`,
      [companyId]
    );
    const n = r.rows[0] && r.rows[0].n ? parseInt(r.rows[0].n, 10) : 1;
    return 'WL-' + String(n).padStart(3, '0');
  } catch (e) {
    return 'WL-001';
  }
}

/**
 * POST /api/operatives/work-log
 * Create work log. Project/Site is taken from operative's assignment (read-only); body must not send project.
 */
async function createWorkLog(req, res) {
  const op = getOperative(req);
  if (!op) return res.status(401).json({ success: false, message: 'Unauthorized.' });

  try {
    let companyId = null;
    let projectId = null;
    let workerName = 'Operative';

    try {
      const userRow = await pool.query(
        'SELECT id, name, email, company_id, project_id FROM users WHERE id = $1',
        [op.id]
      );
      if (userRow.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }
      const user = userRow.rows[0];
      companyId = user.company_id;
      projectId = user.project_id;
      workerName = (user.name && String(user.name).trim()) || user.email || 'Operative';
    } catch (userErr) {
      if (userErr.code === '42703') {
        try {
          await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS project_id INT');
          const retry = await pool.query('SELECT id, name, email, company_id, project_id FROM users WHERE id = $1', [op.id]);
          if (retry.rows.length > 0) {
            const u = retry.rows[0];
            companyId = u.company_id;
            projectId = u.project_id;
            workerName = (u.name && String(u.name).trim()) || u.email || 'Operative';
          }
        } catch (_) {}
      }
      if (companyId == null) throw userErr;
    }

    if (projectId == null) {
      try {
        const paRow = await pool.query(
          'SELECT project_id FROM project_assignments WHERE user_id = $1 ORDER BY assigned_at DESC LIMIT 1',
          [op.id]
        );
        if (paRow.rows.length > 0 && paRow.rows[0].project_id != null) projectId = paRow.rows[0].project_id;
      } catch (_) {}
    }

    if (projectId == null) {
      return res.status(400).json({
        success: false,
        message: 'You are not assigned to a project. Contact your manager.',
      });
    }

    let projectName = null;
    try {
      const projRow = await pool.query(
        'SELECT COALESCE(project_name, name) AS name FROM projects WHERE id = $1',
        [projectId]
      );
      if (projRow.rows.length > 0) projectName = projRow.rows[0].name;
    } catch (projErr) {
      if (projErr.code === '42703') {
        const projRow2 = await pool.query('SELECT project_name AS name FROM projects WHERE id = $1', [projectId]);
        if (projRow2.rows.length > 0) projectName = projRow2.rows[0].name;
      }
    }

    const b = req.body || {};
    const workType = (b.workType && String(b.workType).trim()) || (b.work_type && String(b.work_type).trim());
    if (!workType) {
      return res.status(400).json({ success: false, message: 'Work type is required.' });
    }

    const quantity = b.quantity != null ? parseFloat(b.quantity) : null;
    const unitPrice = b.unitPrice != null ? parseFloat(b.unitPrice) : (b.unit_price != null ? parseFloat(b.unit_price) : null);
    const total = b.total != null ? parseFloat(b.total) : (quantity != null && unitPrice != null ? quantity * unitPrice : null);
    const photoUrls = Array.isArray(b.photoUrls) ? b.photoUrls : (b.photo_urls ? (Array.isArray(b.photo_urls) ? b.photo_urls : []) : []);
    const invoiceFilePath = (b.invoiceFilePath && String(b.invoiceFilePath).trim()) || (b.invoice_file_path && String(b.invoice_file_path).trim()) || null;

    const jobDisplayId = await nextJobDisplayId(companyId);

    await pool.query(
      `INSERT INTO work_logs (
        company_id, submitted_by_user_id, project_id, job_display_id, worker_name, project,
        block, floor, apartment, zone, work_type, quantity, unit_price, total,
        status, description, photo_urls, invoice_file_path
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending', $15, $16, $17)`,
      [
        companyId, op.id, projectId, jobDisplayId, workerName, projectName,
        (b.block && String(b.block).trim()) || null,
        (b.floor != null ? String(b.floor) : null) || null,
        (b.apartment && String(b.apartment).trim()) || null,
        (b.zone && String(b.zone).trim()) || null,
        workType,
        quantity, unitPrice, total,
        (b.description && String(b.description).trim()) || null,
        JSON.stringify(photoUrls),
        invoiceFilePath,
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Work entry submitted. Manager will review it in Work Logs.',
    });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(500).json({
        success: false,
        message: 'Work logs table not found. Run scripts/create_work_logs_table.sql',
      });
    }
    console.error('createWorkLog error:', err);
    return res.status(500).json({ success: false, message: 'Failed to submit work entry.' });
  }
}

module.exports = {
  getMe,
  clockIn,
  clockOut,
  workHoursStatus,
  workHoursWeekly,
  getCurrentProject,
  reportIssue,
  uploadDocument,
  getTasks,
  getMyWorkLogs,
  workLogUpload,
  createWorkLog,
};
