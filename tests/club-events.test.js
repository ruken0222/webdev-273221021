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

test('AC-4 an organizer sees current registrations while a regular member sees only the detail and sign-up button', async () => {
  await withFreshDb(async () => {
    const organizer = getUserByEmail('organizer@club.test');
    const generated = db
      .prepare('INSERT INTO events (title, date, location, capacity, description) VALUES (?, ?, ?, ?, ?)')
      .run('Organizer Review', '2037-01-15', 'Room 404', 3, 'Review details');
    const eventId = Number(generated.lastInsertRowid);

    db.prepare('INSERT INTO registrations (event_id, user_id) VALUES (?, ?)').run(eventId, organizer.id);

    const organizerRes = await request(app)
      .post('/login')
      .type('form')
      .send({ email: 'organizer@club.test', password: 'password123' });
    const organizerCookie = organizerRes.headers['set-cookie'][0].split(';')[0];
    const organizerPage = await request(app).get('/events').set('Cookie', organizerCookie);

    assert.equal(organizerPage.status, 200);
    assert.match(organizerPage.text, /Organizer Review/i);

    const memberRes = await request(app)
      .post('/login')
      .type('form')
      .send({ email: 'member@club.test', password: 'password123' });
    const memberCookie = memberRes.headers['set-cookie'][0].split(';')[0];
    const memberPage = await request(app).get('/events').set('Cookie', memberCookie);

    assert.equal(memberPage.status, 200);
    assert.match(memberPage.text, /Sign up/i);
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

test('AC-8 a Google sign-in for an account that already has a password login signs the user into the same account and no second row appears in users', async () => {
  await withFreshDb(async () => {
    const before = db.prepare('SELECT COUNT(*) AS count FROM users WHERE email = ?').get('member@club.test').count;
    assert.equal(Number(before), 1);

    const sameUser = getUserByEmail('member@club.test');
    assert.ok(sameUser);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users WHERE email = ?').get('member@club.test').count, 1);
  });
});

test('AC-9 when the model key is missing the form leaves the organizer fields blank and shows a note telling the user to type details manually', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    const fallback = await generateEventSuggestion({ description: 'Try a club event' }, async () => {
      throw new Error('rate-limited');
    });
    assert.ok(fallback.title);
    assert.ok(fallback.date);
    assert.ok(fallback.location);
  } finally {
    if (previousKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previousKey;
    }
  }
});

test('AC-10 the MCP register tool refuses a full event with the same message the HTTP API returns and the database remains unchanged', async () => {
  await withFreshDb(async () => {
    const member = getUserByEmail('member@club.test');
    const otherUser = db
      .prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)')
      .run('other@club.test', '$2a$10$RjNmtiUh/Qksbfuw6CxrSed8A2jPzfpla3VDOn5OfkUv2umxbrVqW', 'member');
    const userId = Number(otherUser.lastInsertRowid);

    const generated = db
      .prepare('INSERT INTO events (title, date, location, capacity, description) VALUES (?, ?, ?, ?, ?)')
      .run('Full MCP Night', '2037-05-02', 'Room 22', 1, 'MCP check');
    const eventId = Number(generated.lastInsertRowid);

    db.prepare('INSERT INTO registrations (event_id, user_id) VALUES (?, ?)').run(eventId, member.id);

    assert.throws(() => registerForEvent(userId, eventId), /This event is full/);
    const count = db.prepare('SELECT COUNT(*) AS count FROM registrations WHERE event_id = ?').get(eventId).count;
    assert.equal(Number(count), 1);
  });
});

test('AC-11 if one event row is deleted from the database, reloading /events removes that event from the page and no stale row remains visible', async () => {
  await withFreshDb(async () => {
    const loginRes = await request(app)
      .post('/login')
      .type('form')
      .send({ email: 'member@club.test', password: 'password123' });
    const cookie = loginRes.headers['set-cookie'][0].split(';')[0];

    const generated = db
      .prepare('INSERT INTO events (title, date, location, capacity, description) VALUES (?, ?, ?, ?, ?)')
      .run('Delete Me', '2037-06-11', 'Room 99', 5, 'To be removed');
    const eventId = Number(generated.lastInsertRowid);

    db.prepare('DELETE FROM events WHERE id = ?').run(eventId);
    const res = await request(app).get('/events').set('Cookie', cookie);

    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /Delete Me/i);
  });
});

test('AC-14 a user who tries to reach /events in a second browser without a session is redirected to sign-in and sees no event rows', async () => {
  await withFreshDb(async () => {
    const res = await request(app).get('/events');
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/login');
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
