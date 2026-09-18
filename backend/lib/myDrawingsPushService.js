/**
 * FCM for My Drawings workers (my_drawings_worker + user_devices).
 */

'use strict';

const { pool } = require('../db/pool');
const { sendFcm } = require('./firebaseMessaging');

function tableMissing(err) {
  return err && err.code === '42P01';
}

async function loadTokensForWorkspace(workspaceId) {
  try {
    const r = await pool.query(
      `SELECT DISTINCT d.fcm_token
       FROM user_devices d
       JOIN my_drawings_worker w ON w.id = d.user_id
       WHERE w.workspace_id = $1
         AND d.fcm_token IS NOT NULL`,
      [workspaceId]
    );
    return (r.rows || []).map((x) => x.fcm_token).filter(Boolean);
  } catch (e) {
    if (tableMissing(e)) return [];
    throw e;
  }
}

/**
 * Notify workers in the company after a drawing is uploaded or replaced.
 */
async function notifyDrawingChange(payload) {
  const workspaceId = Number(payload && payload.workspaceId);
  const projectId = payload && payload.projectId != null ? Number(payload.projectId) : null;
  if (!Number.isInteger(workspaceId) || workspaceId < 1) return { sent: 0 };
  const tokens = await loadTokensForWorkspace(workspaceId);
  if (!tokens.length) return { sent: 0, reason: 'no_tokens' };

  const action = payload.action === 'added' ? 'added' : 'updated';
  const number = String((payload && payload.number) || '').trim();
  const title = String((payload && payload.title) || 'Drawing').trim();
  const revision = String((payload && payload.revision) || '').trim();
  const notifTitle = action === 'added' ? 'New drawing' : 'Drawing updated';
  const notifBody = [number, title, revision ? `Rev ${revision}` : '']
    .filter(Boolean)
    .join(' — ')
    .slice(0, 200);

  return sendFcm(tokens, notifTitle, notifBody, {
    type: action === 'added' ? 'drawing_added' : 'drawing_updated',
    drawing_id: payload.drawingId != null ? String(payload.drawingId) : '',
    company_id: String(workspaceId),
    project_id: projectId != null ? String(projectId) : '',
    number,
    revision,
  });
}

module.exports = { notifyDrawingChange, loadTokensForWorkspace };
