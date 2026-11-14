CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member'
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  location TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

INSERT OR IGNORE INTO users (id, email, password_hash, role) VALUES
  (1, 'member@club.test', '$2a$10$RjNmtiUh/Qksbfuw6CxrSed8A2jPzfpla3VDOn5OfkUv2umxbrVqW', 'member'),
  (2, 'organizer@club.test', '$2a$10$RjNmtiUh/Qksbfuw6CxrSed8A2jPzfpla3VDOn5OfkUv2umxbrVqW', 'organizer');

INSERT OR IGNORE INTO events (id, title, date, location, capacity, description) VALUES
  (1, 'Campus Jam', '2036-12-05', 'Fairground', 40, 'Student music night and sharing session.'),
  (2, 'Hack Night', '2036-12-12', 'Innovation Lab', 25, 'Build together and demo small projects.'),
  (3, 'Volunteer Fair', '2036-12-20', 'Student Center', 60, 'Meet clubs and sign up for activities.');
