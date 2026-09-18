/**
 * Shared Firebase Admin messaging client.
 * Used by operative push and My Drawings worker push.
 */

'use strict';

const path = require('path');

let messaging = null;
let firebaseInitAttempted = false;

function getMessaging() {
  if (firebaseInitAttempted) return messaging;
  firebaseInitAttempted = true;
  const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!saPath || !String(saPath).trim()) {
    return null;
  }
  try {
    const admin = require('firebase-admin');
    const resolved = path.isAbsolute(saPath) ? saPath : path.join(process.cwd(), saPath);
    const serviceAccount = require(resolved);
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    messaging = admin.messaging();
    return messaging;
  } catch (e) {
    console.warn('Firebase Admin not available — push disabled.', e.message || e);
    return null;
  }
}

async function sendFcm(tokens, title, body, data) {
  const msg = getMessaging();
  if (!msg || !tokens.length) {
    return { sent: 0, reason: msg ? 'no_tokens' : 'firebase_disabled' };
  }
  const dataStr = {};
  Object.entries(data || {}).forEach(([k, v]) => {
    if (v != null) dataStr[String(k)] = String(v);
  });
  const unique = [...new Set(tokens)];
  const chunks = [];
  for (let i = 0; i < unique.length; i += 500) {
    chunks.push(unique.slice(i, i + 500));
  }
  let sent = 0;
  for (const batch of chunks) {
    try {
      const res = await msg.sendEachForMulticast({
        tokens: batch,
        notification: {
          title: String(title || 'My Drawings').slice(0, 200),
          body: String(body || '').slice(0, 500),
        },
        data: dataStr,
      });
      sent += res.successCount || 0;
    } catch (e) {
      console.error('sendFcm batch:', e.message || e);
    }
  }
  return { sent };
}

module.exports = { getMessaging, sendFcm };
