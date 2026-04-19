/**
 * Operative-only push API: device registration and preferences.
 * Managers do not use these routes — tokens are stored per users.id (operatives).
 */

'use strict';

const { pool } = require('../db/pool');

function getOperative(req) {
  return req.operative || null;
}

function tableMissing(err) {
  return err && err.code === '42P01';
}

/**
 * POST /api/operatives/push/register
 * Body: { token: string, platform: 'ios' | 'android' }
 */
async function registerPushDevice(req, res) {
  const op = getOperative(req);
  if (!op) return res.status(401).json({ success: false, message: 'Unauthorized.' });

  const body = req.body || {};
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const platform = String(body.platform || '').toLowerCase();
  if (!token || token.length < 20) {
    return res.status(400).json({ success: false, message: 'Valid FCM token is required.' });
  }
  if (!['ios', 'android'].includes(platform)) {
    return res.status(400).json({ success: false, message: 'platform must be ios or android.' });
  }

  try {
    await pool.query(
      `INSERT INTO operative_push_devices (user_id, platform, fcm_token, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, fcm_token)
       DO UPDATE SET platform = EXCLUDED.platform, updated_at = NOW()`,
      [op.id, platform, token.slice(0, 512)]
    );
    return res.status(200).json({ success: true, message: 'Device registered.' });
  } catch (err) {
    if (tableMissing(err)) {
      return res.status(503).json({
        success: false,
        message: 'Push tables not installed. Run scripts/create_operative_push_tables.sql',
      });
    }
    console.error('registerPushDevice:', err);
    return res.status(500).json({ success: false, message: 'Failed to register device.' });
  }
}

/**
 * DELETE /api/operatives/push/register
 * Body: { token: string }
 */
async function unregisterPushDevice(req, res) {
  const op = getOperative(req);
  if (!op) return res.status(401).json({ success: false, message: 'Unauthorized.' });

  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!token) {
    return res.status(400).json({ success: false, message: 'token is required.' });
  }

  try {
    const r = await pool.query(
      'DELETE FROM operative_push_devices WHERE user_id = $1 AND fcm_token = $2',
      [op.id, token.slice(0, 512)]
    );
    return res.status(200).json({ success: true, removed: r.rowCount || 0 });
  } catch (err) {
    if (tableMissing(err)) {
      return res.status(503).json({
        success: false,
        message: 'Push tables not installed. Run scripts/create_operative_push_tables.sql',
      });
    }
    console.error('unregisterPushDevice:', err);
    return res.status(500).json({ success: false, message: 'Failed to unregister.' });
  }
}

/**
 * GET /api/operatives/push/preferences
 */
async function getPushPreferences(req, res) {
  const op = getOperative(req);
  if (!op) return res.status(401).json({ success: false, message: 'Unauthorized.' });

  try {
    const r = await pool.query(
      'SELECT push_chat, push_tasks FROM operative_notification_prefs WHERE user_id = $1',
      [op.id]
    );
    const row = r.rows[0];
    return res.status(200).json({
      success: true,
      preferences: {
        push_chat: row ? row.push_chat !== false : true,
        push_tasks: row ? row.push_tasks !== false : true,
      },
    });
  } catch (err) {
    if (tableMissing(err)) {
      return res.status(200).json({
        success: true,
        preferences: { push_chat: true, push_tasks: true },
      });
    }
    console.error('getPushPreferences:', err);
    return res.status(500).json({ success: false, message: 'Failed to load preferences.' });
  }
}

/**
 * PATCH /api/operatives/push/preferences
 * Body: { push_chat?: boolean, push_tasks?: boolean }
 */
async function updatePushPreferences(req, res) {
  const op = getOperative(req);
  if (!op) return res.status(401).json({ success: false, message: 'Unauthorized.' });

  const b = req.body || {};
  const hasChat = Object.prototype.hasOwnProperty.call(b, 'push_chat');
  const hasTasks = Object.prototype.hasOwnProperty.call(b, 'push_tasks');
  if (!hasChat && !hasTasks) {
    return res.status(400).json({ success: false, message: 'push_chat and/or push_tasks required.' });
  }

  try {
    const cur = await pool.query(
      'SELECT push_chat, push_tasks FROM operative_notification_prefs WHERE user_id = $1',
      [op.id]
    );
    let pushChat = cur.rows[0] ? cur.rows[0].push_chat !== false : true;
    let pushTasks = cur.rows[0] ? cur.rows[0].push_tasks !== false : true;
    if (hasChat) pushChat = !!b.push_chat;
    if (hasTasks) pushTasks = !!b.push_tasks;

    await pool.query(
      `INSERT INTO operative_notification_prefs (user_id, push_chat, push_tasks, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         push_chat = EXCLUDED.push_chat,
         push_tasks = EXCLUDED.push_tasks,
         updated_at = NOW()`,
      [op.id, pushChat, pushTasks]
    );
    return res.status(200).json({
      success: true,
      preferences: { push_chat: pushChat, push_tasks: pushTasks },
    });
  } catch (err) {
    if (tableMissing(err)) {
      return res.status(503).json({
        success: false,
        message: 'Push tables not installed. Run scripts/create_operative_push_tables.sql',
      });
    }
    console.error('updatePushPreferences:', err);
    return res.status(500).json({ success: false, message: 'Failed to save preferences.' });
  }
}

module.exports = {
  registerPushDevice,
  unregisterPushDevice,
  getPushPreferences,
  updatePushPreferences,
};
