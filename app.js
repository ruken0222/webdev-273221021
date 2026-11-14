const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const {
  getUserByEmail,
  getUserById,
  getUserRegistrations,
  listFutureEvents,
  resetDatabase,
} = require('./db');
const {
  cancelRegistration,
  getEventSummary,
  listMyRegistrations,
  registerForEvent,
  RegistrationConflictError,
  NotFoundError,
  AuthorizationError,
} = require('./services/registrationService');

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
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

function renderEventsPage(events, user, registrations = []) {
  const signedUpIds = new Set(registrations.map((event) => Number(event.event_id)));

  const eventRows = events
    .map((event) => {
      const remaining = Math.max(0, Number(event.remaining_capacity ?? event.capacity ?? 0));
      const isRegistered = signedUpIds.has(Number(event.id));
      const buttonText = isRegistered ? 'Cancel sign-up' : remaining > 0 ? 'Sign up' : 'Full';
      const disabled = !isRegistered && remaining === 0 ? 'disabled' : '';
      const action = isRegistered ? 'cancel' : 'register';

      return `
        <li>
          <strong>${event.title}</strong> — ${event.date}<br />
          ${event.location}<br />
          Free places: ${remaining}<br />
          <button type="button" data-event-id="${event.id}" data-action="${action}" ${disabled}>${buttonText}</button>
        </li>
      `;
    })
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
        button { padding: 8px 12px; }
        .status { margin-bottom: 12px; }
        a { display: inline-block; margin-top: 16px; }
      </style>
    </head>
    <body>
      <h1>Upcoming Events</h1>
      <p>Signed in as ${user.email}</p>
      <div id="status" class="status" aria-live="polite"></div>
      <ul>${eventRows || '<li>No upcoming events.</li>'}</ul>
      <a href="/logout">Log out</a>
      <script>
        document.addEventListener('click', async (event) => {
          const button = event.target.closest('button[data-event-id]');
          if (!button) return;

          const eventId = Number(button.dataset.eventId);
          const action = button.dataset.action;
          const status = document.getElementById('status');
          status.textContent = 'Working…';

          try {
            const response = await fetch('/api/events/' + eventId + '/register', {
              method: action === 'register' ? 'POST' : 'DELETE',
              headers: { 'Content-Type': 'application/json' },
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
              status.textContent = payload.message || 'That request could not be completed.';
              return;
            }

            status.textContent = action === 'register' ? 'Registration saved.' : 'Registration cancelled.';
            setTimeout(() => window.location.reload(), 300);
          } catch (error) {
            status.textContent = 'The server is unavailable right now.';
          }
        });
      </script>
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
  const myRegistrations = listMyRegistrations(user.id);
  res.type('html').send(renderEventsPage(events, user, myRegistrations));
});

app.get('/api/events/:eventId', (req, res) => {
  try {
    const event = getEventSummary(Number(req.params.eventId));
    res.json(event);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({ error: error.name, message: error.message });
    }
    return res.status(500).json({ error: 'InternalServerError', message: 'Something went wrong.' });
  }
});

app.get('/api/me/registrations', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Please sign in first.' });
  }

  const registrations = listMyRegistrations(req.session.userId);
  return res.json(registrations);
});

app.post('/api/events/:eventId/register', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Please sign in first.' });
  }

  try {
    const registration = registerForEvent(req.session.userId, Number(req.params.eventId));
    return res.status(201).json({ ok: true, registration });
  } catch (error) {
    if (error instanceof RegistrationConflictError) {
      return res.status(409).json({ error: error.name, message: error.message });
    }

    if (error instanceof NotFoundError) {
      return res.status(404).json({ error: error.name, message: error.message });
    }

    return res.status(500).json({ error: 'InternalServerError', message: 'Something went wrong.' });
  }
});

app.delete('/api/events/:eventId/register', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Please sign in first.' });
  }

  try {
    cancelRegistration(req.session.userId, Number(req.params.eventId));
    return res.status(204).send();
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({ error: error.name, message: error.message });
    }

    if (error instanceof AuthorizationError) {
      return res.status(403).json({ error: error.name, message: error.message });
    }

    return res.status(500).json({ error: 'InternalServerError', message: 'Something went wrong.' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = { app, resetDatabase };
