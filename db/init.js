const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function initDatabase() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: process.env.DB_PORT || 3306,
    multipleStatements: true
  });

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await connection.query(schema);

  // Migrations: add columns if they don't exist
  const migrations = [
    `ALTER TABLE entrance_exam.ent_responses ADD COLUMN IF NOT EXISTS answer_text TEXT AFTER selected_option`
  ];
  for (const sql of migrations) {
    try { await connection.query(sql); } catch (e) { /* column may already exist */ }
  }

  console.log('Database initialized successfully');
  await connection.end();
}

initDatabase().catch(err => {
  console.error('Database initialization failed:', err.message);
  process.exit(1);
});
