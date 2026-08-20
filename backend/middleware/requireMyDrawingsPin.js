/**
 * Unlock My Drawings with the 4-digit access or admin key (header or JSON body).
 */

const { resolveWorkspaceByPin } = require('../controllers/myDrawingsController');

function readPin(req) {
  const header = req.headers['x-mydrawings-pin'];
  if (header != null && String(header).trim()) return String(header).trim();
  if (req.body && req.body.pin != null) return String(req.body.pin).trim();
  return '';
}

async function requireMyDrawingsPin(req, res, next) {
  const pin = readPin(req);
  if (!/^\d{4}$/.test(pin)) {
    return res.status(401).json({ success: false, message: 'Incorrect access key' });
  }
  try {
    const resolved = await resolveWorkspaceByPin(pin);
    if (!resolved) {
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
