/**
 * Crews API – manager-only. Teams of operatives with a leader and members.
 */

const { pool } = require('../db/pool');

function getCompanyId(req) {
  return req.manager && req.manager.company_id != null ? req.manager.company_id : null;
}

async function notifyCompany(companyId, message) {
  if (companyId == null || !message) return;
  try {
    await pool.query(
      `INSERT INTO manager_notifications (company_id, message, created_at) VALUES ($1, $2, NOW())`,
      [companyId, String(message).slice(0, 2000)]
    );
  } catch (e) {
    if (e.code !== '42P01') console.error('notifyCompany', e);
  }
}

/** Names of active users in crew (leader + members) for task assignment */
async function expandCrewToAssigneeNames(companyId, crewId) {
  const cr = await pool.query(
    `SELECT id, leader_user_id FROM crews WHERE id = $1 AND company_id = $2 AND active = true`,
    [crewId, companyId]
  );
  if (!cr.rows.length) return null;
  const leaderId = cr.rows[0].leader_user_id;
  const mr = await pool.query(
    `SELECT u.id, TRIM(u.name) AS name, u.active
     FROM users u
     WHERE u.company_id = $1
       AND (
         u.id = $2
         OR u.id IN (SELECT user_id FROM crew_members WHERE crew_id = $3)
       )`,
    [companyId, leaderId, crewId]
  );
  const names = [];
  (mr.rows || []).forEach((row) => {
    if (row.active && row.name) names.push(row.name);
  });
  return names.length ? names : null;
}

/**
 * Used by planning controller – expand crew to assigned_to names.
 */
async function resolveCrewAssignmentForPlanning(companyId, crewId, fallbackAssignedTo) {
  if (crewId == null) return { assignedTo: fallbackAssignedTo, crewId: null, assignmentType: 'names' };
  const names = await expandCrewToAssigneeNames(companyId, crewId);
  if (!names || !names.length) return null;
  return { assignedTo: names, crewId, assignmentType: 'crew' };
}

async function listCrews(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) return res.status(403).json({ success: false, message: 'Access denied.' });
  try {
    const r = await pool.query(
      `SELECT c.id, c.name, c.leader_user_id, c.subcontractor, c.description, c.active, c.created_at,
              u.name AS leader_name,
              (SELECT COUNT(*)::int FROM crew_members cm WHERE cm.crew_id = c.id) AS member_count
       FROM crews c
       LEFT JOIN users u ON u.id = c.leader_user_id
       WHERE c.company_id = $1
       ORDER BY c.name ASC`,
      [companyId]
    );
    return res.json({ success: true, crews: r.rows });
  } catch (e) {
    if (e.code === '42P01') return res.json({ success: true, crews: [] });
    console.error('listCrews', e);
    return res.status(500).json({ success: false, message: 'Failed to list crews.' });
  }
}

async function createCrew(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) return res.status(403).json({ success: false, message: 'Access denied.' });
  const b = req.body || {};
  const name = (b.name || '').toString().trim();
  const leaderId = parseInt(b.leader_user_id, 10);
  const subcontractor = b.subcontractor != null ? String(b.subcontractor).trim().slice(0, 255) : null;
  const description = b.description != null ? String(b.description).trim() : null;
  if (!name) return res.status(400).json({ success: false, message: 'Crew name is required.' });
  if (!Number.isInteger(leaderId) || leaderId < 1) return res.status(400).json({ success: false, message: 'Crew leader is required.' });

  try {
    const ur = await pool.query(
      `SELECT id, name, active FROM users WHERE id = $1 AND company_id = $2`,
      [leaderId, companyId]
    );
    if (!ur.rows.length) return res.status(400).json({ success: false, message: 'Leader not found in your company.' });
    if (!ur.rows[0].active) return res.status(400).json({ success: false, message: 'Selected leader is inactive. Choose an active operative.' });

    const ins = await pool.query(
      `INSERT INTO crews (company_id, name, leader_user_id, subcontractor, description, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
       RETURNING id`,
      [companyId, name, leaderId, subcontractor || null, description || null]
    );
    const crewId = ins.rows[0].id;
    await pool.query(
      `INSERT INTO crew_members (crew_id, user_id, role_in_crew, created_at)
       VALUES ($1, $2, 'Leader', NOW())
       ON CONFLICT (crew_id, user_id) DO UPDATE SET role_in_crew = 'Leader'`,
      [crewId, leaderId]
    );

    const leaderName = ur.rows[0].name || 'Operative';
    await notifyCompany(companyId, `Crew "${name}" was created with ${leaderName} as leader.`);

    return res.status(201).json({ success: true, crew: { id: crewId } });
  } catch (e) {
    console.error('createCrew', e);
    return res.status(500).json({ success: false, message: 'Failed to create crew.' });
  }
}

async function getCrew(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) return res.status(403).json({ success: false, message: 'Access denied.' });
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, message: 'Invalid id.' });
  try {
    const cr = await pool.query(
      `SELECT c.*, u.name AS leader_name
       FROM crews c
       LEFT JOIN users u ON u.id = c.leader_user_id
       WHERE c.id = $1 AND c.company_id = $2`,
      [id, companyId]
    );
    if (!cr.rows.length) return res.status(404).json({ success: false, message: 'Crew not found.' });
    const crew = cr.rows[0];
    const mem = await pool.query(
      `SELECT cm.user_id, cm.role_in_crew, u.name, u.role AS trade, u.active
       FROM crew_members cm
       INNER JOIN users u ON u.id = cm.user_id
       WHERE cm.crew_id = $1
       ORDER BY CASE WHEN cm.role_in_crew = 'Leader' THEN 0 ELSE 1 END, u.name`,
      [id]
    );
    return res.json({
      success: true,
      crew,
      members: mem.rows,
    });
  } catch (e) {
    console.error('getCrew', e);
    return res.status(500).json({ success: false, message: 'Failed to load crew.' });
  }
}

async function updateCrew(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) return res.status(403).json({ success: false, message: 'Access denied.' });
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, message: 'Invalid id.' });
  const b = req.body || {};

  try {
    const cur = await pool.query(`SELECT name, leader_user_id FROM crews WHERE id = $1 AND company_id = $2`, [id, companyId]);
    if (!cur.rows.length) return res.status(404).json({ success: false, message: 'Crew not found.' });
    const prevLeader = cur.rows[0].leader_user_id;

    const name = b.name != null ? String(b.name).trim() : null;
    const subcontractor = b.subcontractor !== undefined ? (b.subcontractor ? String(b.subcontractor).trim().slice(0, 255) : null) : undefined;
    const description = b.description !== undefined ? (b.description ? String(b.description).trim() : null) : undefined;
    const active = b.active !== undefined ? !!b.active : undefined;
    let leaderId = b.leader_user_id != null ? parseInt(b.leader_user_id, 10) : null;

    const sets = [];
    const vals = [];
    let i = 1;
    if (name !== null && name !== '') {
      sets.push(`name = $${i++}`);
      vals.push(name);
    }
    if (subcontractor !== undefined) {
      sets.push(`subcontractor = $${i++}`);
      vals.push(subcontractor);
    }
    if (description !== undefined) {
      sets.push(`description = $${i++}`);
      vals.push(description);
    }
    if (active !== undefined) {
      sets.push(`active = $${i++}`);
      vals.push(active);
    }
    if (leaderId != null) {
      if (!Number.isInteger(leaderId) || leaderId < 1) return res.status(400).json({ success: false, message: 'Invalid leader.' });
      const ur = await pool.query(`SELECT id, name, active FROM users WHERE id = $1 AND company_id = $2`, [leaderId, companyId]);
      if (!ur.rows.length) return res.status(400).json({ success: false, message: 'Leader not found.' });
      if (!ur.rows[0].active) return res.status(400).json({ success: false, message: 'Selected leader is inactive.' });
      sets.push(`leader_user_id = $${i++}`);
      vals.push(leaderId);
    }

    if (!sets.length) return res.status(400).json({ success: false, message: 'Nothing to update.' });
    sets.push('updated_at = NOW()');
    vals.push(id, companyId);

    await pool.query(
      `UPDATE crews SET ${sets.join(', ')} WHERE id = $${i++} AND company_id = $${i}`,
      vals
    );

    if (leaderId != null && leaderId !== prevLeader) {
      await pool.query(
        `INSERT INTO crew_members (crew_id, user_id, role_in_crew, created_at)
         VALUES ($1, $2, 'Leader', NOW())
         ON CONFLICT (crew_id, user_id) DO UPDATE SET role_in_crew = 'Leader'`,
        [id, leaderId]
      );
      const nr = await pool.query(`SELECT name FROM users WHERE id = $1`, [leaderId]);
      const nn = nr.rows[0] ? nr.rows[0].name : '';
      await notifyCompany(companyId, `Crew "${cur.rows[0].name || id}" leader changed to ${nn}.`);
    }

    return res.json({ success: true });
  } catch (e) {
    console.error('updateCrew', e);
    return res.status(500).json({ success: false, message: 'Failed to update crew.' });
  }
}

async function addCrewMembers(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) return res.status(403).json({ success: false, message: 'Access denied.' });
  const crewId = parseInt(req.params.id, 10);
  const raw = req.body || {};
  const pairs = Array.isArray(raw.members) ? raw.members : [];
  if (!Number.isInteger(crewId) || crewId < 1) return res.status(400).json({ success: false, message: 'Invalid crew.' });

  try {
    const cr = await pool.query(`SELECT id, name, leader_user_id FROM crews WHERE id = $1 AND company_id = $2`, [crewId, companyId]);
    if (!cr.rows.length) return res.status(404).json({ success: false, message: 'Crew not found.' });
    const leaderId = cr.rows[0].leader_user_id;
    const crewName = cr.rows[0].name;
    let added = 0;

    for (let j = 0; j < pairs.length; j++) {
      const p = pairs[j] || {};
      const uid = parseInt(p.user_id, 10);
      const roleInCrew = (p.role_in_crew || 'Member').toString().trim().slice(0, 100) || 'Member';
      if (!Number.isInteger(uid) || uid < 1) continue;
      const ur = await pool.query(`SELECT id, name, active FROM users WHERE id = $1 AND company_id = $2`, [uid, companyId]);
      if (!ur.rows.length) continue;
      if (!ur.rows[0].active) continue;

      const prev = await pool.query(
        `SELECT 1 FROM crew_members WHERE crew_id = $1 AND user_id = $2`,
        [crewId, uid]
      );
      const wasMember = prev.rows.length > 0;

      await pool.query(
        `INSERT INTO crew_members (crew_id, user_id, role_in_crew, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (crew_id, user_id) DO UPDATE SET role_in_crew = EXCLUDED.role_in_crew`,
        [crewId, uid, uid === leaderId ? 'Leader' : roleInCrew]
      );
      added += 1;
      if (!wasMember) {
        const personName = ur.rows[0].name || 'Operative';
        await notifyCompany(companyId, `${personName} was added to crew "${crewName}".`);
      }
    }

    return res.json({ success: true, added });
  } catch (e) {
    console.error('addCrewMembers', e);
    return res.status(500).json({ success: false, message: 'Failed to add members.' });
  }
}

async function removeCrewMember(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) return res.status(403).json({ success: false, message: 'Access denied.' });
  const crewId = parseInt(req.params.id, 10);
  const userId = parseInt(req.params.userId, 10);
  if (!Number.isInteger(crewId) || !Number.isInteger(userId)) return res.status(400).json({ success: false, message: 'Invalid parameters.' });

  try {
    const cr = await pool.query(`SELECT leader_user_id, name FROM crews WHERE id = $1 AND company_id = $2`, [crewId, companyId]);
    if (!cr.rows.length) return res.status(404).json({ success: false, message: 'Crew not found.' });
    if (userId === cr.rows[0].leader_user_id) {
      return res.status(400).json({ success: false, message: 'Change crew leader before removing the current leader from the crew.' });
    }
    const dr = await pool.query(
      `DELETE FROM crew_members WHERE crew_id = $1 AND user_id = $2 RETURNING user_id`,
      [crewId, userId]
    );
    if (!dr.rows.length) return res.status(404).json({ success: false, message: 'Member not found.' });
    const ur = await pool.query(`SELECT name FROM users WHERE id = $1`, [userId]);
    await notifyCompany(
      companyId,
      `${ur.rows[0] ? ur.rows[0].name : 'A member'} was removed from crew "${cr.rows[0].name}".`
    );
    return res.json({ success: true });
  } catch (e) {
    console.error('removeCrewMember', e);
    return res.status(500).json({ success: false, message: 'Failed to remove member.' });
  }
}

async function crewActivitySummary(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) return res.status(403).json({ success: false, message: 'Access denied.' });
  const crewId = parseInt(req.params.id, 10);
  if (!Number.isInteger(crewId) || crewId < 1) return res.status(400).json({ success: false, message: 'Invalid crew.' });
  try {
    const ok = await pool.query(`SELECT 1 FROM crews WHERE id = $1 AND company_id = $2`, [crewId, companyId]);
    if (!ok.rows.length) return res.status(404).json({ success: false, message: 'Crew not found.' });

    const st = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE ppt.status IS NOT NULL AND ppt.status NOT IN ('completed','declined'))::int AS active_tasks,
         COUNT(*) FILTER (WHERE ppt.status IN ('completed','declined'))::int AS completed_tasks
       FROM planning_plan_tasks ppt
       INNER JOIN planning_plans pp ON pp.id = ppt.plan_id
       WHERE pp.company_id = $1 AND ppt.crew_id = $2`,
      [companyId, crewId]
    );
    const row = st.rows[0] || { active_tasks: 0, completed_tasks: 0 };
    const active = parseInt(row.active_tasks, 10) || 0;
    const completed = parseInt(row.completed_tasks, 10) || 0;
    const total = active + completed;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return res.json({
      success: true,
      summary: { active_tasks: active, completed_tasks: completed, progress_percent: pct },
    });
  } catch (e) {
    if (e.code === '42703' || e.code === '42P01') {
      return res.json({ success: true, summary: { active_tasks: 0, completed_tasks: 0, progress_percent: 0 } });
    }
    console.error('crewActivitySummary', e);
    return res.status(500).json({ success: false, message: 'Failed to load summary.' });
  }
}

async function listAvailableOperatives(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) return res.status(403).json({ success: false, message: 'Access denied.' });
  const q = (req.query.q || '').toString().trim().toLowerCase();
  const trade = (req.query.trade || '').toString().trim();
  try {
    let sql = `SELECT id, name, email, role AS trade, active FROM users WHERE company_id = $1 AND active = true`;
    const params = [companyId];
    if (trade) {
      sql += ` AND role = $${params.length + 1}`;
      params.push(trade);
    }
    sql += ` ORDER BY name ASC`;
    const r = await pool.query(sql, params);
    let rows = r.rows || [];
    if (q) {
      rows = rows.filter((u) => {
        const n = (u.name || '').toLowerCase();
        const e = (u.email || '').toLowerCase();
        return n.indexOf(q) !== -1 || e.indexOf(q) !== -1;
      });
    }
    return res.json({ success: true, operatives: rows });
  } catch (e) {
    console.error('listAvailableOperatives', e);
    return res.status(500).json({ success: false, message: 'Failed to load operatives.' });
  }
}

async function operativeCrews(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) return res.status(403).json({ success: false, message: 'Access denied.' });
  const userId = parseInt(req.params.userId || req.params.id, 10);
  if (!Number.isInteger(userId) || userId < 1) return res.status(400).json({ success: false, message: 'Invalid user.' });
  try {
    const r = await pool.query(
      `SELECT c.id, c.name, cm.role_in_crew,
              CASE WHEN c.leader_user_id = $2 THEN true ELSE false END AS is_leader
       FROM crews c
       INNER JOIN crew_members cm ON cm.crew_id = c.id AND cm.user_id = $2
       WHERE c.company_id = $1
       ORDER BY c.name`,
      [companyId, userId]
    );
    return res.json({ success: true, crews: r.rows });
  } catch (e) {
    console.error('operativeCrews', e);
    return res.status(500).json({ success: false, message: 'Failed to load crews.' });
  }
}

async function listNotifications(req, res) {
  const companyId = getCompanyId(req);
  if (companyId == null) return res.status(403).json({ success: false, message: 'Access denied.' });
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
  try {
    const r = await pool.query(
      `SELECT id, message, created_at FROM manager_notifications WHERE company_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [companyId, limit]
    );
    return res.json({ success: true, notifications: r.rows });
  } catch (e) {
    if (e.code === '42P01') return res.json({ success: true, notifications: [] });
    console.error('listNotifications', e);
    return res.status(500).json({ success: false, message: 'Failed to load notifications.' });
  }
}

module.exports = {
  listCrews,
  createCrew,
  getCrew,
  updateCrew,
  addCrewMembers,
  removeCrewMember,
  crewActivitySummary,
  listAvailableOperatives,
  operativeCrews,
  listNotifications,
  resolveCrewAssignmentForPlanning,
  expandCrewToAssigneeNames,
  notifyCompany,
};
