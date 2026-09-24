/**
 * Unlock My Drawings with a remembered device token, company admin session, or the admin 4-digit key.
 */

const {
  resolveWorkspaceByPin,
  resolveDeviceToken,
  resolveAdminToken,
  resolveJwtAuth,
} = require('../controllers/myDrawingsController');
const { attachCurrentSite } = require('../lib/myDrawingsSiteScope');
const { readBearerToken } = require('../lib/myDrawingsJwt');
const { isHealthProbeDownload, healthProbeContext } = require('../lib/myDrawingsHealthProbe');

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
    if (isHealthProbeDownload(req)) {
      req.myDrawings = healthProbeContext();
      return next();
    }
    const bearer = readBearerToken(req);
    if (bearer) {
      const asJwt = await resolveJwtAuth(bearer);
      if (asJwt && asJwt.blocked) {
        return res.status(403).json({
          success: false,
          code: 'ACCESS_CLOSED',
          accessClosedUntil: asJwt.until,
          message: asJwt.message || 'Access to My Drawings is closed.',
        });
      }
      if (asJwt) {
        req.myDrawings = await attachCurrentSite(req, asJwt);
        return next();
      }
      return res.status(401).json({ success: false, message: 'Session expired. Request a new access key.' });
    }
    const adminToken = readAdminToken(req);
    if (adminToken) {
      const asAdmin = await resolveAdminToken(adminToken);
      if (asAdmin) {
        req.myDrawings = await attachCurrentSite(req, asAdmin);
        return next();
      }
    }
    const pin = readPin(req);
    if (/^\d{4}$/.test(pin)) {
      const email = req.headers['x-mydrawings-email'] || (req.body && req.body.email) || '';
      const byPin = await resolveWorkspaceByPin(pin, email);
      if (byPin && byPin.role === 'admin') {
        req.myDrawings = await attachCurrentSite(req, byPin);
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
      if (resolved && resolved.blocked) {
        return res.status(403).json({
          success: false,
          code: 'ACCESS_CLOSED',
          accessClosedUntil: resolved.until,
          message: resolved.message || 'Access to My Drawings is closed.',
        });
      }
      if (!resolved) {
        return res.status(401).json({ success: false, message: 'This device is no longer signed in.' });
      }
      req.myDrawings = await attachCurrentSite(req, resolved);
      return next();
    }
    return res.status(401).json({ success: false, message: 'Incorrect access key' });
  } catch (err) {
    console.error('requireMyDrawingsPin:', err);
    return res.status(500).json({ success: false, message: 'Access check failed.' });
  }
}

function requireMyDrawingsAdmin(req, res, next) {
  const role = req.myDrawings && req.myDrawings.role;
  if (role !== 'admin' && role !== 'site_manager') {
    return res.status(403).json({ success: false, message: 'Site manager or company access is required to manage this site.' });
  }
  return next();
}

function requireMyDrawingsCompanyAdmin(req, res, next) {
  if (!req.myDrawings || req.myDrawings.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Only the company head can do this.' });
  }
  return next();
}

module.exports = { requireMyDrawingsPin, requireMyDrawingsAdmin, requireMyDrawingsCompanyAdmin };
