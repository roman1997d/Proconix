/**
 * PostgreSQL connection pool for the backend.
 * Uses environment variables (PG* or DB_*) for configuration.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.PGPORT || process.env.DB_PORT || '5432', 10),
  database: process.env.PGDATABASE || process.env.DB_NAME || 'ProconixDB',
  user: process.env.PGUSER || process.env.DB_USER || 'postgres',
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD || '',
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
    return { ok: true, message: 'Conexiune reușită.' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { pool, testConnection };
