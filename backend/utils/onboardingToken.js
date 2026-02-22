/**
 * Signed onboarding token: links browser to company_id for register_manager step.
 * Token format: base64url(payload).signature (payload = { company_id, exp }).
 */

const crypto = require('crypto');

const SECRET = process.env.ONBOARDING_SECRET || process.env.DB_NAME || 'proconix-onboarding-secret';
const EXPIRY_HOURS = 24;

function base64urlEncode(str) {
  return Buffer.from(str, 'utf8').toString('base64url');
}

function base64urlDecode(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}

/**
 * Create a signed onboarding token for the given company_id.
 * @param {number} companyId
 * @returns {string} token
 */
function createToken(companyId) {
  const exp = Date.now() + EXPIRY_HOURS * 60 * 60 * 1000;
  const payload = base64urlEncode(JSON.stringify({ company_id: companyId, exp }));
  const signature = sign(payload);
  return payload + '.' + signature;
}

/**
 * Verify token and return company_id, or null if invalid/expired.
 * @param {string} token
 * @returns {{ company_id: number } | null}
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  if (sign(payloadB64) !== sig) return null;
  try {
    const payload = JSON.parse(base64urlDecode(payloadB64));
    if (payload.exp && Date.now() > payload.exp) return null;
    if (typeof payload.company_id !== 'number') return null;
    return { company_id: payload.company_id };
  } catch (_) {
    return null;
  }
}

module.exports = { createToken, verifyToken };
