const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'club-events.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

function applySchema() {
  const migrationSql = fs.readFileSync(
    path.join(__dirname, 'db', 'migrations', '001_initial_schema.sql'),
    'utf8',
  );
  db.exec(migrationSql);
}

function resetDatabase() {
  db.exec(`
    DROP TABLE IF EXISTS events;
    DROP TABLE IF EXISTS users;
  `);
  applySchema();
}

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function listFutureEvents() {
  return db
    .prepare(`
      SELECT id, title, date, location, capacity
      FROM events
      WHERE date >= date('now')
      ORDER BY date ASC
    `)
    .all();
}

applySchema();

module.exports = {
  db,
  resetDatabase,
  getUserByEmail,
  getUserById,
  listFutureEvents,
};
