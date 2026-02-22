/**
 * In-memory session store for operatives (after set-password login).
 * Token -> { userId, companyId, email, createdAt }
 */

const crypto = require('crypto');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const sessions = new Map();

function createSession(userId, companyId, email) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    userId,
    companyId,
    email: email || null,
    createdAt: Date.now(),
  });
  return token;
}

function getSession(token) {
  if (!token || typeof token !== 'string') return null;
  const data = sessions.get(token.trim());
  if (!data) return null;
  if (Date.now() - data.createdAt > SESSION_TTL_MS) {
    sessions.delete(token.trim());
    return null;
  }
  return data;
}

function deleteSession(token) {
  if (token) sessions.delete(token.trim());
}

setInterval(() => {
  const now = Date.now();
  for (const [t, data] of sessions.entries()) {
    if (now - data.createdAt > SESSION_TTL_MS) sessions.delete(t);
  }
}, 60 * 60 * 1000);

module.exports = {
  createSession,
  getSession,
  deleteSession,
};
