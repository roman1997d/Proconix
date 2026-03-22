/**
 * Dashboard Project Overview – aggregate stats for the manager's company.
 */

const { pool } = require('../db/pool');

const QA_COST_LABELS = {
  day: 'Day work',
  hour: 'Hour work',
  price: 'Price work',
  none: 'Cost type not set',
};

const QA_COST_ORDER = ['day', 'hour', 'price', 'none'];

/**
 * GET /api/dashboard/overview-stats
 * Returns: projects_count, planning_tasks_count, work_logs_total_cost, qa_job_cost_by_type
 */
async function getOverviewStats(req, res) {
  const companyId = req.manager && req.manager.company_id;
  if (companyId == null) {
    return res.status(403).json({ success: false, message: 'Company not found.' });
  }

  let projectsCount = 0;
  let planningTasksCount = 0;
  let workLogsTotalCost = 0;
  let qaJobCostByType = [];

  try {
    const r = await pool.query(
      'SELECT COUNT(*)::int AS c FROM projects WHERE company_id = $1',
      [companyId]
    );
    projectsCount = r.rows[0] && r.rows[0].c != null ? Number(r.rows[0].c) : 0;
  } catch (err) {
    if (err.code !== '42P01') {
      console.error('getOverviewStats projects:', err);
      return res.status(500).json({ success: false, message: 'Failed to load project count.' });
    }
  }

  try {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS c
       FROM planning_plan_tasks ppt
       INNER JOIN planning_plans pp ON pp.id = ppt.plan_id
       WHERE pp.company_id = $1`,
      [companyId]
    );
    planningTasksCount = r.rows[0] && r.rows[0].c != null ? Number(r.rows[0].c) : 0;
  } catch (err) {
    if (err.code !== '42P01') {
      console.error('getOverviewStats planning:', err);
      return res.status(500).json({ success: false, message: 'Failed to load planning task count.' });
    }
  }

  try {
    const r = await pool.query(
      `SELECT COALESCE(SUM(total), 0)::numeric AS s
       FROM work_logs
       WHERE company_id = $1
         AND (archived = false OR archived IS NULL)`,
      [companyId]
    );
    const raw = r.rows[0] && r.rows[0].s != null ? r.rows[0].s : 0;
    workLogsTotalCost = Number(raw);
    if (Number.isNaN(workLogsTotalCost)) workLogsTotalCost = 0;
  } catch (err) {
    if (err.code !== '42P01') {
      console.error('getOverviewStats work_logs:', err);
      return res.status(500).json({ success: false, message: 'Failed to load work log totals.' });
    }
  }

  try {
    const r = await pool.query(
      `SELECT COALESCE(NULLIF(LOWER(TRIM(ct.code)), ''), 'none') AS cost_code,
              COUNT(*)::int AS cnt
       FROM qa_jobs j
       INNER JOIN projects p ON p.id = j.project_id AND p.company_id = $1
       LEFT JOIN qa_cost_types ct ON ct.id = j.cost_type_id
       GROUP BY COALESCE(NULLIF(LOWER(TRIM(ct.code)), ''), 'none')`,
      [companyId]
    );
    const byCode = {};
    (r.rows || []).forEach((row) => {
      const code = row.cost_code || 'none';
      byCode[code] = row.cnt != null ? Number(row.cnt) : 0;
    });
    qaJobCostByType = Object.keys(byCode).map((code) => ({
      code,
      label: QA_COST_LABELS[code] || code.replace(/_/g, ' '),
      count: byCode[code],
    }));
    qaJobCostByType.sort((a, b) => {
      const ia = QA_COST_ORDER.indexOf(a.code);
      const ib = QA_COST_ORDER.indexOf(b.code);
      const sa = ia === -1 ? QA_COST_ORDER.length : ia;
      const sb = ib === -1 ? QA_COST_ORDER.length : ib;
      if (sa !== sb) return sa - sb;
      return a.label.localeCompare(b.label);
    });
  } catch (err) {
    if (err.code !== '42P01') {
      console.error('getOverviewStats qa_jobs:', err);
      return res.status(500).json({ success: false, message: 'Failed to load QA cost distribution.' });
    }
  }

  return res.status(200).json({
    success: true,
    projects_count: projectsCount,
    planning_tasks_count: planningTasksCount,
    work_logs_total_cost: workLogsTotalCost,
    qa_job_cost_by_type: qaJobCostByType,
  });
}

/**
 * GET /api/dashboard/overview-lists
 * - tasks_deadline_next_7_days: planning tasks (company-scoped) with deadline in [now, now+7d], not completed
 * - worklogs_unapproved_queue: unapproved work_logs (pending / edited / waiting_worker), not archived,
 *   oldest first (max 20). `is_stale` = true when COALESCE(submitted_at, created_at) is older than 7 days
 *   (so the list is useful even when nothing is yet “stale”; highlights overdue approvals).
 */
async function getOverviewLists(req, res) {
  const companyId = req.manager && req.manager.company_id;
  if (companyId == null) {
    return res.status(403).json({ success: false, message: 'Company not found.' });
  }

  let tasksDeadlineNext7Days = [];
  let worklogsUnapprovedQueue = [];

  try {
    const r = await pool.query(
      `SELECT ppt.id, ppt.title, ppt.deadline, ppt.status, ppt.plan_id
       FROM planning_plan_tasks ppt
       INNER JOIN planning_plans pp ON pp.id = ppt.plan_id
       WHERE pp.company_id = $1
         AND ppt.deadline >= NOW()
         AND ppt.deadline <= NOW() + INTERVAL '7 days'
         AND ppt.status <> 'completed'
       ORDER BY ppt.deadline ASC
       LIMIT 20`,
      [companyId]
    );
    tasksDeadlineNext7Days = (r.rows || []).map((row) => ({
      id: row.id,
      title: row.title,
      deadline: row.deadline,
      status: row.status,
      plan_id: row.plan_id,
    }));
  } catch (err) {
    if (err.code !== '42P01') {
      console.error('getOverviewLists planning:', err);
      return res.status(500).json({ success: false, message: 'Failed to load upcoming tasks.' });
    }
  }

  const mapWorklogRow = (row) => ({
    id: row.id,
    job_display_id: row.job_display_id,
    worker_name: row.worker_name,
    project: row.project,
    submitted_at: row.submitted_at,
    status: row.status,
    total: row.total != null ? Number(row.total) : null,
    is_stale: Boolean(row.is_stale),
  });

  try {
    let r;
    try {
      r = await pool.query(
        `SELECT id, job_display_id, worker_name, project, submitted_at, status, total,
            (COALESCE(submitted_at, created_at) < NOW() - INTERVAL '7 days') AS is_stale
         FROM work_logs
         WHERE company_id = $1
           AND (archived = false OR archived IS NULL)
           AND LOWER(TRIM(COALESCE(status, ''))) IN ('pending', 'edited', 'waiting_worker')
         ORDER BY COALESCE(submitted_at, created_at) ASC NULLS LAST
         LIMIT 20`,
        [companyId]
      );
    } catch (err) {
      if (err.code === '42703') {
        r = await pool.query(
          `SELECT id, job_display_id, worker_name, project, submitted_at, status, total,
              (submitted_at IS NOT NULL AND submitted_at < NOW() - INTERVAL '7 days') AS is_stale
           FROM work_logs
           WHERE company_id = $1
             AND (archived = false OR archived IS NULL)
             AND LOWER(TRIM(COALESCE(status, ''))) IN ('pending', 'edited', 'waiting_worker')
           ORDER BY submitted_at ASC NULLS LAST
           LIMIT 20`,
          [companyId]
        );
      } else {
        throw err;
      }
    }
    worklogsUnapprovedQueue = (r.rows || []).map(mapWorklogRow);
  } catch (err) {
    if (err.code !== '42P01') {
      console.error('getOverviewLists work_logs:', err);
      return res.status(500).json({ success: false, message: 'Failed to load unapproved work logs.' });
    }
  }

  return res.status(200).json({
    success: true,
    tasks_deadline_next_7_days: tasksDeadlineNext7Days,
    /** @deprecated use worklogs_unapproved_queue */
    worklogs_unapproved_over_7_days: worklogsUnapprovedQueue.filter((w) => w.is_stale),
    worklogs_unapproved_queue: worklogsUnapprovedQueue,
  });
}

/**
 * GET /api/dashboard/operative-activity-today
 * Operatives (users in manager's company) who clocked in today (server local calendar day).
 * For each user: latest clock-in today → project they were on for that session.
 */
async function getOperativeActivityToday(req, res) {
  const companyId = req.manager && req.manager.company_id;
  if (companyId == null) {
    return res.status(403).json({ success: false, message: 'Company not found.' });
  }

  const mapRow = (row) => ({
    user_id: row.user_id,
    user_name: row.user_name || '',
    project_id: row.project_id,
    project_name: row.project_name || null,
    clock_in: row.clock_in,
    clock_out: row.clock_out,
    is_on_shift: row.clock_out == null,
  });

  const activitySql = (projectCol) => `
    SELECT DISTINCT ON (wh.user_id)
        wh.user_id,
        u.name AS user_name,
        wh.project_id,
        p.${projectCol} AS project_name,
        wh.clock_in,
        wh.clock_out
     FROM work_hours wh
     INNER JOIN users u ON u.id = wh.user_id AND u.company_id = $1
     LEFT JOIN projects p ON p.id = wh.project_id AND p.company_id = $1
     WHERE wh.clock_in >= date_trunc('day', CURRENT_TIMESTAMP)
       AND wh.clock_in < date_trunc('day', CURRENT_TIMESTAMP) + INTERVAL '1 day'
     ORDER BY wh.user_id, wh.clock_in DESC`;

  try {
    let result;
    try {
      // Prefer project_name; do not use COALESCE(project_name, name) — Postgres requires both columns to exist.
      result = await pool.query(activitySql('project_name'), [companyId]);
    } catch (err) {
      if (err.code === '42703') {
        result = await pool.query(activitySql('name'), [companyId]);
      } else {
        throw err;
      }
    }

    const operatives = (result.rows || []).map(mapRow);
    return res.status(200).json({
      success: true,
      count: operatives.length,
      operatives,
    });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(200).json({ success: true, count: 0, operatives: [] });
    }
    console.error('getOperativeActivityToday error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load operative activity.' });
  }
}

module.exports = {
  getOverviewStats,
  getOverviewLists,
  getOperativeActivityToday,
};
