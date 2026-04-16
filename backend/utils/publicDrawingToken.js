const crypto = require('crypto');

const SECRET = process.env.PUBLIC_DRAWING_SHARE_SECRET || process.env.ONBOARDING_SECRET || process.env.DB_NAME || 'proconix-public-drawing-secret';
const EXPIRY_HOURS = parseInt(process.env.PUBLIC_DRAWING_SHARE_EXP_HOURS || '168', 10); // 7 days default

function base64urlEncode(str) {
  return Buffer.from(str, 'utf8').toString('base64url');
}

function base64urlDecode(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}

function createPublicDrawingToken(versionId) {
  const exp = Date.now() + EXPIRY_HOURS * 60 * 60 * 1000;
  const payload = base64urlEncode(JSON.stringify({ version_id: versionId, exp }));
  const signature = sign(payload);
  return payload + '.' + signature;
}

function verifyPublicDrawingToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const payloadB64 = parts[0];
  const sig = parts[1];
  if (sign(payloadB64) !== sig) return null;
  try {
    const payload = JSON.parse(base64urlDecode(payloadB64));
    if (!payload || typeof payload.version_id !== 'number') return null;
    if (payload.exp && Date.now() > payload.exp) return null;
    return { version_id: payload.version_id, exp: payload.exp || null };
  } catch (_) {
    return null;
  }
}

module.exports = {
  createPublicDrawingToken,
  verifyPublicDrawingToken,
};

