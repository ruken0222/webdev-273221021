# Agent log

One entry per agent session, newest at the bottom. Be honest: what went wrong is the useful part.

<!-- Copy this block for each session:

## YYYY-MM-DD · <short title>
- Goal:
- Delegated:
- Checkpoints:
- Went wrong:
- Changed by hand:

-->

## 2026-11-14 · Exercise 3 registration feature
- Goal: Add one full club-events feature end to end, including the service rule and the API flow, and keep the Exercise 2 slice working.
- Delegated: Migration, service rule, route wiring, UI hook-up, MCP project tools, and first drafts of the tests.
- Checkpoints: Reviewed the spec and the exercise page, wrote the rule test before the implementation, ran the tests between steps, and kept each change small enough to read in a diff.
- Went wrong: The first version left the rule in the route and did not yet add the registrations table; I moved the logic into services/registrationService.js and kept the database change in a numbered migration.
- Changed by hand: Added the registrations migration, the service layer, the API paths, the browser button flow, and the model/MCP support required by the project checks.
- What the agent did that I did not ask for: It added the Gemini fallback helper in services/eventSuggestion.js and extended the project MCP server with the club event tools. I kept both because the repository spec already required a model feature and project MCP tools, and the Exercise 3 checks enforce them.

## 2026-11-14 · Exercise 1 MCP server
- Goal: Build the JSON-RPC MCP server and verify it passes the provided self-check.
- Delegated: None.
- Checkpoints: Confirmed the exercise requirements in the repo docs and implemented the protocol loop around the lecture data.
- Went wrong: The local environment did not have Node installed, so the runtime had to be set up in the user profile before validation.
- Changed by hand: Added the root script, created the server implementation, and verified the protocol with the project’s checker.
