#!/usr/bin/env node
/**
 * DANGEROUS: Irreversibly wipes application data.
 *
 * What it does:
 * 1) Truncates ALL public schema tables with RESTART IDENTITY CASCADE.
 * 2) Deletes all files from runtime storage folders (uploads/output).
 *
 * Usage:
 *   node scripts/reset_all_data_fresh.js --confirm-reset
 */

const fs = require('fs/promises');
const path = require('path');
const { pool } = require('../backend/db/pool');

const ROOT_DIR = path.resolve(__dirname, '..');
const STORAGE_DIRS = [
  path.join(ROOT_DIR, 'backend', 'uploads'),
  path.join(ROOT_DIR, 'output'),
];

function hasConfirmationFlag() {
  return process.argv.includes('--confirm-reset');
}

function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

async function wipeDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tablesResult = await client.query(
      `SELECT tablename
       FROM pg_tables
       WHERE schemaname = 'public'
       ORDER BY tablename ASC`
    );
    const tables = (tablesResult.rows || []).map((row) => row.tablename).filter(Boolean);
    if (tables.length) {
      const tableList = tables.map((t) => quoteIdent(t)).join(', ');
      await client.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
    }
    await client.query('COMMIT');
    return tables.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function emptyDirectorySafe(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      await fs.rm(fullPath, { recursive: true, force: true });
    }
    return { dirPath, existed: true };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { dirPath, existed: false };
    }
    throw error;
  }
}

async function wipeStorage() {
  const results = [];
  for (const dirPath of STORAGE_DIRS) {
    // eslint-disable-next-line no-await-in-loop
    const result = await emptyDirectorySafe(dirPath);
    results.push(result);
  }
  return results;
}

async function main() {
  if (!hasConfirmationFlag()) {
    console.error('Refusing to run without explicit confirmation.');
    console.error('Run again with: node scripts/reset_all_data_fresh.js --confirm-reset');
    process.exitCode = 1;
    return;
  }

  console.log('Starting full reset...');
  const tableCount = await wipeDatabase();
  const storageResults = await wipeStorage();
  await pool.end();

  console.log(`Database reset complete. Truncated tables: ${tableCount}.`);
  storageResults.forEach((r) => {
    console.log(`${r.existed ? 'Cleared' : 'Skipped (missing)'}: ${r.dirPath}`);
  });
  console.log('Reset finished. IDs will restart from initial sequence values (typically 1).');
}

main().catch(async (error) => {
  console.error('Reset failed:', error.message);
  try { await pool.end(); } catch (_) {}
  process.exitCode = 1;
});
