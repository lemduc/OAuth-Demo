# OAuth Authorization Code Flow Demo

An interactive walkthrough of the OAuth 2.0 Authorization Code flow with PKCE, using
Auth0 as the identity provider. As you log in, the server streams each step of the real
exchange to the page over a WebSocket, so you can watch the authorization code arrive and
the token exchange complete against your own tenant.

Built with Node.js, Express, Passport, and `ws`.

## Prerequisites

- Node.js 18 or newer
- An [Auth0](https://auth0.com) account with a **Regular Web Application**

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. In the Auth0 dashboard, open your application's **Settings** and set:
   - **Allowed Callback URLs**: `http://localhost:3000/callback`
   - **Allowed Logout URLs**: `http://localhost:3000`

3. Create your local config:

   ```bash
   cp .env.example .env
   ```

   Then fill in `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, and `AUTH0_CLIENT_SECRET` from the same
   settings page, and generate a session secret:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `AUTH0_DOMAIN` | yes | Your Auth0 tenant domain, e.g. `your-tenant.us.auth0.com` |
| `AUTH0_CLIENT_ID` | yes | Application client ID |
| `AUTH0_CLIENT_SECRET` | yes | Application client secret |
| `AUTH0_CALLBACK_URL` | yes | Must match an Allowed Callback URL |
| `SESSION_SECRET` | in production | Signs the session cookie. Random ephemeral value in dev |
| `APP_BASE_URL` | no | Public origin; the post-logout `returnTo` target. Defaults to `http://localhost:<PORT>` |
| `PORT` | no | Defaults to `3000` |
| `ENABLE_PKCE` | no | PKCE is on by default; set to `false` to disable |

The app refuses to start if a required variable is missing, and refuses to start in
production without `SESSION_SECRET`.

## Running the Demo

```bash
npm start
```

Then visit `http://localhost:3000`, step through the explanation, and click
**Next (Start Auth)** to run the real flow.

For development with auto-restart:

```bash
npm run dev
```

## How it Works

1. `/login` records the outbound `/authorize` request and redirects to Auth0, sending a
   `state` parameter and a PKCE `code_challenge`.
2. You authenticate at Auth0 and consent.
3. Auth0 redirects to `/callback` with an authorization code. Passport validates `state`.
4. The server exchanges the code, the client secret, and the PKCE `code_verifier` for
   tokens at Auth0's `/oauth/token` endpoint. This is a server-to-server call; the secret
   never reaches the browser.
5. A session is created and an HttpOnly cookie is issued. `/protected` reads it.

### Live visualization

Each step is recorded server-side against a random per-session flow id and pushed to that
session's WebSocket clients only. Because the OAuth flow navigates the browser away to
Auth0 and back, the socket is torn down mid-flow; the server keeps a short history and
replays it when the page reconnects, so no steps are lost. Events are never shared between
visitors.

## Deployment

The visualization needs a long-lived WebSocket connection and in-memory session state, so
it requires a persistent Node process. Serverless platforms that do not support WebSocket
upgrades — including Vercel's Node functions — cannot run this app as written. Use a
container host such as Render, Railway, Fly.io, or your own server.

```bash
docker build -t oauth-demo .
cp docker.env.example docker.env   # fill in real values; docker.env is gitignored
docker run --env-file docker.env -p 3000:3000 oauth-demo
```

Behind a proxy or load balancer, set `NODE_ENV=production` (which enables the `Secure`
cookie flag) and `APP_BASE_URL` to your public HTTPS origin.

For anything beyond a demo, replace the default in-memory session store with a shared one
such as Redis; `express-session`'s `MemoryStore` leaks memory and does not survive a
restart or span multiple instances.

### Cloudflare Containers

`wrangler.jsonc` and `worker/index.mjs` deploy this to
[Cloudflare Containers](https://developers.cloudflare.com/containers/), which runs the
Dockerfile above behind a Worker. Requires the **Workers Paid plan** ($5/month). Workers
alone cannot host this app — `server.listen()`, `ws`, and `express-session` all need a real
Node process.

1. Set the secrets (each prompts for a value):

   ```bash
   npx wrangler secret put AUTH0_DOMAIN
   npx wrangler secret put AUTH0_CLIENT_ID
   npx wrangler secret put AUTH0_CLIENT_SECRET
   npx wrangler secret put AUTH0_CALLBACK_URL
   npx wrangler secret put APP_BASE_URL
   npx wrangler secret put SESSION_SECRET
   ```

2. Deploy:

   ```bash
   npm run cf:deploy
   ```

3. Take the deployed URL and set `AUTH0_CALLBACK_URL` to `<url>/callback` and
   `APP_BASE_URL` to `<url>`, then add both to your Auth0 **Allowed Callback URLs** and
   **Allowed Logout URLs**. Re-run `wrangler secret put` for the two values and redeploy.

The Worker forwards the WebSocket upgrade through `Container.fetch()`, which proxies the
socket bidirectionally. `containerFetch()` does not support WebSockets — do not switch to it.

The Worker also sets `X-Forwarded-Proto` from the incoming request. The Worker-to-container
hop is plain HTTP, so without it the app sees an insecure request and `express-session`
silently drops the session cookie: requests still return 200, but no session is ever stored
and login can never complete.

**`max_instances` must stay 1.** Sessions and the flow event log live in the container's
memory, so a second instance would serve requests that cannot see them and logins would
fail unpredictably. Raising it requires moving session state to KV, D1, or a Durable Object
first.

The container sleeps after `sleepAfter` (30m), which ends all sessions and clears the flow
log. That is fine for a demo — it also means you only pay for awake time, and a `lite`
instance fits roughly 100 hours/month inside the plan's included allotment.

Building the image locally requires Docker running; on Apple Silicon, build with
`--platform linux/amd64`.

## Files

- `server.js` — Express server, Passport/Auth0 setup, WebSocket flow log
- `public/index.html` — Step-by-step flow visualization
- `public/protected.html` — Page behind the auth check
- `public/styles.css` — Shared styling, including the dark theme
- `.env.example` — Template for local configuration
- `Dockerfile` — Container build
