const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { getUserByEmail, getUserById, listFutureEvents, resetDatabase } = require('./db');

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'club-events-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
    },
  }),
);

function renderLoginPage(message = '') {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>Club Events Login</title>
      <style>
        body { font-family: sans-serif; max-width: 420px; margin: 48px auto; padding: 24px; }
        label { display: block; margin-top: 12px; }
        input { width: 100%; padding: 10px; margin-top: 6px; }
        button { margin-top: 16px; width: 100%; padding: 12px; }
        .error { color: #b00020; margin-bottom: 12px; }
      </style>
    </head>
    <body>
      <h1>Club Events</h1>
      <p>Sign in to view upcoming events.</p>
      ${message ? `<div class="error">${message}</div>` : ''}
      <form method="POST" action="/login">
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" required />
        </label>
        <button type="submit">Sign in</button>
      </form>
    </body>
  </html>`;
}

function renderEventsPage(events, user) {
  const eventRows = events
    .map(
      (event) => `
        <li>
          <strong>${event.title}</strong> — ${event.date}<br />
          ${event.location}<br />
          Free places: ${event.capacity}
        </li>
      `,
    )
    .join('');

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>Upcoming Events</title>
      <style>
        body { font-family: sans-serif; max-width: 720px; margin: 40px auto; padding: 20px; }
        ul { padding-left: 18px; }
        li { margin-bottom: 14px; }
        a { display: inline-block; margin-top: 16px; }
      </style>
    </head>
    <body>
      <h1>Upcoming Events</h1>
      <p>Signed in as ${user.email}</p>
      <ul>${eventRows || '<li>No upcoming events.</li>'}</ul>
      <a href="/logout">Log out</a>
    </body>
  </html>`;
}

app.get('/', (req, res) => {
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  res.type('html').send(renderLoginPage());
});

app.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = getUserByEmail(email || '');

  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).type('html').send(renderLoginPage('Invalid email or password.'));
  }

  req.session.userId = user.id;
  req.session.role = user.role;
  res.redirect('/events');
});

app.get('/events', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.redirect('/login');
  }

  const user = getUserById(req.session.userId);
  if (!user) {
    return res.redirect('/login');
  }

  const events = listFutureEvents();
  res.type('html').send(renderEventsPage(events, user));
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = { app, resetDatabase };
