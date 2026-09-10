/**
 * Initializes the database by running database/schema.sql against DATABASE_URL.
 * Usage: npm run db:init
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { pool } = require('./database');

async function init() {
  const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  console.log('Running schema.sql against database...');
  try {
    await pool.query(sql);
    console.log('Database schema created successfully.');
  } catch (err) {
    console.error('Failed to initialize database:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

init();
