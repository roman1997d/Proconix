const { pool } = require('../db/pool');

const MATERIAL_REQUEST_STATUSES = ['Pending', 'In progress', 'Delivered'];

function normalizeMaterialRequestStatus(s) {
  const raw = String(s || 'Pending').trim();
  if (MATERIAL_REQUEST_STATUSES.includes(raw)) return raw;
  const low = raw.toLowerCase();
  if (low === 'completed' || low === 'delivered') return 'Delivered';
  if (low === 'approved' || low === 'in progress' || low === 'in_progress') return 'In progress';
  if (low === 'pending') return 'Pending';
  return 'Pending';
}

function tableMissing(err) {
  return err && err.code === '42P01';
}

function columnMissing(err) {
  return err && err.code === '42703';
}

const CHAT_AGENT_NAME = 'Chat Agent';
const CHAT_AGENT_SENDER_KIND = 'manager';
const CHAT_AGENT_SENDER_ID = 0;

/** e.g. "Waiting time - 2 H 15 Min" */
function formatWaitingTimeEnglish(ms) {
  const totalMin = Math.max(0, Math.floor(Number(ms) / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `Waiting time - ${h} H ${m} Min`;
}

/**
 * After a new material request, post a Chat Agent system message with wait stats
 * from the last delivered request in the same project room.
 */
async function insertChatAgentNewRequestInsight(client, { companyId, projectId, newRequestId }) {
  let prev;
  try {
    const r = await client.query(
      `SELECT id, created_at, request_delivered_at
       FROM site_chat_message
       WHERE company_id = $1 AND project_id = $2
         AND message_type = 'material_request'
         AND COALESCE(is_auto_repost, false) = false
         AND id <> $3
         AND request_delivered_at IS NOT NULL
       ORDER BY request_delivered_at DESC
       LIMIT 1`,
      [companyId, projectId, newRequestId]
    );
    prev = r.rows[0];
  } catch (err) {
    if (columnMissing(err)) return;
    throw err;
  }

  let body;
  if (!prev) {
    body = `${CHAT_AGENT_NAME}: First material request here — order early.`;
  } else {
    const waitMs = new Date(prev.request_delivered_at).getTime() - new Date(prev.created_at).getTime();
    const fmt = formatWaitingTimeEnglish(waitMs);
    body = `${CHAT_AGENT_NAME}: Last delivery #${prev.id}: ${fmt}. Order early.`;
  }

  const ins = await client.query(
    `INSERT INTO site_chat_message
     (company_id, project_id, sender_kind, sender_id, sender_name, message_type, body)
     VALUES ($1,$2,$3,$4,$5,'system',$6)
     RETURNING id`,
    [companyId, projectId, CHAT_AGENT_SENDER_KIND, CHAT_AGENT_SENDER_ID, CHAT_AGENT_NAME, body]
  );
  await notifyProjectRecipients(client, {
    companyId,
    projectId,
    messageId: ins.rows[0].id,
    actorKind: CHAT_AGENT_SENDER_KIND,
    actorId: CHAT_AGENT_SENDER_ID,
    kind: 'chat_agent',
    title: CHAT_AGENT_NAME,
    body: body.slice(0, 240),
  });
}

/**
 * Every N minutes (default 1): for each user-posted material request still not delivered,
 * posts an English Chat Agent reminder and a new material_request row (auto repost).
 * Repeats until delivered. Auto-reposts are excluded from this loop (is_auto_repost = true).
 */
async function runSiteChatAgentReminders() {
  const reminderMin = Math.max(1, parseInt(process.env.SITE_CHAT_AGENT_REMINDER_MINUTES || '1', 10));
  const threshold = new Date(Date.now() - reminderMin * 60 * 1000).toISOString();
  let pending;
  try {
    const r = await pool.query(
      `SELECT id
       FROM site_chat_message
       WHERE message_type = 'material_request'
         AND COALESCE(is_auto_repost, false) = false
         AND LOWER(TRIM(COALESCE(request_status, ''))) NOT IN ('delivered', 'completed')
         AND (
           (agent_reminder_at IS NULL AND created_at <= $1::timestamptz)
           OR (agent_reminder_at IS NOT NULL AND agent_reminder_at <= $1::timestamptz)
         )
       ORDER BY created_at ASC
       LIMIT 25`,
      [threshold]
    );
    pending = r.rows;
  } catch (err) {
    if (columnMissing(err) || tableMissing(err)) return;
    console.error('siteChat runSiteChatAgentReminders (list):', err);
    return;
  }

  for (const row of pending) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const u = await c.query(
        `UPDATE site_chat_message
         SET agent_reminder_at = NOW()
         WHERE id = $1
           AND message_type = 'material_request'
           AND COALESCE(is_auto_repost, false) = false
           AND LOWER(TRIM(COALESCE(request_status, ''))) NOT IN ('delivered', 'completed')
           AND (
             (agent_reminder_at IS NULL AND created_at <= $2::timestamptz)
             OR (agent_reminder_at IS NOT NULL AND agent_reminder_at <= $2::timestamptz)
           )
         RETURNING id, company_id, project_id, sender_kind, sender_id, sender_name,
                   request_summary, request_details, request_urgency, request_location, created_at`,
        [row.id, threshold]
      );
      if (!u.rows.length) {
        await c.query('ROLLBACK');
        continue;
      }
      const rec = u.rows[0];
      const summaryRaw = String(rec.request_summary || '').trim();
      const reminderBody = `Undelivered request #${rec.id}`;
      const sysIns = await c.query(
        `INSERT INTO site_chat_message
         (company_id, project_id, sender_kind, sender_id, sender_name, message_type, body)
         VALUES ($1,$2,$3,$4,$5,'system',$6)
         RETURNING id`,
        [rec.company_id, rec.project_id, CHAT_AGENT_SENDER_KIND, CHAT_AGENT_SENDER_ID, CHAT_AGENT_NAME, reminderBody]
      );
      await notifyProjectRecipients(c, {
        companyId: rec.company_id,
        projectId: rec.project_id,
        messageId: sysIns.rows[0].id,
        actorKind: CHAT_AGENT_SENDER_KIND,
        actorId: CHAT_AGENT_SENDER_ID,
        kind: 'chat_agent_reminder',
        title: 'Undelivered request',
        body: reminderBody.slice(0, 240),
      });

      const repostSummaryBase = summaryRaw || `Material request #${rec.id}`;
      const repostSummary = (`[Repost from #${rec.id}] ${repostSummaryBase}`).slice(0, 2000);
      const repostIns = await c.query(
        `INSERT INTO site_chat_message
         (company_id, project_id, sender_kind, sender_id, sender_name, message_type, body,
          request_status, request_summary, request_details, request_urgency, request_location, is_auto_repost, repost_of_message_id)
         VALUES ($1,$2,$3,$4,$5,'material_request', NULL,
          'Pending', $6, $7, $8, $9, true, $10)
         RETURNING id`,
        [
          rec.company_id,
          rec.project_id,
          rec.sender_kind,
          rec.sender_id,
          rec.sender_name,
          repostSummary,
          String(rec.request_details || '').trim(),
          String(rec.request_urgency || 'Normal'),
          String(rec.request_location || '').trim(),
          rec.id,
        ]
      );
      const newId = repostIns.rows[0].id;
      await notifyProjectRecipients(c, {
        companyId: rec.company_id,
        projectId: rec.project_id,
        messageId: newId,
        actorKind: rec.sender_kind,
        actorId: rec.sender_id,
        kind: 'new_material_request',
        title: 'New Material Request',
        body: repostSummary.slice(0, 200),
      });
      await c.query('COMMIT');
    } catch (err) {
      try {
        await c.query('ROLLBACK');
      } catch (_) {}
      if (!columnMissing(err) && !tableMissing(err)) {
        console.error('siteChat runSiteChatAgentReminders (row):', err);
      }
    } finally {
      c.release();
    }
  }
}

/** If this row is an auto-repost, mirror status (and delivered time) onto the root in the same room. */
async function syncOriginalMaterialRequestIfRepost(client, materialRowId, nextStatus) {
  await client.query(
    `UPDATE site_chat_message AS m
     SET request_status = $2,
         request_delivered_at = CASE WHEN $2 = 'Delivered' THEN NOW() ELSE NULL END
     FROM site_chat_message AS r
     WHERE r.id = $1
       AND r.message_type = 'material_request'
       AND m.id = r.repost_of_message_id
       AND m.message_type = 'material_request'
       AND m.company_id = r.company_id
       AND m.project_id = r.project_id`,
    [materialRowId, nextStatus]
  );
}

/** When the root material request changes status, mirror onto all agent repost rows for that root. */
async function syncRepostsMaterialRequestsFromRoot(client, rootMessageId, nextStatus) {
  await client.query(
    `UPDATE site_chat_message AS child
     SET request_status = $2,
         request_delivered_at = CASE WHEN $2 = 'Delivered' THEN NOW() ELSE NULL END
     FROM site_chat_message AS root
     WHERE root.id = $1
       AND root.message_type = 'material_request'
       AND child.repost_of_message_id = root.id
       AND child.message_type = 'material_request'
       AND child.company_id = root.company_id
       AND child.project_id = root.project_id`,
    [rootMessageId, nextStatus]
  );
}

function getActor(req) {
  if (req.userType === 'manager' && req.manager) {
    return {
      kind: 'manager',
      id: req.manager.id,
      companyId: req.manager.company_id,
      name: [req.manager.name, req.manager.surname].filter(Boolean).join(' ') || req.manager.email || 'Manager',
    };
  }
  if (req.userType === 'operative' && req.operative) {
    return {
      kind: 'operative',
      id: req.operative.id,
      companyId: req.operative.company_id,
      name: req.operative.email || 'User',
    };
  }
  return null;
}

async function resolveActorDisplayName(actor) {
  if (!actor) return 'User';
  if (actor.kind === 'manager') return actor.name || 'Manager';
  try {
    const r = await pool.query(
      'SELECT name, email FROM users WHERE id = $1 AND company_id = $2 LIMIT 1',
      [actor.id, actor.companyId]
    );
    if (r.rows[0]) {
      const nm = String(r.rows[0].name || '').trim();
      return nm || r.rows[0].email || actor.name || 'User';
    }
  } catch (e) {
    if (e.code !== '42703' && e.code !== '42P01') throw e;
  }
  return actor.name || 'User';
}

async function resolveProjectForRequest(req, actor, explicitProjectId) {
  if (!actor) return null;
  if (actor.kind === 'operative') {
    const wantPid = parseInt(explicitProjectId, 10);
    if (Number.isInteger(wantPid) && wantPid >= 1) {
      try {
        const access = await pool.query(
          `SELECT p.id, p.project_name, p.name
           FROM projects p
           WHERE p.id = $1 AND p.company_id = $2
             AND (
               EXISTS (
                 SELECT 1 FROM users u
                 WHERE u.id = $3 AND u.company_id = $2 AND u.project_id IS NOT NULL AND u.project_id = p.id
               )
               OR EXISTS (
                 SELECT 1 FROM project_assignments pa
                 WHERE pa.user_id = $3 AND pa.project_id = p.id
               )
             )
           LIMIT 1`,
          [wantPid, actor.companyId, actor.id]
        );
        if (access.rows.length) return access.rows[0];
      } catch (e) {
        if (e.code !== '42P01') throw e;
        const simple = await pool.query(
          `SELECT p.id, p.project_name, p.name
           FROM projects p
           INNER JOIN users u ON u.id = $3 AND u.company_id = $2 AND u.project_id = p.id
           WHERE p.id = $1 AND p.company_id = $2
           LIMIT 1`,
          [wantPid, actor.companyId, actor.id]
        );
        if (simple.rows.length) return simple.rows[0];
      }
    }

    let assigned = null;
    try {
      const r = await pool.query('SELECT project_id FROM users WHERE id = $1 AND company_id = $2', [actor.id, actor.companyId]);
      if (r.rows[0] && r.rows[0].project_id != null) assigned = r.rows[0].project_id;
    } catch (e) {
      if (e.code !== '42703') throw e;
    }
    if (assigned == null) {
      try {
        const pa = await pool.query(
          'SELECT project_id FROM project_assignments WHERE user_id = $1 ORDER BY assigned_at DESC LIMIT 1',
          [actor.id]
        );
        if (pa.rows[0] && pa.rows[0].project_id != null) assigned = pa.rows[0].project_id;
      } catch (e) {
        if (e.code !== '42P01') throw e;
      }
    }
    if (assigned == null) return null;
    const pr = await pool.query('SELECT id, project_name, name FROM projects WHERE id = $1 AND company_id = $2', [assigned, actor.companyId]);
    return pr.rows[0] || null;
  }

  const pid = parseInt(explicitProjectId, 10);
  if (!Number.isInteger(pid) || pid < 1) return null;
  const pr = await pool.query('SELECT id, project_name, name FROM projects WHERE id = $1 AND company_id = $2', [pid, actor.companyId]);
  return pr.rows[0] || null;
}

async function notifyProjectRecipients(client, payload) {
  const { companyId, projectId, messageId, actorKind, actorId, kind, title, body } = payload;
  const mgrs = await client.query('SELECT id FROM manager WHERE company_id = $1', [companyId]);
  let users = { rows: [] };
  try {
    users = await client.query('SELECT id FROM users WHERE company_id = $1 AND project_id = $2', [companyId, projectId]);
  } catch (e) {
    if (e.code !== '42703') throw e;
  }

  for (const m of mgrs.rows) {
    if (actorKind === 'manager' && Number(actorId) === Number(m.id)) continue;
    await client.query(
      `INSERT INTO site_chat_notification
       (company_id, project_id, message_id, recipient_kind, recipient_id, kind, title, body)
       VALUES ($1, $2, $3, 'manager', $4, $5, $6, $7)`,
      [companyId, projectId, messageId, m.id, kind, title, body]
    );
  }
  for (const u of users.rows) {
    if (actorKind === 'operative' && Number(actorId) === Number(u.id)) continue;
    await client.query(
      `INSERT INTO site_chat_notification
       (company_id, project_id, message_id, recipient_kind, recipient_id, kind, title, body)
       VALUES ($1, $2, $3, 'operative', $4, $5, $6, $7)`,
      [companyId, projectId, messageId, u.id, kind, title, body]
    );
  }
}

async function getRoom(req, res) {
  const actor = getActor(req);
  if (!actor) return res.status(403).json({ success: false, message: 'Access denied.' });
  try {
    const project = await resolveProjectForRequest(req, actor, req.query.project_id);
    if (!project) return res.status(404).json({ success: false, message: 'No project room found.' });
    return res.json({
      success: true,
      room: {
        project_id: project.id,
        project_name: project.project_name || project.name || `Project #${project.id}`,
      },
    });
  } catch (err) {
    console.error('siteChat getRoom:', err);
    return res.status(500).json({ success: false, message: 'Failed to load room.' });
  }
}

async function listMessages(req, res) {
  const actor = getActor(req);
  if (!actor) return res.status(403).json({ success: false, message: 'Access denied.' });
  try {
    const project = await resolveProjectForRequest(req, actor, req.query.project_id);
    if (!project) return res.status(404).json({ success: false, message: 'No project room found.' });
    const limit = Math.min(parseInt(req.query.limit, 10) || 80, 200);
    const since = req.query.since ? new Date(String(req.query.since)) : null;
    const params = [actor.companyId, project.id, limit];
    let whereExtra = '';
    if (since && !isNaN(since.getTime())) {
      params.push(since.toISOString());
      whereExtra = ` AND m.created_at > $4`;
    }
    const r = await pool.query(
      `SELECT m.id, m.message_type AS type, m.body AS text, m.file_name, m.file_url,
              m.request_status AS status, m.request_summary AS summary, m.request_details AS details,
              m.request_urgency AS urgency, m.request_location AS location, m.created_at,
              m.repost_of_message_id AS repost_of_message_id,
              COALESCE(m.is_auto_repost, false) AS is_auto_repost,
              m.sender_kind, m.sender_id, m.sender_name,
              COALESCE(
                NULLIF(TRIM(
                  CASE
                    WHEN m.sender_kind = 'manager' THEN CONCAT(COALESCE(mgr.name, ''), ' ', COALESCE(mgr.surname, ''))
                    WHEN m.sender_kind = 'operative' THEN COALESCE(usr.name, '')
                    ELSE ''
                  END
                ), ''),
                NULLIF(m.sender_name, ''),
                CASE
                  WHEN m.sender_kind = 'manager' THEN COALESCE(mgr.email, 'Unknown user')
                  WHEN m.sender_kind = 'operative' THEN COALESCE(usr.email, 'Unknown user')
                  ELSE 'User'
                END
              ) AS user_name
       FROM site_chat_message m
       LEFT JOIN manager mgr
         ON m.sender_kind = 'manager' AND m.sender_id = mgr.id AND mgr.company_id = m.company_id
       LEFT JOIN users usr
         ON m.sender_kind = 'operative' AND m.sender_id = usr.id AND usr.company_id = m.company_id
       WHERE m.company_id = $1 AND m.project_id = $2 ${whereExtra}
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT $3`,
      params
    );
    const rowsRaw = r.rows.reverse();
    const reqIds = rowsRaw
      .filter((m) => m.type === 'material_request')
      .map((m) => m.id);
    let photoByMessage = {};
    if (reqIds.length) {
      try {
        const pr = await pool.query(
          `SELECT id, message_id, file_url, created_at, uploaded_by_kind, uploaded_by_id
           FROM site_chat_request_photo
           WHERE message_id = ANY($1::bigint[])
           ORDER BY created_at ASC`,
          [reqIds]
        );
        photoByMessage = pr.rows.reduce((acc, p) => {
          const k = String(p.message_id);
          if (!acc[k]) acc[k] = [];
          acc[k].push(p);
          return acc;
        }, {});
      } catch (photoErr) {
        if (!tableMissing(photoErr)) throw photoErr;
        photoByMessage = {};
      }
    }
    const rows = rowsRaw.map((m) => {
      const stLow = String(m.status || '').trim().toLowerCase();
      const isDelivered = ['delivered', 'completed'].includes(stLow);
      const isAuthor = m.sender_kind === actor.kind && Number(m.sender_id) === Number(actor.id);
      const isAgentRepost =
        m.type === 'material_request' && m.repost_of_message_id != null && Number(m.repost_of_message_id) > 0;
      return {
        ...m,
        photos: photoByMessage[String(m.id)] || [],
        can_complete:
          m.type === 'material_request' &&
          !isAuthor &&
          !isDelivered,
        /** Author can change status on agent auto-reposts; others use same rules as before. */
        can_edit_status:
          m.type === 'material_request' &&
          !isDelivered &&
          (!isAuthor || isAgentRepost),
        is_mine: isAuthor,
      };
    });
    return res.json({ success: true, messages: rows });
  } catch (err) {
    if (tableMissing(err)) {
      return res.status(503).json({
        success: false,
        message: 'Site chat tables are not installed. Run scripts/create_site_chat_tables.sql',
      });
    }
    console.error('siteChat listMessages:', err);
    return res.status(500).json({ success: false, message: 'Failed to load messages.' });
  }
}

async function completeMaterialRequest(req, res) {
  const actor = getActor(req);
  if (!actor) return res.status(403).json({ success: false, message: 'Access denied.' });
  const messageId = parseInt(req.params.messageId, 10);
  if (!Number.isInteger(messageId) || messageId < 1) {
    return res.status(400).json({ success: false, message: 'Invalid message id.' });
  }
  try {
    const msg = await pool.query(
      `SELECT id, company_id, project_id, sender_kind, sender_id, request_status, message_type, repost_of_message_id
       FROM site_chat_message WHERE id = $1`,
      [messageId]
    );
    if (!msg.rows.length) return res.status(404).json({ success: false, message: 'Request not found.' });
    const row = msg.rows[0];
    if (row.message_type !== 'material_request') {
      return res.status(400).json({ success: false, message: 'Message is not a material request.' });
    }
    const projectIdHint = req.body.project_id != null ? req.body.project_id : row.project_id;
    const project = await resolveProjectForRequest(req, actor, projectIdHint);
    if (!project || Number(project.id) !== Number(row.project_id)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    if (row.sender_kind === actor.kind && Number(row.sender_id) === Number(actor.id)) {
      return res.status(400).json({ success: false, message: 'Requester cannot complete own request.' });
    }
    const actorName = await resolveActorDisplayName(actor);
    const completedAt = new Date();
    const completedText =
      'User "' +
      actorName +
      '" marked request #' +
      String(messageId) +
      ' as delivered on ' +
      completedAt.toLocaleString();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE site_chat_message
         SET request_status = 'Delivered', request_delivered_at = NOW()
         WHERE id = $1`,
        [messageId]
      );
      await client.query('SAVEPOINT site_chat_req_sync');
      try {
        await syncOriginalMaterialRequestIfRepost(client, messageId, 'Delivered');
        const link = await client.query(
          `SELECT repost_of_message_id FROM site_chat_message WHERE id = $1`,
          [messageId]
        );
        const ro = link.rows[0] && link.rows[0].repost_of_message_id;
        if (!ro) {
          await syncRepostsMaterialRequestsFromRoot(client, messageId, 'Delivered');
        }
        await client.query('RELEASE SAVEPOINT site_chat_req_sync');
      } catch (syncErr) {
        await client.query('ROLLBACK TO SAVEPOINT site_chat_req_sync');
        if (!columnMissing(syncErr)) throw syncErr;
      }
      const sys = await client.query(
        `INSERT INTO site_chat_message
         (company_id, project_id, sender_kind, sender_id, sender_name, message_type, body)
         VALUES ($1,$2,$3,$4,$5,'system',$6)
         RETURNING id, created_at`,
        [row.company_id, row.project_id, actor.kind, actor.id, actorName, completedText]
      );
      await notifyProjectRecipients(client, {
        companyId: row.company_id,
        projectId: row.project_id,
        messageId: sys.rows[0].id,
        actorKind: actor.kind,
        actorId: actor.id,
        kind: 'request_updated',
        title: 'Request Updated',
        body: completedText,
      });
      await client.query('COMMIT');
      return res.json({ success: true, system_message_id: sys.rows[0].id });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    if (tableMissing(err)) {
      return res.status(503).json({
        success: false,
        message: 'Site chat tables are not installed. Run scripts/create_site_chat_tables.sql',
      });
    }
    console.error('siteChat completeMaterialRequest:', err);
    return res.status(500).json({ success: false, message: 'Failed to complete request.' });
  }
}

async function updateMaterialRequestStatus(req, res) {
  const actor = getActor(req);
  if (!actor) return res.status(403).json({ success: false, message: 'Access denied.' });
  const messageId = parseInt(req.params.messageId, 10);
  const nextStatus = String(req.body.status || '').trim();
  if (!Number.isInteger(messageId) || messageId < 1) {
    return res.status(400).json({ success: false, message: 'Invalid message id.' });
  }
  if (!MATERIAL_REQUEST_STATUSES.includes(nextStatus)) {
    return res.status(400).json({ success: false, message: 'Invalid status.' });
  }
  try {
    const msg = await pool.query(
      `SELECT id, company_id, project_id, sender_kind, sender_id, request_status, message_type, repost_of_message_id
       FROM site_chat_message WHERE id = $1`,
      [messageId]
    );
    if (!msg.rows.length) return res.status(404).json({ success: false, message: 'Request not found.' });
    const row = msg.rows[0];
    if (row.message_type !== 'material_request') {
      return res.status(400).json({ success: false, message: 'Message is not a material request.' });
    }
    const projectIdHint = req.body.project_id != null ? req.body.project_id : row.project_id;
    const project = await resolveProjectForRequest(req, actor, projectIdHint);
    if (!project || Number(project.id) !== Number(row.project_id)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    const actorName = await resolveActorDisplayName(actor);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE site_chat_message
         SET request_status = $2,
             request_delivered_at = CASE WHEN $2 = 'Delivered' THEN NOW() ELSE NULL END
         WHERE id = $1`,
        [messageId, nextStatus]
      );
      await client.query('SAVEPOINT site_chat_req_sync');
      try {
        await syncOriginalMaterialRequestIfRepost(client, messageId, nextStatus);
        const link = await client.query(
          `SELECT repost_of_message_id FROM site_chat_message WHERE id = $1`,
          [messageId]
        );
        const ro = link.rows[0] && link.rows[0].repost_of_message_id;
        if (!ro) {
          await syncRepostsMaterialRequestsFromRoot(client, messageId, nextStatus);
        }
        await client.query('RELEASE SAVEPOINT site_chat_req_sync');
      } catch (syncErr) {
        await client.query('ROLLBACK TO SAVEPOINT site_chat_req_sync');
        if (!columnMissing(syncErr)) throw syncErr;
      }
      const text =
        'User "' +
        actorName +
        '" changed request #' +
        String(messageId) +
        ' status to "' +
        nextStatus +
        '" on ' +
        new Date().toLocaleString();
      const sys = await client.query(
        `INSERT INTO site_chat_message
         (company_id, project_id, sender_kind, sender_id, sender_name, message_type, body)
         VALUES ($1,$2,$3,$4,$5,'system',$6)
         RETURNING id`,
        [row.company_id, row.project_id, actor.kind, actor.id, actorName, text]
      );
      await notifyProjectRecipients(client, {
        companyId: row.company_id,
        projectId: row.project_id,
        messageId: sys.rows[0].id,
        actorKind: actor.kind,
        actorId: actor.id,
        kind: 'request_updated',
        title: 'Request Updated',
        body: text,
      });
      await client.query('COMMIT');
      return res.json({ success: true });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    if (tableMissing(err)) {
      return res.status(503).json({
        success: false,
        message: 'Site chat tables are not installed. Run scripts/create_site_chat_tables.sql',
      });
    }
    console.error('siteChat updateMaterialRequestStatus:', err);
    return res.status(500).json({ success: false, message: 'Failed to update status.' });
  }
}

async function uploadMaterialRequestPhoto(req, res) {
  const actor = getActor(req);
  if (!actor) return res.status(403).json({ success: false, message: 'Access denied.' });
  const messageId = parseInt(req.params.messageId, 10);
  if (!Number.isInteger(messageId) || messageId < 1) {
    return res.status(400).json({ success: false, message: 'Invalid message id.' });
  }
  if (!req.file || !req.body.file_url) {
    return res.status(400).json({ success: false, message: 'Image file is required.' });
  }
  if (!String(req.file.mimetype || '').startsWith('image/')) {
    return res.status(400).json({ success: false, message: 'Only image uploads are allowed.' });
  }
  try {
    const msg = await pool.query(
      `SELECT id, company_id, project_id, message_type
       FROM site_chat_message WHERE id = $1`,
      [messageId]
    );
    if (!msg.rows.length) return res.status(404).json({ success: false, message: 'Request not found.' });
    const row = msg.rows[0];
    if (row.message_type !== 'material_request') {
      return res.status(400).json({ success: false, message: 'Message is not a material request.' });
    }
    const project = await resolveProjectForRequest(req, actor, row.project_id);
    if (!project || Number(project.id) !== Number(row.project_id)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    const ins = await pool.query(
      `INSERT INTO site_chat_request_photo
       (company_id, project_id, message_id, file_url, uploaded_by_kind, uploaded_by_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, message_id, file_url, created_at, uploaded_by_kind, uploaded_by_id`,
      [row.company_id, row.project_id, messageId, String(req.body.file_url), actor.kind, actor.id]
    );
    return res.status(201).json({ success: true, photo: ins.rows[0] });
  } catch (err) {
    if (tableMissing(err)) {
      return res.status(503).json({
        success: false,
        message: 'Site chat tables are not installed. Run scripts/create_site_chat_tables.sql',
      });
    }
    console.error('siteChat uploadMaterialRequestPhoto:', err);
    return res.status(500).json({ success: false, message: 'Failed to upload photo.' });
  }
}

async function postMessage(req, res) {
  const actor = getActor(req);
  if (!actor) return res.status(403).json({ success: false, message: 'Access denied.' });
  const type = String(req.body.type || 'text').trim();
  const text = String(req.body.text || '').trim();
  const projectId = req.body.project_id || req.query.project_id;
  if (!['text', 'file', 'material_request', 'system'].includes(type)) {
    return res.status(400).json({ success: false, message: 'Invalid message type.' });
  }
  if (type === 'text' && !text) return res.status(400).json({ success: false, message: 'Message text is required.' });
  if (type === 'material_request' && !String(req.body.request_summary || '').trim()) {
    return res.status(400).json({ success: false, message: 'request_summary is required.' });
  }

  try {
    const project = await resolveProjectForRequest(req, actor, projectId);
    if (!project) return res.status(404).json({ success: false, message: 'No project room found.' });
    const actorName = await resolveActorDisplayName(actor);
    const fileName = req.file ? req.file.originalname : req.body.file_name || null;
    const fileUrl = req.body.file_url || null;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ins = await client.query(
        `INSERT INTO site_chat_message
         (company_id, project_id, sender_kind, sender_id, sender_name, message_type, body, file_name, file_url,
          request_status, request_summary, request_details, request_urgency, request_location)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id, created_at`,
        [
          actor.companyId,
          project.id,
          actor.kind,
          actor.id,
          actorName,
          type,
          text || null,
          fileName,
          fileUrl,
          type === 'material_request' ? normalizeMaterialRequestStatus(req.body.request_status) : null,
          type === 'material_request' ? String(req.body.request_summary || '').trim() : null,
          type === 'material_request' ? String(req.body.request_details || '').trim() : null,
          type === 'material_request' ? String(req.body.request_urgency || 'Normal') : null,
          type === 'material_request' ? String(req.body.request_location || '').trim() : null,
        ]
      );

      const msgId = ins.rows[0].id;
      if (type === 'material_request') {
        await client.query('SAVEPOINT site_chat_agent_insight');
        try {
          await insertChatAgentNewRequestInsight(client, {
            companyId: actor.companyId,
            projectId: project.id,
            newRequestId: msgId,
          });
          await client.query('RELEASE SAVEPOINT site_chat_agent_insight');
        } catch (agentErr) {
          await client.query('ROLLBACK TO SAVEPOINT site_chat_agent_insight');
          if (!columnMissing(agentErr)) throw agentErr;
        }
      }
      const notifKind =
        type === 'material_request' ? 'new_material_request' : type === 'system' ? 'system_message' : 'new_message';
      await notifyProjectRecipients(client, {
        companyId: actor.companyId,
        projectId: project.id,
        messageId: msgId,
        actorKind: actor.kind,
        actorId: actor.id,
        kind: notifKind,
        title: type === 'material_request' ? 'New Material Request' : 'New Message',
        body:
          type === 'material_request'
            ? String(req.body.request_summary || '').trim()
            : type === 'file'
              ? String(fileName || 'File shared')
              : text.slice(0, 200),
      });
      await client.query('COMMIT');
      return res.status(201).json({
        success: true,
        message: {
          id: msgId,
          type,
          text,
          file_name: fileName,
          file_url: fileUrl,
          status: type === 'material_request' ? normalizeMaterialRequestStatus(req.body.request_status) : null,
          summary: type === 'material_request' ? String(req.body.request_summary || '').trim() : null,
          details: type === 'material_request' ? String(req.body.request_details || '').trim() : null,
          urgency: type === 'material_request' ? String(req.body.request_urgency || 'Normal') : null,
          location: type === 'material_request' ? String(req.body.request_location || '').trim() : null,
          created_at: ins.rows[0].created_at,
          user_name: actorName,
          is_mine: true,
        },
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    if (tableMissing(err)) {
      return res.status(503).json({
        success: false,
        message: 'Site chat tables are not installed. Run scripts/create_site_chat_tables.sql',
      });
    }
    console.error('siteChat postMessage:', err);
    return res.status(500).json({ success: false, message: 'Failed to send message.' });
  }
}

async function listNotifications(req, res) {
  const actor = getActor(req);
  if (!actor) return res.status(403).json({ success: false, message: 'Access denied.' });
  try {
    const project = await resolveProjectForRequest(req, actor, req.query.project_id);
    if (!project) return res.status(404).json({ success: false, message: 'No project room found.' });
    const limit = Math.min(parseInt(req.query.limit, 10) || 80, 200);
    const r = await pool.query(
      `SELECT id, message_id, kind, title, body, read_at, created_at
       FROM site_chat_notification
       WHERE company_id = $1 AND project_id = $2 AND recipient_kind = $3 AND recipient_id = $4
       ORDER BY created_at DESC
       LIMIT $5`,
      [actor.companyId, project.id, actor.kind, actor.id, limit]
    );
    const notifications = r.rows.map((n) => ({ ...n, read: !!n.read_at }));
    return res.json({ success: true, notifications });
  } catch (err) {
    if (tableMissing(err)) {
      return res.status(503).json({
        success: false,
        message: 'Site chat tables are not installed. Run scripts/create_site_chat_tables.sql',
      });
    }
    console.error('siteChat listNotifications:', err);
    return res.status(500).json({ success: false, message: 'Failed to load notifications.' });
  }
}

async function markNotificationsRead(req, res) {
  const actor = getActor(req);
  if (!actor) return res.status(403).json({ success: false, message: 'Access denied.' });
  try {
    const project = await resolveProjectForRequest(req, actor, req.body.project_id || req.query.project_id);
    if (!project) return res.status(404).json({ success: false, message: 'No project room found.' });
    await pool.query(
      `UPDATE site_chat_notification
       SET read_at = NOW()
       WHERE company_id = $1 AND project_id = $2 AND recipient_kind = $3 AND recipient_id = $4 AND read_at IS NULL`,
      [actor.companyId, project.id, actor.kind, actor.id]
    );
    return res.json({ success: true });
  } catch (err) {
    if (tableMissing(err)) {
      return res.status(503).json({
        success: false,
        message: 'Site chat tables are not installed. Run scripts/create_site_chat_tables.sql',
      });
    }
    console.error('siteChat markNotificationsRead:', err);
    return res.status(500).json({ success: false, message: 'Failed to update notifications.' });
  }
}

module.exports = {
  getRoom,
  listMessages,
  postMessage,
  completeMaterialRequest,
  updateMaterialRequestStatus,
  uploadMaterialRequestPhoto,
  listNotifications,
  markNotificationsRead,
  runSiteChatAgentReminders,
};

