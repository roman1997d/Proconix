/**
 * Tenant-scoped JWT for the My Drawings native app.
 * Payload always includes companyId + projectId; API queries never trust client ids.
 */

'use strict';

const jwt = require('jsonwebtoken');

const TOKEN_TYP = 'mydrawings';
const DEFAULT_EXPIRES = '30d';

function jwtSecret() {
  const secret = String(process.env.MY_DRAWINGS_JWT_SECRET || process.env.JWT_SECRET || 'R7mK2pQ9xL').trim();
  return secret || 'R7mK2pQ9xL';
}

function jwtExpires() {
  return String(process.env.MY_DRAWINGS_JWT_EXPIRES || DEFAULT_EXPIRES).trim() || DEFAULT_EXPIRES;
}

function signMyDrawingsJwt({ workerId, companyId, projectId, email, role }) {
  const secret = jwtSecret();
  if (!secret) {
    const err = new Error('MY_DRAWINGS_JWT_SECRET is not configured.');
    err.code = 'JWT_NOT_CONFIGURED';
    throw err;
  }
  const wid = Number(workerId);
  const cid = Number(companyId);
  const pid = Number(projectId);
  if (!Number.isInteger(wid) || wid < 1 || !Number.isInteger(cid) || cid < 1 || !Number.isInteger(pid) || pid < 1) {
    const err = new Error('Invalid JWT subject.');
    err.code = 'JWT_INVALID_SUBJECT';
    throw err;
  }
  return jwt.sign(
    {
      typ: TOKEN_TYP,
      role: role || 'worker',
      workerId: wid,
      companyId: cid,
      projectId: pid,
      email: email ? String(email).toLowerCase() : '',
    },
    secret,
    {
      algorithm: 'HS256',
      subject: String(wid),
      expiresIn: jwtExpires(),
    }
  );
}

function verifyMyDrawingsJwt(token) {
  const secret = jwtSecret();
  const raw = String(token || '').trim();
  if (!secret || !raw) return null;
  try {
    const payload = jwt.verify(raw, secret, { algorithms: ['HS256'] });
    if (!payload || payload.typ !== TOKEN_TYP) return null;
    const workerId = Number(payload.workerId || payload.sub);
    const companyId = Number(payload.companyId);
    const projectId = Number(payload.projectId);
    if (!Number.isInteger(workerId) || workerId < 1) return null;
    if (!Number.isInteger(companyId) || companyId < 1) return null;
    if (!Number.isInteger(projectId) || projectId < 1) return null;
    return {
      workerId,
      companyId,
      projectId,
      email: payload.email || '',
      role: payload.role === 'admin' ? 'admin' : 'worker',
    };
  } catch (_) {
    return null;
  }
}

function readBearerToken(req) {
  const header = req.headers && req.headers.authorization;
  if (!header) return '';
  const match = /^Bearer\s+(.+)$/i.exec(String(header));
  return match ? match[1].trim() : '';
}

module.exports = {
  signMyDrawingsJwt,
  verifyMyDrawingsJwt,
  readBearerToken,
  jwtSecret,
};
