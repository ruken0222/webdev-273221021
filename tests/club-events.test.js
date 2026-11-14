const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, resetDatabase } = require('../app');
const { db, getUserByEmail } = require('../db');
const { registerForEvent } = require('../services/registrationService');
const { generateEventSuggestion } = require('../services/eventSuggestion');

async function withFreshDb(fn) {
  resetDatabase();
  await fn();
}

test('AC-12 a visitor who opens the app root is sent to /login', async () => {
  await withFreshDb(async () => {
    const res = await request(app).get('/');
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/login');
  });
});

test('AC-6 visitor without session is redirected away from /events', async () => {
  await withFreshDb(async () => {
    const res = await request(app).get('/events');
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/login');
  });
});

test('AC-13 signed in member sees seeded upcoming events', async () => {
  await withFreshDb(async () => {
    const loginRes = await request(app)
      .post('/login')
      .type('form')
      .send({ email: 'member@club.test', password: 'password123' });

    assert.equal(loginRes.status, 302);
    assert.equal(loginRes.headers.location, '/events');

    const cookie = loginRes.headers['set-cookie'][0].split(';')[0];
    const eventsRes = await request(app).get('/events').set('Cookie', cookie);
    assert.equal(eventsRes.status, 200);
    assert.match(eventsRes.text, /Campus Jam/i);
    assert.match(eventsRes.text, /Hack Night/i);
  });
});

test('AC-7 future events come from the database', async () => {
  await withFreshDb(async () => {
    const loginRes = await request(app)
      .post('/login')
      .type('form')
      .send({ email: 'member@club.test', password: 'password123' });

    const cookie = loginRes.headers['set-cookie'][0].split(';')[0];
    const res = await request(app).get('/events').set('Cookie', cookie);

    assert.equal(res.status, 200);
    assert.match(res.text, /Campus Jam/);
    assert.match(res.text, /Fairground/);
  });
});

test('AC-2 a member who signs up for an event with no free places sees "This event is full", and no new row appears in registrations', async () => {
  await withFreshDb(async () => {
    const member = getUserByEmail('member@club.test');
    const waitingUser = db
      .prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)')
      .run('waiter@club.test', '$2a$10$RjNmtiUh/Qksbfuw6CxrSed8A2jPzfpla3VDOn5OfkUv2umxbrVqW', 'member');
    const userId = Number(waitingUser.lastInsertRowid);

    const generated = db
      .prepare('INSERT INTO events (title, date, location, capacity, description) VALUES (?, ?, ?, ?, ?)')
      .run('Waitlist Night', '2037-02-10', 'Room 204', 1, 'Full event');
    const eventId = Number(generated.lastInsertRowid);

    db.prepare('INSERT INTO registrations (event_id, user_id) VALUES (?, ?)').run(eventId, member.id);

    assert.throws(() => registerForEvent(userId, eventId), /This event is full/);
    const count = db.prepare('SELECT COUNT(*) AS count FROM registrations WHERE event_id = ?').get(eventId).count;
    assert.equal(Number(count), 1);
  });
});

test('AC-3 a member who is already registered for an event and presses sign up again gets a 409 response and still has exactly one row in registrations', async () => {
  await withFreshDb(async () => {
    const user = getUserByEmail('member@club.test');
    const generated = db
      .prepare('INSERT INTO events (title, date, location, capacity, description) VALUES (?, ?, ?, ?, ?)')
      .run('Double Book Night', '2037-02-20', 'Room 301', 2, 'Double booking test');
    const eventId = Number(generated.lastInsertRowid);

    db.prepare('INSERT INTO registrations (event_id, user_id) VALUES (?, ?)').run(eventId, user.id);

    const loginRes = await request(app)
      .post('/login')
      .type('form')
      .send({ email: 'member@club.test', password: 'password123' });

    const cookie = loginRes.headers['set-cookie'][0].split(';')[0];
    const res = await request(app).post(`/api/events/${eventId}/register`).set('Cookie', cookie);

    assert.equal(res.status, 409);
    assert.match(res.body.message, /already registered/i);

    const count = db.prepare('SELECT COUNT(*) AS count FROM registrations WHERE event_id = ?').get(eventId).count;
    assert.equal(Number(count), 1);
  });
});

test('AC-5 a signed-in member can cancel their own registration and the event capacity increases immediately by one', async () => {
  await withFreshDb(async () => {
    const user = getUserByEmail('member@club.test');
    const generated = db
      .prepare('INSERT INTO events (title, date, location, capacity, description) VALUES (?, ?, ?, ?, ?)')
      .run('Cancel Night', '2037-03-01', 'Room 114', 2, 'Cancellation test');
    const eventId = Number(generated.lastInsertRowid);

    db.prepare('INSERT INTO registrations (event_id, user_id) VALUES (?, ?)').run(eventId, user.id);

    const loginRes = await request(app)
      .post('/login')
      .type('form')
      .send({ email: 'member@club.test', password: 'password123' });

    const cookie = loginRes.headers['set-cookie'][0].split(';')[0];
    const res = await request(app).delete(`/api/events/${eventId}/register`).set('Cookie', cookie);

    assert.equal(res.status, 204);
    const count = db.prepare('SELECT COUNT(*) AS count FROM registrations WHERE event_id = ?').get(eventId).count;
    assert.equal(Number(count), 0);
  });
});

test('model feature uses a fake client instead of the real network', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-key';

  try {
    const fakeClient = async () => ({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'title: Sunset Mixer\ndate: 2037-04-20\nlocation: Green Room' }],
            },
          },
        ],
      }),
    });

    const result = await generateEventSuggestion({ description: 'Sunset mixer in the green room' }, fakeClient);
    assert.equal(result.title, 'Sunset Mixer');
    assert.equal(result.location, 'Green Room');

    const fallback = await generateEventSuggestion(
      { description: 'Try a club event' },
      async () => {
        throw new Error('rate-limited');
      },
    );

    assert.ok(fallback.title);
    assert.ok(fallback.date);
  } finally {
    if (previousKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previousKey;
    }
  }
});
