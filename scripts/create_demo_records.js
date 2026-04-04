#!/usr/bin/env node
/**
 * Create a full demo tenant from the command line (same data as Admin "Create Demo Records").
 *
 * Usage:
 *   node scripts/create_demo_records.js --company "Acme Ltd" --manager "Jane Smith" --email "jane@acme.com" --password "secret123"
 *
 * Options:
 *   --company, -c    Company name (required)
 *   --manager, -m    Head manager full name (required)
 *   --email, -e      Head manager email (required)
 *   --password, -p   Head manager password, min 8 chars (required)
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { pool } = require('../backend/db/pool');
const { runCreateDemoRecords } = require('../backend/lib/createDemoRecords');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--company' || a === '-c') {
      out.company = argv[++i];
    } else if (a === '--manager' || a === '-m') {
      out.manager = argv[++i];
    } else if (a === '--email' || a === '-e') {
      out.email = argv[++i];
    } else if (a === '--password' || a === '-p') {
      out.password = argv[++i];
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(
      'Usage: node scripts/create_demo_records.js --company "Name" --manager "Full Name" --email "a@b.com" --password "min8chars"'
    );
    process.exit(0);
  }
  const companyName = (args.company && String(args.company).trim()) || '';
  const headManagerName = (args.manager && String(args.manager).trim()) || '';
  const email = (args.email && String(args.email).trim()) || '';
  const password = (args.password && String(args.password)) || '';

  if (!companyName || !headManagerName || !email || !password) {
    console.error('Missing required flags. Example:');
    console.error(
      '  node scripts/create_demo_records.js --company "Acme Ltd" --manager "Jane Smith" --email "jane@acme.com" --password "yourpass12"'
    );
    process.exitCode = 1;
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await runCreateDemoRecords(client, {
      companyName,
      headManagerName,
      email,
      password,
    });
    await client.query('COMMIT');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err.message || err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
