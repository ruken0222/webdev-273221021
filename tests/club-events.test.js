const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, resetDatabase } = require('../app');

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
