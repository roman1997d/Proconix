#!/usr/bin/env node
/**
 * Proconix — Demo tenant: Delta Construction (fixed credentials).
 * Delegates to backend/lib/createDemoRecords.js; removes any previous "Delta Construction" row first.
 *
 * Run from project root:
 *   node scripts/seed_demo_delta.js
 *
 * Manager: info@proconix.uk / 12345678
 * Primary operative email is printed at end (demo.op.*@domain).
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { pool } = require('../backend/db/pool');
const { runCreateDemoRecords, wipeDemoCompany } = require('../backend/lib/createDemoRecords');

const DEMO_COMPANY_NAME = 'Delta Construction';
const PASSWORD_PLAIN = '12345678';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(`SELECT id FROM companies WHERE name = $1`, [DEMO_COMPANY_NAME]);
    if (existing.rows.length > 0) {
      await wipeDemoCompany(client, existing.rows[0].id);
    }

    const result = await runCreateDemoRecords(client, {
      companyName: DEMO_COMPANY_NAME,
      headManagerName: 'Derek Stone',
      email: 'info@proconix.uk',
      password: PASSWORD_PLAIN,
    });

    await client.query('COMMIT');

    console.log('');
    console.log('=== Proconix demo seed complete ===');
    console.log('Company:', result.company_name, '(id ' + result.company_id + ')');
    console.log('');
    console.log('Manager login (dashboard):');
    console.log('  Email:    info@proconix.uk');
    console.log('  Password: ' + PASSWORD_PLAIN);
    console.log('');
    console.log('Primary operative login:');
    console.log('  Email:    ' + result.primary_operative_email);
    console.log('  Password: ' + PASSWORD_PLAIN);
    console.log('');
    console.log('10 extra operatives (random email & password):');
    (result.extra_operatives || []).forEach(function (row, idx) {
      console.log(
        '  ' +
          String(idx + 1).padStart(2, ' ') +
          '. ' +
          String(row.name).padEnd(22, ' ') +
          ' | ' +
          String(row.email).padEnd(34, ' ') +
          ' | ' +
          row.password +
          ' | ' +
          row.role
      );
    });
    console.log('');
    console.log('Projects:', (result.project_names || []).join(', '), '— ids', (result.project_ids || []).join(', '));
    console.log(result.message || '');
    console.log('');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
    console.error(err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
