# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Start development server**: `npm run dev` (nodemon, auto-restart on changes)
- **Start production server**: `npm start`
- **Syntax check**: `npm run check`
- **Install dependencies**: `npm install`

## Architecture Overview

An OAuth 2.0 Authorization Code + PKCE demo built with Node.js/Express that visualizes the
real authentication exchange in the browser as it happens.

### Core Components

**Backend (`server.js`)**:
- Express server with `express-session` and Passport (`passport-auth0`)
- WebSocket server (`ws`) sharing the HTTP server
- Per-session flow event log that both streams and replays OAuth steps
- Startup validation of required environment variables

**Frontend (`public/`)**:
- `index.html` — five-step flow visualization plus the live WebSocket client
- `protected.html` — page behind `ensureAuthenticated`, reads `/api/me`
- `styles.css` — shared styles and the light/dark theme variables

### Key Architecture Patterns

**Session-scoped flow events**: `recordEvent(flowId, event)` appends to a per-flow history
in the `flows` map and pushes to that flow's sockets only. Never broadcast to all clients —
event payloads carry the authenticating user's profile and token previews.

The flow id is 128 bits of randomness held in `req.session.flowId`, handed to the page by
`GET /api/flow`. The page registers for it as the first WebSocket message and receives the
history on connect.

Two constraints to preserve when touching this code:

- **Passport regenerates the session on login** (anti-fixation, passport >= 0.6), which
  drops `session.flowId`. `/callback` stashes it on `req.flowId` before authenticating and
  restores it afterwards. The strategy's verify callback uses `req.flowId` for the same
  reason, which is why the strategy sets `passReqToCallback: true`.
- **The socket does not survive the flow.** `/login` and the Auth0 redirect are full-page
  navigations, so steps 2–4 are recorded while the page is disconnected. The history replay
  is what makes them visible, not the live push.

**Rendering untrusted data**: the client builds live updates with `document.createElement`
and `textContent`. Do not switch to `innerHTML` — event payloads include values derived from
query parameters and the identity provider.

**Session cookie**: `httpOnly`, `sameSite: 'lax'`, `secure` in production. It must stay
`lax`; `strict` withholds the cookie on the cross-site redirect back from Auth0 and breaks
state validation.

## Configuration Requirements

Required: `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_CALLBACK_URL`.
Also `SESSION_SECRET` when `NODE_ENV=production`. Optional: `APP_BASE_URL`, `PORT`,
`ENABLE_PKCE`. See `.env.example`.

Never hardcode a session secret or commit a real `.env`.

## Deployment

Requires a persistent Node process. Serverless platforms without WebSocket upgrade support
(including Vercel Node functions) cannot host this app. Use the `Dockerfile` with a
container host. The default `MemoryStore` session store should be replaced with Redis for
any multi-instance deployment.

**Cloudflare Containers** (`wrangler.jsonc`, `worker/index.mjs`): the Worker forwards every
request, including the WebSocket upgrade, to a single named container instance via
`getContainer(...).fetch()`. Two invariants:

- `max_instances` stays 1 and routing stays singleton. Session and flow state are
  in-process; fanning out breaks logins.
- Use `Container.fetch()`, never `containerFetch()`, which does not proxy WebSockets.

Secrets reach the container through the `envVars` assignment in the container class
constructor, sourced from Worker secrets. `envVars` must be assigned in the constructor
rather than declared as a getter — the base class initializes it as an instance field,
which would shadow a prototype getter.

## Key Routes

- `/` — flow visualization
- `/api/flow` — issues/returns the session's flow id for the WebSocket client
- `/api/me` — current user, authenticated only
- `/login` — starts Auth0 authentication
- `/callback` — handles the authorization code and token exchange
- `/protected` — requires authentication
- `/logout` — destroys the local session, then ends the Auth0 session
