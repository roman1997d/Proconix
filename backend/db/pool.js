/**
 * PostgreSQL connection pool for the backend.
 * Uses environment variables (PG* or DB_*) for configuration.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { Pool } = require('pg');

// SCRAM auth requires password to be a real string (never undefined/null).
var pgPassword = process.env.PGPASSWORD != null && process.env.PGPASSWORD !== ''
  ? String(process.env.PGPASSWORD)
  : process.env.DB_PASSWORD != null && process.env.DB_PASSWORD !== ''
    ? String(process.env.DB_PASSWORD)
    : '';

const pool = new Pool({
  host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.PGPORT || process.env.DB_PORT || '5432', 10),
  database: process.env.PGDATABASE || process.env.DB_NAME || 'ProconixDB',
  user: process.env.PGUSER || process.env.DB_USER || 'postgres',
  password: pgPassword,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

/**
 * Test database connectivity.
 * @returns {Promise<{ ok: boolean, message?: string, error?: string }>}
 */
async function testConnection() {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return { ok: true, message: 'Connection successful.' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { pool, testConnection };
