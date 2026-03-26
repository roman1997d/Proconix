/**
 * Operative dashboard API: work hours, project, issues, uploads, tasks.
 * All handlers expect req.operative (set by requireOperativeAuth).
 */

const fs = require('fs');
const { pool } = require('../db/pool');

const MAX_TASK_CONFIRMATION_PHOTOS = 10;

function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

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
 * Body: { project_id?, clock_in_latitude?, clock_in_longitude? }
 */
async function clockIn(req, res) {
  const op = getOperative(req);
  if (!op) return res.status(401).json({ success: false, message: 'Unauthorized.' });

  const body = req.body || {};
  let projectId = body.project_id != null ? body.project_id : null;
  const lat = body.clock_in_latitude != null ? Number(body.clock_in_latitude) : null;
  const lng = body.clock_in_longitude != null ? Number(body.clock_in_longitude) : null;

  try {
    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({
        success: false,
        message: 'Location is required to clock in.',
      });
    }

    // Determine operative's current project if not explicitly provided
    if (projectId == null) {
      try {
        const userRow = await pool.query(
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
            if (retry.rows.length > 0 && retry.rows[0].project_id != null) {
              projectId = retry.rows[0].project_id;
            }
          } catch (_) {
            /* ignore */
          }
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
          if (paErr.code !== '42P01') {
            console.error('clockIn project_assignments lookup:', paErr.message);
          }
        }
      }
    }

    // Compute on-site status if we have both operative location and project location
    let onSite = null;
    let distanceMiles = null;
    if (!Number.isNaN(lat) && !Number.isNaN(lng) && projectId != null) {
      try {
        const projRow = await pool.query(
          'SELECT latitude, longitude FROM projects WHERE id = $1',
          [projectId]
        );
        if (projRow.rows.length > 0 && projRow.rows[0].latitude != null && projRow.rows[0].longitude != null) {
          const pLat = Number(projRow.rows[0].latitude);
          const pLng = Number(projRow.rows[0].longitude);
          if (!Number.isNaN(pLat) && !Number.isNaN(pLng)) {
            distanceMiles = haversineMiles(pLat, pLng, lat, lng);
            if (!Number.isNaN(distanceMiles)) {
              onSite = distanceMiles <= 0.01; // 0.01 miles margin (~16 m)
            }
          }
        }
      } catch (projErr) {
        console.error('clockIn project location lookup:', projErr.message || projErr);
      }
    }

    if (onSite === false) {
      return res.status(400).json({
        success: false,
        message: 'You are not on site. Clock in not allowed.',
        on_site: false,
        distance_miles: distanceMiles != null ? Number(distanceMiles.toFixed(2)) : null,
      });
    }

    const result = await pool.query(
      `INSERT INTO work_hours (user_id, project_id, clock_in, clock_in_latitude, clock_in_longitude)
       VALUES ($1, $2, NOW(), $3, $4)
       RETURNING id, user_id, project_id, clock_in, clock_out, clock_in_latitude, clock_in_longitude`,
      [op.id, projectId, Number.isNaN(lat) ? null : lat, Number.isNaN(lng) ? null : lng]
    );
    let message = 'Clocked in.';
    if (onSite === true) {
      message = 'You are on site.';
    } else if (onSite === false) {
      message = 'You are not on site.';
    }
    return res.status(201).json({
      success: true,
      message,
      on_site: onSite,
      distance_miles: distanceMiles != null ? Number(distanceMiles.toFixed(2)) : null,
      work_hour: result.rows[0],
    });
  } catch (err) {
    console.error('clockIn error:', err);
    return res.status(500).json({ success: false, message: 'Failed to clock in.' });
  }
}

/**
 * POST /api/operatives/work-hours/clock-out
 * Body: { clock_out_latitude?, clock_out_longitude? }
 * Clocks out the most recent open record (clock_out IS NULL) for this user.
 */
async function clockOut(req, res) {
  const op = getOperative(req);
  if (!op) return res.status(401).json({ success: false, message: 'Unauthorized.' });

  const body = req.body || {};
  const lat = body.clock_out_latitude != null ? Number(body.clock_out_latitude) : null;
  const lng = body.clock_out_longitude != null ? Number(body.clock_out_longitude) : null;

  try {
    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({
        success: false,
        message: 'Location is required to clock out.',
      });
    }

    // Find the current open work_hours record
    const currentRow = await pool.query(
      `SELECT id, project_id
       FROM work_hours
       WHERE user_id = $1 AND clock_out IS NULL
       ORDER BY clock_in DESC
       LIMIT 1`,
      [op.id]
    );
    if (currentRow.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No active clock-in found.' });
    }

    const workHourId = currentRow.rows[0].id;
    const projectId = currentRow.rows[0].project_id;

    // Validate location against project location (if available)
    let onSite = null;
    let distanceMiles = null;
    if (projectId != null) {
      try {
        const projRow = await pool.query(
          'SELECT latitude, longitude FROM projects WHERE id = $1',
          [projectId]
        );
        if (projRow.rows.length > 0 && projRow.rows[0].latitude != null && projRow.rows[0].longitude != null) {
          const pLat = Number(projRow.rows[0].latitude);
          const pLng = Number(projRow.rows[0].longitude);
          if (!Number.isNaN(pLat) && !Number.isNaN(pLng)) {
            distanceMiles = haversineMiles(pLat, pLng, lat, lng);
            if (!Number.isNaN(distanceMiles)) {
              onSite = distanceMiles <= 0.01; // 0.01 miles margin (~16 m)
            }
          }
        }
      } catch (projErr) {
        console.error('clockOut project location lookup:', projErr.message || projErr);
      }
    }

    if (onSite === false) {
      return res.status(400).json({
        success: false,
        message: 'You are not on site. Clock out not allowed.',
        on_site: false,
        distance_miles: distanceMiles != null ? Number(distanceMiles.toFixed(2)) : null,
      });
    }

    const result = await pool.query(
      `UPDATE work_hours
       SET clock_out = NOW(),
           clock_out_latitude = COALESCE($2, clock_out_latitude),
           clock_out_longitude = COALESCE($3, clock_out_longitude)
       WHERE id = $1 AND user_id = $4
       RETURNING id, user_id, project_id, clock_in, clock_out, clock_in_latitude, clock_in_longitude, clock_out_latitude, clock_out_longitude`,
      [workHourId, Number.isNaN(lat) ? null : lat, Number.isNaN(lng) ? null : lng, op.id]
    );
    const row = result.rows[0];

    let message = 'Clocked out.';
    return res.status(200).json({
      success: true,
      message,
      on_site: onSite,
      distance_miles: distanceMiles != null ? Number(distanceMiles.toFixed(2)) : null,
      work_hour: row,
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
    let current;
    try {
      current = await pool.query(
        `SELECT id, clock_in, clock_out,
                clock_in_latitude, clock_in_longitude,
                clock_out_latitude, clock_out_longitude
         FROM work_hours
         WHERE user_id = $1 AND clock_out IS NULL
         ORDER BY clock_in DESC LIMIT 1`,
        [op.id]
      );
    } catch (colErr) {
      if (colErr.code === '42703') {
        // Columns might not exist yet – attempt to add them, then retry without location
        try {
          await pool.query(
            `ALTER TABLE work_hours
               ADD COLUMN IF NOT EXISTS clock_in_latitude  NUMERIC(9,6),
               ADD COLUMN IF NOT EXISTS clock_in_longitude NUMERIC(9,6),
               ADD COLUMN IF NOT EXISTS clock_out_latitude  NUMERIC(9,6),
               ADD COLUMN IF NOT EXISTS clock_out_longitude NUMERIC(9,6)`
          );
        } catch (alterErr) {
          console.error('workHoursStatus alter work_hours (geolocation):', alterErr.message);
        }
        current = await pool.query(
          `SELECT id, clock_in, clock_out FROM work_hours
           WHERE user_id = $1 AND clock_out IS NULL
           ORDER BY clock_in DESC LIMIT 1`,
          [op.id]
        );
      } else {
        throw colErr;
      }
    }

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
        } catch (_) {
          /* column may already exist or migration not applicable */
        }
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
 * Returns tasks for the operative: legacy `tasks` rows + Task & Planning rows where
 * `assigned_to` (TEXT[]) contains this user's name (case-insensitive, trimmed).
 */
async function getTasks(req, res) {
  const op = getOperative(req);
  if (!op) return res.status(401).json({ success: false, message: 'Unauthorized.' });

  const companyId = op.company_id;
  let userName = '';
  try {
    const ur = await pool.query('SELECT name FROM users WHERE id = $1', [op.id]);
    if (ur.rows && ur.rows[0]) userName = String(ur.rows[0].name || '').trim();
  } catch (e) {
    console.error('getTasks user name:', e);
  }

  const merged = [];

  try {
    const result = await pool.query(
      `SELECT id, user_id, project_id, name, deadline, status, created_at
       FROM tasks
       WHERE user_id = $1
       ORDER BY deadline ASC NULLS LAST, created_at DESC`,
      [op.id]
    );
    (result.rows || []).forEach((row) => {
      merged.push({
        source: 'legacy',
        id: row.id,
        title: row.name,
        deadline: row.deadline,
        status: row.status || 'pending',
        priority: null,
      });
    });
  } catch (err) {
    if (err.code !== '42P01') {
      console.error('getTasks legacy:', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch tasks.' });
    }
  }

  if (userName && companyId != null) {
    try {
      const pr = await pool.query(
        `SELECT ppt.id, ppt.title, ppt.deadline, ppt.status, ppt.priority, ppt.pickup_start_date, ppt.description
         FROM planning_plan_tasks ppt
         INNER JOIN planning_plans pp ON pp.id = ppt.plan_id
         WHERE pp.company_id = $1
           AND ppt.status IS DISTINCT FROM 'completed'
           AND EXISTS (
             SELECT 1 FROM unnest(ppt.assigned_to) AS a(x)
             WHERE LOWER(TRIM(a.x)) = LOWER(TRIM($2::text))
           )
         ORDER BY ppt.deadline ASC NULLS LAST`,
        [companyId, userName]
      );
      (pr.rows || []).forEach((row) => {
        merged.push({
          source: 'planning',
          id: row.id,
          title: row.title,
          deadline: row.deadline,
          status: row.status || 'not_started',
          priority: row.priority || null,
          pickup_start_date: row.pickup_start_date,
          description: row.description,
        });
      });
    } catch (err) {
      if (err.code !== '42P01') {
        console.error('getTasks planning:', err);
      }
    }
  }

  function deadlineSortKey(t) {
    if (!t.deadline) return Number.MAX_SAFE_INTEGER;
    const d = new Date(t.deadline);
    return Number.isNaN(d.getTime()) ? Number.MAX_SAFE_INTEGER : d.getTime();
  }
  merged.sort((a, b) => deadlineSortKey(a) - deadlineSortKey(b));

  return res.status(200).json({
    success: true,
    tasks: merged,
  });
}

async function getOperativeDisplayName(userId) {
  const ur = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
  return ur.rows && ur.rows[0] ? String(ur.rows[0].name || '').trim() : '';
}

async function fetchPlanningTaskIfAssigned(op, taskId, userName) {
  const r = await pool.query(
    `SELECT ppt.id, ppt.title, ppt.description, ppt.deadline, ppt.status, ppt.priority,
            ppt.pickup_start_date, ppt.notes, ppt.assigned_to
     FROM planning_plan_tasks ppt
     INNER JOIN planning_plans pp ON pp.id = ppt.plan_id
     WHERE ppt.id = $1 AND pp.company_id = $2
       AND EXISTS (
         SELECT 1 FROM unnest(ppt.assigned_to) AS a(x)
         WHERE LOWER(TRIM(a.x)) = LOWER(TRIM($3::text))
       )`,
    [taskId, op.company_id, userName]
  );
  return r.rows[0] || null;
}

async function fetchLegacyTaskIfOwned(op, taskId) {
  const r = await pool.query(
    `SELECT id, user_id, project_id, name, deadline, status, created_at
     FROM tasks WHERE id = $1 AND user_id = $2`,
    [taskId, op.id]
  );
  return r.rows[0] || null;
}

async function getTaskPhotosList(userId, source, taskId) {
  const r = await pool.query(
    `SELECT file_url FROM operative_task_photos
     WHERE user_id = $1 AND task_source = $2 AND task_id = $3
     ORDER BY created_at ASC`,
    [userId, source, taskId]
  );
  return (r.rows || []).map((x) => x.file_url);
}

async function countTaskPhotos(userId, source, taskId) {
  try {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS c FROM operative_task_photos
       WHERE user_id = $1 AND task_source = $2 AND task_id = $3`,
      [userId, source, taskId]
    );
    return r.rows[0] && r.rows[0].c != null ? Number(r.rows[0].c) : 0;
  } catch (e) {
    if (e.code === '42P01') return 0;
    throw e;
  }
}

function mapOperativeActionToStatus(source, action) {
  const a = String(action || '')
    .toLowerCase()
    .trim();
  if (a === 'decline' || a === 'refuse' || a === 'declined') return 'declined';
  if (a === 'in_progress' || a === 'progress' || a === 'started') return 'in_progress';
  if (a === 'complete' || a === 'completed') return 'completed';
  return null;
}

/**
 * GET /api/operatives/tasks/:taskId?source=legacy|planning
 */
async function getTaskDetail(req, res) {
  const op = getOperative(req);
  if (!op) return res.status(401).json({ success: false, message: 'Unauthorized.' });
  const taskId = parseInt(req.params.taskId, 10);
  const source = (req.query.source || '').toLowerCase();
  if (!Number.isInteger(taskId) || taskId < 1) {
    return res.status(400).json({ success: false, message: 'Invalid task id.' });
  }
  if (source !== 'legacy' && source !== 'planning') {
    return res.status(400).json({
      success: false,
      message: 'Query parameter source=legacy|planning is required.',
    });
  }

  try {
    let photos = [];
    if (source === 'legacy') {
      const task = await fetchLegacyTaskIfOwned(op, taskId);
      if (!task) return res.status(404).json({ success: false, message: 'Task not found.' });
      try {
        photos = await getTaskPhotosList(op.id, 'legacy', taskId);
      } catch (e) {
        if (e.code !== '42P01') throw e;
      }
      return res.status(200).json({
        success: true,
        task: {
          source: 'legacy',
          id: task.id,
          title: task.name,
          description: null,
          deadline: task.deadline,
          status: task.status || 'pending',
          priority: null,
          pickup_start_date: null,
          notes: null,
          assigned_to: null,
          confirmation_photos: photos,
        },
      });
    }

    const userName = await getOperativeDisplayName(op.id);
    const task = await fetchPlanningTaskIfAssigned(op, taskId, userName);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found.' });
    try {
      photos = await getTaskPhotosList(op.id, 'planning', taskId);
    } catch (e) {
      if (e.code !== '42P01') throw e;
    }
    return res.status(200).json({
      success: true,
      task: {
        source: 'planning',
        id: task.id,
        title: task.title,
        description: task.description,
        deadline: task.deadline,
        status: task.status,
        priority: task.priority,
        pickup_start_date: task.pickup_start_date,
        notes: task.notes,
        assigned_to: task.assigned_to,
        confirmation_photos: photos,
      },
    });
  } catch (err) {
    console.error('getTaskDetail error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load task.' });
  }
}

/**
 * PATCH /api/operatives/tasks/:taskId
 * Body: { source: 'legacy'|'planning', action: 'decline'|'in_progress'|'complete' }
 */
async function updateTaskStatus(req, res) {
  const op = getOperative(req);
  if (!op) return res.status(401).json({ success: false, message: 'Unauthorized.' });
  const taskId = parseInt(req.params.taskId, 10);
  const body = req.body || {};
  const source = String(body.source || '').toLowerCase();
  const newStatus = mapOperativeActionToStatus(source, body.action);

  if (!Number.isInteger(taskId) || taskId < 1) {
    return res.status(400).json({ success: false, message: 'Invalid task id.' });
  }
  if (source !== 'legacy' && source !== 'planning') {
    return res.status(400).json({ success: false, message: 'Body field source (legacy|planning) is required.' });
  }
  if (!newStatus) {
    return res.status(400).json({
      success: false,
      message: 'Invalid action. Use decline, in_progress, or complete.',
    });
  }

  try {
    if (source === 'legacy') {
      const row = await fetchLegacyTaskIfOwned(op, taskId);
      if (!row) return res.status(404).json({ success: false, message: 'Task not found.' });
      const cur = String(row.status || '').toLowerCase();
      if (cur === 'completed' || cur === 'declined') {
        return res.status(400).json({ success: false, message: 'This task is already closed.' });
      }
      await pool.query('UPDATE tasks SET status = $1 WHERE id = $2 AND user_id = $3', [
        newStatus,
        taskId,
        op.id,
      ]);
      return res.status(200).json({ success: true, status: newStatus });
    }

    const userName = await getOperativeDisplayName(op.id);
    const row = await fetchPlanningTaskIfAssigned(op, taskId, userName);
    if (!row) return res.status(404).json({ success: false, message: 'Task not found.' });
    const cur = String(row.status || '').toLowerCase();
    if (cur === 'completed' || cur === 'declined') {
      return res.status(400).json({ success: false, message: 'This task is already closed.' });
    }
    try {
      await pool.query('UPDATE planning_plan_tasks SET status = $1 WHERE id = $2', [newStatus, taskId]);
    } catch (upErr) {
      if (upErr.code === '23514') {
        return res.status(400).json({
          success: false,
          message:
            'Cannot set status. If declining tasks, run DB script: scripts/operative_task_photos_and_declined.sql',
        });
      }
      throw upErr;
    }
    return res.status(200).json({ success: true, status: newStatus });
  } catch (err) {
    console.error('updateTaskStatus error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update task.' });
  }
}

/**
 * POST /api/operatives/tasks/:taskId/photos (multipart: file, field source=legacy|planning)
 */
async function uploadTaskConfirmationPhoto(req, res) {
  const op = getOperative(req);
  if (!op) return res.status(401).json({ success: false, message: 'Unauthorized.' });
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded.' });
  }
  if (!/^image\//.test(req.file.mimetype || '')) {
    try {
      fs.unlinkSync(req.file.path);
    } catch (_) {
      // Ignore unlink failures
    }
    return res.status(400).json({ success: false, message: 'Only image files are allowed.' });
  }

  const taskId = parseInt(req.params.taskId, 10);
  const source = String((req.body && req.body.source) || '').toLowerCase();
  const fileUrl =
    (req.body && req.body.file_url) || `/uploads/task-photos/${req.file.filename}`;

  if (!Number.isInteger(taskId) || taskId < 1) {
    return res.status(400).json({ success: false, message: 'Invalid task id.' });
  }
  if (source !== 'legacy' && source !== 'planning') {
    return res.status(400).json({ success: false, message: 'Form field source (legacy|planning) is required.' });
  }

  try {
    if (source === 'legacy') {
      const row = await fetchLegacyTaskIfOwned(op, taskId);
      if (!row) return res.status(404).json({ success: false, message: 'Task not found.' });
      if (String(row.status || '').toLowerCase() === 'declined') {
        return res.status(400).json({ success: false, message: 'Cannot add photos to a declined task.' });
      }
    } else {
      const userName = await getOperativeDisplayName(op.id);
      const row = await fetchPlanningTaskIfAssigned(op, taskId, userName);
      if (!row) return res.status(404).json({ success: false, message: 'Task not found.' });
      if (String(row.status || '').toLowerCase() === 'declined') {
        return res.status(400).json({ success: false, message: 'Cannot add photos to a declined task.' });
      }
    }

    const n = await countTaskPhotos(op.id, source, taskId);
    if (n >= MAX_TASK_CONFIRMATION_PHOTOS) {
      return res.status(400).json({
        success: false,
        message: `Maximum ${MAX_TASK_CONFIRMATION_PHOTOS} confirmation photos per task.`,
      });
    }

    await pool.query(
      `INSERT INTO operative_task_photos (user_id, task_source, task_id, file_url) VALUES ($1, $2, $3, $4)`,
      [op.id, source, taskId, fileUrl]
    );
    const photos = await getTaskPhotosList(op.id, source, taskId);
    return res.status(201).json({ success: true, file_url: fileUrl, confirmation_photos: photos });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({
        success: false,
        message: 'Photo storage is not set up. Run scripts/operative_task_photos_and_declined.sql',
      });
    }
    console.error('uploadTaskConfirmationPhoto error:', err);
    return res.status(500).json({ success: false, message: 'Failed to save photo.' });
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
    invoiceFilePath: row.invoice_file_path || null,
    timesheetJobs: row.timesheet_jobs || [],
    operativeArchived: Boolean(row.operative_archived),
    operativeArchivedAt: row.operative_archived_at ? new Date(row.operative_archived_at).toISOString() : null,
    status: row.status || 'pending',
    submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
  };
}

async function getMyWorkLogs(req, res) {
  const op = getOperative(req);
  if (!op) return res.status(401).json({ success: false, message: 'Unauthorized.' });

  try {
    try {
      const result = await pool.query(
        `SELECT id, job_display_id, worker_name, project, block, floor, apartment, zone,
                work_type, quantity, unit_price, total, invoice_file_path, timesheet_jobs,
                operative_archived, operative_archived_at,
                status, submitted_at
         FROM work_logs
         WHERE submitted_by_user_id = $1
           AND COALESCE(operative_archived, false) = false
         ORDER BY submitted_at DESC
         LIMIT 100`,
        [op.id]
      );
      const entries = result.rows.map(rowToWorkLogEntry);
      return res.status(200).json({ success: true, entries });
    } catch (err) {
      if (err && err.code === '42703' && /timesheet_jobs|operative_archived/i.test(err.message || '')) {
        const result2 = await pool.query(
          `SELECT id, job_display_id, worker_name, project, block, floor, apartment, zone,
                  work_type, quantity, unit_price, total, invoice_file_path, status, submitted_at
           FROM work_logs
           WHERE submitted_by_user_id = $1
           ORDER BY submitted_at DESC
           LIMIT 100`,
          [op.id]
        );
        const entries2 = result2.rows.map(rowToWorkLogEntry);
        return res.status(200).json({ success: true, entries: entries2 });
      }
      throw err;
    }
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(200).json({ success: true, entries: [] });
    }
    console.error('getMyWorkLogs error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load work entries.' });
  }
}

/**
 * POST /api/operatives/work-log/:id/archive
 * Operative-only: hides the entry from "My work entries" for that operative.
 * Does NOT affect manager access (work_logs.archived).
 */
async function archiveMyWorkLog(req, res) {
  const op = getOperative(req);
  if (!op) return res.status(401).json({ success: false, message: 'Unauthorized.' });
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, message: 'Invalid work log id.' });

  try {
    try {
      const r = await pool.query(
        `UPDATE work_logs
         SET operative_archived = true,
             operative_archived_at = NOW(),
             updated_at = NOW()
         WHERE id = $1 AND submitted_by_user_id = $2
         RETURNING id`,
        [id, op.id]
      );
      if (!r.rows.length) return res.status(404).json({ success: false, message: 'Work entry not found.' });
      return res.status(200).json({ success: true });
    } catch (err) {
      if (err && err.code === '42703' && /operative_archived/i.test(err.message || '')) {
        return res.status(503).json({
          success: false,
          message: 'Archive feature is not set up. Run scripts/alter_work_logs_add_operative_archived.sql',
        });
      }
      throw err;
    }
  } catch (err) {
    console.error('archiveMyWorkLog error:', err);
    return res.status(500).json({ success: false, message: 'Failed to archive work entry.' });
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
        } catch (_) {
          /* fallback query failed */
        }
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
      } catch (_) {
        /* project_assignments lookup failed */
      }
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
    const timesheetJobsRaw = Array.isArray(b.timesheetJobs)
      ? b.timesheetJobs
      : b.timesheet_jobs && Array.isArray(b.timesheet_jobs)
        ? b.timesheet_jobs
        : [];
    const timesheetJobs = timesheetJobsRaw || [];

    const jobDisplayId = await nextJobDisplayId(companyId);

    try {
      await pool.query(
        `INSERT INTO work_logs (
          company_id, submitted_by_user_id, project_id, job_display_id, worker_name, project,
          block, floor, apartment, zone, work_type, quantity, unit_price, total,
          status, description, photo_urls, timesheet_jobs, invoice_file_path
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending', $15, $16, $17, $18)`,
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
          JSON.stringify(timesheetJobs),
          invoiceFilePath,
        ]
      );
    } catch (err) {
      // Backward-compat if the DB migration hasn't been applied yet.
      if (err && err.code === '42703' && /timesheet_jobs/i.test(err.message || '')) {
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
      } else {
        throw err;
      }
    }

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
  getTaskDetail,
  updateTaskStatus,
  uploadTaskConfirmationPhoto,
  getMyWorkLogs,
  workLogUpload,
  createWorkLog,
  archiveMyWorkLog,
};
