const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'club-events.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

function applySchema() {
  const migrationFiles = ['001_initial_schema.sql', '002_event_registrations.sql'];

  for (const fileName of migrationFiles) {
    const migrationSql = fs.readFileSync(
      path.join(__dirname, 'db', 'migrations', fileName),
      'utf8',
    );
    db.exec(migrationSql);
  }
}

function resetDatabase() {
  db.exec(`
    DROP TABLE IF EXISTS registrations;
    DROP TABLE IF EXISTS events;
    DROP TABLE IF EXISTS users;
  `);
  applySchema();
}

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').trim().toLowerCase());
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function getEventById(id) {
  const event = db
    .prepare(`
      SELECT e.*, COALESCE(COUNT(r.id), 0) AS registered_count
      FROM events e
      LEFT JOIN registrations r ON r.event_id = e.id
      WHERE e.id = ?
      GROUP BY e.id
    `)
    .get(id);

  if (!event) {
    return null;
  }

  return {
    ...event,
    registered_count: Number(event.registered_count),
    remaining_capacity: Math.max(0, Number(event.capacity) - Number(event.registered_count)),
  };
}

function listFutureEvents() {
  return db
    .prepare(`
      SELECT e.id, e.title, e.date, e.location, e.capacity, COALESCE(COUNT(r.id), 0) AS registered_count
      FROM events e
      LEFT JOIN registrations r ON r.event_id = e.id
      WHERE e.date >= date('now')
      GROUP BY e.id, e.title, e.date, e.location, e.capacity
      ORDER BY e.date ASC
    `)
    .all()
    .map((event) => ({
      ...event,
      registered_count: Number(event.registered_count),
      remaining_capacity: Math.max(0, Number(event.capacity) - Number(event.registered_count)),
    }));
}

function getRegistrationForUser(userId, eventId) {
  return db
    .prepare('SELECT * FROM registrations WHERE user_id = ? AND event_id = ?')
    .get(userId, eventId);
}

function getUserRegistrations(userId) {
  return db
    .prepare(`
      SELECT r.id, r.event_id, e.title, e.date, e.location
      FROM registrations r
      INNER JOIN events e ON e.id = r.event_id
      WHERE r.user_id = ?
      ORDER BY e.date ASC
    `)
    .all(userId);
}

applySchema();

module.exports = {
  db,
  getEventById,
  getRegistrationForUser,
  getUserByEmail,
  getUserById,
  getUserRegistrations,
  listFutureEvents,
  resetDatabase,
};
