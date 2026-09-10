const { Pool } = require('pg');
require('dotenv').config();

const useSsl = process.env.DATABASE_SSL === 'true';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Unexpected error on idle Postgres client', err);
});

/**
 * Run a parameterized query.
 * @param {string} text
 * @param {Array} params
 */
async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log('query', { text, duration, rows: result.rowCount });
  }
  return result;
}

/**
 * Get a client for transactions. Caller must release it.
 */
async function getClient() {
  const client = await pool.connect();
  return client;
}

module.exports = { query, getClient, pool };
