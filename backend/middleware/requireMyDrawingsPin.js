/**
 * Unlock My Drawings with a remembered device token, company admin session, or the admin 4-digit key.
 */

const {
  resolveWorkspaceByPin,
  resolveDeviceToken,
  resolveAdminToken,
  resolveJwtAuth,
} = require('../controllers/myDrawingsController');
const { readBearerToken } = require('../lib/myDrawingsJwt');

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

function readAdminToken(req) {
  const header = req.headers['x-mydrawings-admin'];
  if (header != null && String(header).trim()) return String(header).trim();
  if (req.body && req.body.adminToken != null) return String(req.body.adminToken).trim();
  return '';
}

async function requireMyDrawingsPin(req, res, next) {
  try {
    const bearer = readBearerToken(req);
    if (bearer) {
      const asJwt = await resolveJwtAuth(bearer);
      if (asJwt) {
        req.myDrawings = asJwt;
        return next();
      }
      return res.status(401).json({ success: false, message: 'Session expired. Request a new access key.' });
    }
    const adminToken = readAdminToken(req);
    if (adminToken) {
      const asAdmin = await resolveAdminToken(adminToken);
      if (asAdmin) {
        req.myDrawings = asAdmin;
        return next();
      }
    }
    const pin = readPin(req);
    if (/^\d{4}$/.test(pin)) {
      const byPin = await resolveWorkspaceByPin(pin);
      if (byPin && byPin.role === 'admin') {
        req.myDrawings = byPin;
        const device = readDevice(req);
        if (device) {
          try {
            const asWorker = await resolveDeviceToken(device);
            if (asWorker && asWorker.worker) req.myDrawings.worker = asWorker.worker;
          } catch (_) {}
        }
        return next();
      }
    }
    const device = readDevice(req);
    if (device) {
      const resolved = await resolveDeviceToken(device);
      if (!resolved) {
        return res.status(401).json({ success: false, message: 'This device is no longer signed in.' });
      }
      req.myDrawings = resolved;
      return next();
    }
    return res.status(401).json({ success: false, message: 'Incorrect access key' });
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
