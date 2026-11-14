const { db, getEventById, getUserRegistrations, getRegistrationForUser } = require('../db');

class RegistrationConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RegistrationConflictError';
    this.statusCode = 409;
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

class AuthorizationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = 403;
  }
}

function listFutureEvents() {
  return require('../db').listFutureEvents();
}

function getEventSummary(eventId) {
  const event = getEventById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found.');
  }
  return event;
}

function listMyRegistrations(userId) {
  return getUserRegistrations(userId);
}

function registerForEvent(userId, eventId) {
  const event = getEventById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  const existing = getRegistrationForUser(userId, eventId);
  if (existing) {
    throw new RegistrationConflictError('You are already registered for this event.');
  }

  const seatsTaken = Number(
    db.prepare('SELECT COUNT(*) AS count FROM registrations WHERE event_id = ?').get(eventId).count,
  );

  if (seatsTaken >= Number(event.capacity)) {
    throw new RegistrationConflictError('This event is full.');
  }

  const insertResult = db
    .prepare('INSERT INTO registrations (event_id, user_id) VALUES (?, ?)')
    .run(eventId, userId);

  return {
    id: Number(insertResult.lastInsertRowid),
    event_id: Number(eventId),
    user_id: Number(userId),
    title: event.title,
  };
}

function cancelRegistration(userId, eventId) {
  const registration = getRegistrationForUser(userId, eventId);
  if (!registration) {
    throw new NotFoundError('You are not registered for this event.');
  }

  db.prepare('DELETE FROM registrations WHERE event_id = ? AND user_id = ?').run(eventId, userId);
  return { event_id: Number(eventId), user_id: Number(userId) };
}

function cancelRegistrationByOwner(userId, registrationId) {
  const registration = db
    .prepare('SELECT * FROM registrations WHERE id = ?')
    .get(registrationId);

  if (!registration) {
    throw new NotFoundError('Registration not found.');
  }

  if (registration.user_id !== userId) {
    throw new AuthorizationError('You can only cancel your own registration.');
  }

  db.prepare('DELETE FROM registrations WHERE id = ?').run(registrationId);
  return { id: Number(registrationId), deleted: true };
}

module.exports = {
  AuthorizationError,
  NotFoundError,
  RegistrationConflictError,
  cancelRegistration,
  cancelRegistrationByOwner,
  getEventSummary,
  listFutureEvents,
  listMyRegistrations,
  registerForEvent,
};
