/**
 * Unlock My Drawings with a remembered device token or the admin 4-digit key.
 */

const { resolveWorkspaceByPin, resolveDeviceToken } = require('../controllers/myDrawingsController');

function readDevice(req) {
  const header = req.headers['x-mydrawings-device'];
  if (header != null && String(header).trim()) return String(header).trim();
  if (req.body && req.body.deviceToken != null) return String(req.body.deviceToken).trim();
  return '';
}

function readPin(req) {
  const header = req.headers['x-mydrawings-pin'];
  if (header != null && String(header).trim()) return String(header).trim();
  if (req.body && req.body.pin != null) return String(req.body.pin).trim();
  return '';
}

async function requireMyDrawingsPin(req, res, next) {
  try {
    const device = readDevice(req);
    if (device) {
      const resolved = await resolveDeviceToken(device);
      if (!resolved) {
        return res.status(401).json({ success: false, message: 'This device is no longer signed in.' });
      }
      req.myDrawings = resolved;
      return next();
    }
    const pin = readPin(req);
    if (!/^\d{4}$/.test(pin)) {
      return res.status(401).json({ success: false, message: 'Incorrect access key' });
    }
    const resolved = await resolveWorkspaceByPin(pin);
    if (!resolved || resolved.role !== 'admin') {
      return res.status(401).json({ success: false, message: 'Incorrect access key' });
    }
    req.myDrawings = resolved;
    return next();
  } catch (err) {
    console.error('requireMyDrawingsPin:', err);
    return res.status(500).json({ success: false, message: 'Access check failed.' });
  }
}

function requireMyDrawingsAdmin(req, res, next) {
  if (!req.myDrawings || req.myDrawings.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin key required to manage drawings.' });
  }
  return next();
}

module.exports = { requireMyDrawingsPin, requireMyDrawingsAdmin };
