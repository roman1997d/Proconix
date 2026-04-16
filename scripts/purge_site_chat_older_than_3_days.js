#!/usr/bin/env node
/**
 * Deletes site_chat_message rows older than 3 days (material requests, text, files, system).
 * Cascades to request photos and notifications linked by message_id.
 *
 * Run from project root:
 *   npm run purge:site-chat
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { pool } = require('../backend/db/pool');

async function main() {
  const client = await pool.connect();
  try {
    const r = await client.query(
      `DELETE FROM site_chat_message
       WHERE created_at < NOW() - INTERVAL '3 days'`
    );
    console.log(`purge_site_chat: deleted ${r.rowCount} message(s) older than 3 days.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
