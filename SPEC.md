# Club Events · Sofia Student Union

<!-- Exercise 2. Write the non-goals first. Every acceptance criterion must be checkable in under a minute.
     Keep these headings exactly as they are: the self-checks look for them by name.
     The full target is on the course site under Resources → The course project. -->

## Project option
Club events.

## Goals
- A student can sign in, browse upcoming club events, and sign up for one with free places.
- A club organizer can create and manage events, see the current sign-ups, and close registration when the event is full.
- The app keeps event capacity and sign-up rules enforced in one place so the same data is safe everywhere.

## Non-goals
- No payments or ticket checkout: every event is free to attend.
- No email or push notifications: members check the website and event list directly.
- No mobile app: the product is a web application that also works on phone screens.
- No event editing history or audit trail: the app tracks the current state, not every change.

## Constraints
- The stack is Node.js with Express, a PostgreSQL database, and plain HTML/CSS/JavaScript in the UI.
- Passwords are never stored as readable text; they are hashed before saving.
- Each action must be authorized: a member may not create or manage another member's sign-up, and organizers may only edit their own club events.
- The app must keep its data in a real relational database, not only in in-memory arrays.

## The model feature
- Model: Gemini 2.5 Flash via a hosted API key from `GEMINI_API_KEY`.
- Input: the organizer uploads a poster image or a short event description, and the model suggests a title, date and location.
- Output: a suggested event summary that is shown in the organizer form and must be confirmed before saving.
- When it fails: if the key is missing, the request times out, or the provider returns a rate-limit error, the form stays blank and shows a simple note to type the details manually; nothing is saved without the organizer pressing save.

## Auth
- Local: e-mail and password sign-in with a bcrypt hash stored in the `users` table.
- Provider: Google sign-in through the OAuth authorization-code flow on the server.
- Linking: when a user signs in with Google, the app matches by the provider account id and keeps one account per person; a Google account with an unverified e-mail address is not linked to an existing account.

## MCP tools
<!-- At least three tools your own MCP server exposes over this project's data.
     Each tool calls the same service functions the HTTP API calls, so the same rules apply.
     A description shorter than 20 characters is not a description. -->
| Tool | What it does | Who may call it |
| --- | --- | --- |
| `upcoming_events` | Lists future events with the free places left for each one | anyone |
| `my_registrations` | Shows the signed-in member's own registrations and event names | the token's owner |
| `register` | Adds a member's registration to an event and refuses one that is already full | the token's owner |
| `club_event_details` | Returns the event title, date, place and remaining capacity for a chosen event | anyone |

## UI
The UI is a small web app using plain HTML, CSS and JavaScript served by the backend. The screens are: a sign-in screen, the upcoming events list, a single event detail view with sign-up status, and an organizer page that shows the event's current registrations. The checklist lives in `docs/UI.md`.

## Architecture
<!-- Exercise 3. One request traced through every layer, naming the file for each one,
     plus one place where your own code does not match this layering. -->
A request to register for a club event starts in app.js.
The route reads the signed-in user from the session and translates the outcome into a status code.
The real rule sits in services/registrationService.js, where the code checks whether the event exists,
whether the member already registered, and whether the event is full before writing a row.
The database call happens in db.js, which reads and writes the registrations table and the event counts from SQLite.
After the data returns, the browser page in app.js renders the updated event list and the client-side button state.
One place this project does not match the strict layering is the fetch logic in the HTML page itself:
it is in the UI file and not in a separate client module, but it does not query the database and it does not enforce the rule.

## Acceptance criteria
<!-- Every criterion carries an id. A test proves it by naming that id in its title, for example
     test('AC-3 a booking that overlaps another is refused with 409', ...).
     Say who acts, what they see, and what must be true in the database. -->
- [AC-1] A signed-in member who opens `/events` sees only events whose date is in the future.
- [AC-2] A member who signs up for an event with no free places sees "This event is full", and no new row appears in `registrations`.
- [AC-3] A member who is already registered for an event and presses sign up again gets a 409 response and still has exactly one row in `registrations`.
- [AC-4] An organizer who opens an event detail page sees the list of members signed up for that event, and a regular member sees only the event details and the sign-up button.
- [AC-5] A signed-in member can cancel their own registration, and the event's remaining capacity increases immediately by one.
- [AC-6] A visitor who opens `/events` without signing in is redirected to `/login` instead of seeing the list.
- [AC-7] After signing in with a seeded account, `/events` shows the seeded event titles, dates and free-place counts from the database.
- [AC-8] A Google sign-in for an account that already has a password login signs the user into the same account, and no second row appears in `users`.
- [AC-9] When the model key is missing, uploading a poster or event description leaves the organizer form fields empty and shows a note telling the user to type the details manually.
- [AC-10] The MCP tool `register` refuses a full event with the same message the HTTP API returns, and the database remains unchanged.
- [AC-11] If one event row is deleted from the database, reloading `/events` removes that event from the page and no stale row remains visible.

### Slice 1: sign-in and the upcoming events list
- [AC-12] A visitor who opens the app root is sent to `/login` and must sign in before accessing the upcoming-events page.
- [AC-13] After a seeded member signs in successfully, the events page lists the seeded future events and shows each one with a title, date and remaining places.
- [AC-14] A user who tries to reach `/events` in a second browser without a session is redirected to sign-in and sees no event rows.

## Traceability
<!-- Filled in from Exercise 3 onward: each AC id, and the test that names it. -->
| Criterion | Test |
| --- | --- |
| AC-1 | a signed-in member sees only future events |
| AC-2 | a full event is refused and the database stays unchanged |
| AC-3 | repeated sign-up returns 409 with a single registration row |
| AC-4 | organizer sees registrations while a regular member does not |
| AC-5 | a member can cancel their own registration |
| AC-6 | unauthenticated access is redirected to /login |
| AC-7 | the seeded event list comes from the database |
| AC-8 | Google-linked sign-in keeps one account per person |
| AC-9 | a missing model key leaves the form blank and requests manual input |
| AC-10 | the MCP register tool matches the HTTP refusal path |
| AC-11 | deleting an event removes it from the page immediately |
| AC-12 | root access redirects visitors to /login |
| AC-13 | the seeded member sees the seeded upcoming events |
| AC-14 | a second browser without a session is redirected to sign-in |

## Spec vs result
<!-- After the agent builds the slice: which criteria passed, which it missed or reinterpreted, and what you changed in this spec because of it. -->
- Passed: the signed-in list screen, redirect to sign-in for unauthenticated access, and the event rows loaded from the real database.
- Missed: an early version of the plan was tempted to add a payment step; that was removed because it conflicts with the non-goal of no payments.
- Changed in this spec: the event list criteria now explicitly say "only future events are shown" so the app cannot accidentally display past events after the first slice.
