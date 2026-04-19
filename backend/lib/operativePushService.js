/**
 * Push notifications for operative mobile apps only (users table / FCM).
 * Managers are never registered here and never receive FCM through this module.
 */

'use strict';

const path = require('path');
const { pool } = require('../db/pool');

let messaging = null;
let firebaseInitAttempted = false;

function getMessaging() {
  if (firebaseInitAttempted) return messaging;
  firebaseInitAttempted = true;
  const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!saPath || !String(saPath).trim()) {
    return null;
  }
  try {
    const admin = require('firebase-admin');
    const resolved = path.isAbsolute(saPath) ? saPath : path.join(process.cwd(), saPath);
    const serviceAccount = require(resolved);
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    messaging = admin.messaging();
    return messaging;
  } catch (e) {
    console.warn('operativePushService: Firebase Admin not available — push disabled.', e.message || e);
    return null;
  }
}

function tableMissing(err) {
  return err && err.code === '42P01';
}

/**
 * Operatives on project (same scope as site chat notifications for users).
 */
async function getOperativeUserIdsOnProject(companyId, projectId) {
  try {
    const r = await pool.query(
      'SELECT id FROM users WHERE company_id = $1 AND project_id = $2',
      [companyId, projectId]
    );
    return (r.rows || []).map((x) => x.id);
  } catch (e) {
    if (e.code === '42703') return [];
    throw e;
  }
}

async function loadFcmTokensForUsers(userIds, prefColumn) {
  if (!userIds || !userIds.length) return [];
  const col = prefColumn === 'push_tasks' ? 'push_tasks' : 'push_chat';
  try {
    const r = await pool.query(
      `SELECT d.fcm_token
       FROM operative_push_devices d
       LEFT JOIN operative_notification_prefs p ON p.user_id = d.user_id
       WHERE d.user_id = ANY($1::int[])
         AND COALESCE(p.${col}, TRUE) = TRUE`,
      [userIds]
    );
    return (r.rows || []).map((x) => x.fcm_token).filter(Boolean);
  } catch (e) {
    if (tableMissing(e)) return [];
    throw e;
  }
}

async function sendFcm(tokens, title, body, data) {
  const msg = getMessaging();
  if (!msg || !tokens.length) {
    return { sent: 0, reason: msg ? 'no_tokens' : 'firebase_disabled' };
  }
  const dataStr = {};
  Object.entries(data || {}).forEach(([k, v]) => {
    if (v != null) dataStr[String(k)] = String(v);
  });
  const unique = [...new Set(tokens)];
  const chunks = [];
  for (let i = 0; i < unique.length; i += 500) {
    chunks.push(unique.slice(i, i + 500));
  }
  let sent = 0;
  for (const batch of chunks) {
    try {
      const res = await msg.sendEachForMulticast({
        tokens: batch,
        notification: { title: String(title || 'Proconix').slice(0, 200), body: String(body || '').slice(0, 500) },
        data: dataStr,
      });
      sent += res.successCount || 0;
    } catch (e) {
      console.error('operativePushService sendFcm batch:', e.message || e);
    }
  }
  return { sent };
}

/**
 * After a site chat message: push only to other operatives on the room (not managers).
 */
async function notifyOperativesSiteChatPush(payload) {
  const { companyId, projectId, actorKind, actorId, title, body, messageId } = payload;
  let userIds = await getOperativeUserIdsOnProject(companyId, projectId);
  if (actorKind === 'operative' && actorId != null) {
    userIds = userIds.filter((id) => Number(id) !== Number(actorId));
  }
  if (!userIds.length) return { sent: 0 };

  const tokens = await loadFcmTokensForUsers(userIds, 'push_chat');
  return sendFcm(tokens, title, body, {
    type: 'site_chat',
    message_id: messageId != null ? String(messageId) : '',
    project_id: String(projectId),
  });
}

/**
 * Resolve planning assignee names to user ids (operatives on project).
 */
async function resolveOperativeIdsFromNames(companyId, projectId, names) {
  if (!names || !names.length) return [];
  const r = await pool.query(
    `SELECT id, name FROM users
     WHERE company_id = $1 AND project_id = $2`,
    [companyId, projectId]
  );
  const byLower = new Map();
  (r.rows || []).forEach((row) => {
    const key = String(row.name || '')
      .trim()
      .toLowerCase();
    if (key) byLower.set(key, row.id);
  });
  const out = new Set();
  names.forEach((n) => {
    const k = String(n || '')
      .trim()
      .toLowerCase();
    if (k && byLower.has(k)) out.add(byLower.get(k));
  });
  return [...out];
}

/**
 * After planning plan-tasks upsert: notify assigned operatives (optional send_to_assignees).
 */
async function notifyOperativesNewPlanningTasksPush(payload) {
  const { companyId, planId, insertedTaskIds } = payload;
  if (!insertedTaskIds || !insertedTaskIds.length) return { sent: 0 };

  const pr = await pool.query('SELECT project_id FROM planning_plans WHERE id = $1 AND company_id = $2', [
    planId,
    companyId,
  ]);
  const projectId = pr.rows[0] && pr.rows[0].project_id != null ? pr.rows[0].project_id : null;
  if (projectId == null) return { sent: 0 };

  const tr = await pool.query(
    `SELECT id, title, assigned_to, send_to_assignees
     FROM planning_plan_tasks
     WHERE id = ANY($1::int[])`,
    [insertedTaskIds]
  );

  let totalSent = 0;
  for (const row of tr.rows || []) {
    if (row.send_to_assignees === false) continue;
    const names = Array.isArray(row.assigned_to) ? row.assigned_to : [];
    const userIds = await resolveOperativeIdsFromNames(companyId, projectId, names);
    if (!userIds.length) continue;
    const tokens = await loadFcmTokensForUsers(userIds, 'push_tasks');
    const title = 'New task';
    const body = String(row.title || 'You have a new planning task').slice(0, 200);
    const r = await sendFcm(tokens, title, body, {
      type: 'planning_task',
      task_id: String(row.id),
      plan_id: String(planId),
      project_id: String(projectId),
    });
    totalSent += r.sent || 0;
  }
  return { sent: totalSent };
}

module.exports = {
  notifyOperativesSiteChatPush,
  notifyOperativesNewPlanningTasksPush,
  getMessaging,
};
