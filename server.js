require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const Auth0Strategy = require('passport-auth0');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const baseUrl = process.env.APP_BASE_URL || `http://localhost:${PORT}`;

// Fail fast with a readable message instead of a confusing stack trace later.
const requiredEnv = ['AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET', 'AUTH0_CALLBACK_URL'];
const missing = requiredEnv.filter((key) => !process.env[key]);
if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    console.error('Copy .env.example to .env and fill in your Auth0 application settings.');
    process.exit(1);
}

// The session secret signs the session cookie. A hardcoded value in a public
// repo lets anyone forge a signed cookie and walk straight past ensureAuthenticated.
if (!process.env.SESSION_SECRET) {
    if (isProduction) {
        console.error('SESSION_SECRET is required when NODE_ENV=production. Refusing to start.');
        process.exit(1);
    }
    console.warn('[warn] SESSION_SECRET is not set. Using a random secret; sessions reset on every restart.');
}
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// Needed so secure cookies and req.protocol work correctly behind a proxy/load balancer.
app.set('trust proxy', 1);

app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        // Must stay 'lax'. With 'strict' the browser withholds the cookie on the
        // cross-site redirect back from Auth0, so state validation would always fail.
        sameSite: 'lax',
        // 'auto' marks the cookie Secure only when the request arrived over HTTPS,
        // which behind a proxy means X-Forwarded-Proto (see trust proxy above).
        // Hardcoding true breaks every plain-HTTP deployment silently: the cookie
        // is dropped, so no session is ever established and login cannot complete.
        secure: 'auto',
        maxAge: 60 * 60 * 1000
    }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(express.static(path.join(__dirname, 'public')));

// --- Per-session flow event log ---------------------------------------------
// Events are scoped to the browser session that caused them. Broadcasting to
// every socket both leaked one user's profile and token prefixes to unrelated
// viewers and never actually reached the user, whose socket is torn down by the
// OAuth redirects. Keeping a short server-side history lets the page replay the
// steps it missed while it was navigating away to Auth0 and back.
const MAX_EVENTS_PER_FLOW = 50;
const FLOW_TTL_MS = 30 * 60 * 1000;
const flows = new Map();
let eventSeq = 0;

function getFlow(flowId) {
    let flow = flows.get(flowId);
    if (!flow) {
        flow = { events: [], sockets: new Set(), updatedAt: Date.now() };
        flows.set(flowId, flow);
    }
    return flow;
}

function recordEvent(flowId, event) {
    if (!flowId) return;
    const flow = getFlow(flowId);
    const payload = { ...event, id: `e${++eventSeq}`, at: new Date().toISOString() };

    flow.events.push(payload);
    if (flow.events.length > MAX_EVENTS_PER_FLOW) flow.events.shift();
    flow.updatedAt = Date.now();

    const frame = JSON.stringify({ type: 'event', event: payload });
    flow.sockets.forEach((socket) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(frame);
    });
}

// Drop idle flows so the map does not grow without bound.
setInterval(() => {
    const cutoff = Date.now() - FLOW_TTL_MS;
    for (const [flowId, flow] of flows) {
        if (flow.sockets.size === 0 && flow.updatedAt < cutoff) flows.delete(flowId);
    }
}, 5 * 60 * 1000).unref();

function ensureFlowId(req) {
    if (!req.session.flowId) req.session.flowId = crypto.randomBytes(16).toString('hex');
    getFlow(req.session.flowId);
    return req.session.flowId;
}

// Show enough of a token to make the demo concrete without handing out a usable credential.
function preview(token) {
    if (typeof token !== 'string' || !token) return null;
    return `${token.slice(0, 10)}… (${token.length} chars)`;
}

wss.on('connection', (ws) => {
    let joined = null;

    ws.on('message', (raw) => {
        if (joined) return;

        let message;
        try {
            message = JSON.parse(raw);
        } catch {
            return;
        }
        if (message.type !== 'register' || !/^[a-f0-9]{32}$/.test(message.flowId || '')) return;

        // Only attach to a flow that already exists, so a client cannot fish for
        // another session's stream. Flow ids are 128 bits of randomness.
        const flow = flows.get(message.flowId);
        if (!flow) {
            ws.send(JSON.stringify({ type: 'error', message: 'Unknown flow. Reload the page.' }));
            return;
        }

        joined = flow;
        flow.sockets.add(ws);
        ws.send(JSON.stringify({ type: 'history', events: flow.events }));
    });

    ws.on('close', () => {
        if (joined) joined.sockets.delete(ws);
    });
});

// PKCE binds the authorization code to this specific client. Auth0 supports it
// for regular web apps; set ENABLE_PKCE=false if your tenant is configured otherwise.
const pkceEnabled = process.env.ENABLE_PKCE !== 'false';

passport.use(new Auth0Strategy({
    domain: process.env.AUTH0_DOMAIN,
    clientID: process.env.AUTH0_CLIENT_ID,
    clientSecret: process.env.AUTH0_CLIENT_SECRET,
    callbackURL: process.env.AUTH0_CALLBACK_URL,
    passReqToCallback: true,
    ...(pkceEnabled ? { pkce: 'S256' } : {})
    // state defaults to true in passport-auth0, which is what validates the CSRF state param.
},
function (req, accessToken, refreshToken, extraParams, profile, cb) {
    recordEvent(req.flowId, {
        step: 4,
        title: 'Token exchange successful',
        data: {
            accessToken: preview(accessToken),
            idToken: preview(extraParams && extraParams.id_token),
            tokenType: extraParams && extraParams.token_type,
            expiresIn: extraParams && extraParams.expires_in,
            profile: {
                name: profile.displayName,
                email: profile.emails?.[0]?.value
            }
        }
    });

    // Store only what the app needs; the raw profile carries _raw/_json blobs.
    return cb(null, {
        id: profile.id,
        displayName: profile.displayName,
        email: profile.emails?.[0]?.value,
        picture: profile.picture
    });
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// The page calls this on load to learn which flow to subscribe to.
app.get('/api/flow', (req, res) => {
    res.json({ flowId: ensureFlowId(req), authenticated: req.isAuthenticated() });
});

app.get('/api/me', ensureAuthenticated, (req, res) => {
    res.json({ user: req.user });
});

app.get('/login', (req, res, next) => {
    const flowId = ensureFlowId(req);

    recordEvent(flowId, {
        step: 2,
        title: 'Redirecting to Auth0 /authorize',
        data: {
            endpoint: `https://${process.env.AUTH0_DOMAIN}/authorize`,
            response_type: 'code',
            client_id: process.env.AUTH0_CLIENT_ID,
            redirect_uri: process.env.AUTH0_CALLBACK_URL,
            scope: 'openid email profile',
            state: 'generated and stored in session',
            code_challenge: pkceEnabled ? 'generated (S256)' : 'not used'
        }
    });

    passport.authenticate('auth0', {
        scope: 'openid email profile',
        prompt: 'login'
    })(req, res, next);
});

app.get('/callback', (req, res, next) => {
    // Passport regenerates the session on login, which drops session.flowId.
    // Carry it on the request so later handlers and the verify callback agree.
    req.flowId = req.session.flowId;

    if (req.query.code && req.flowId) {
        recordEvent(req.flowId, {
            step: 3,
            title: 'Authorization code received',
            data: {
                code: preview(req.query.code),
                // Never echo the raw state back to the browser: it is attacker-controllable
                // input on this endpoint. Report that it is present; passport validates it.
                state: typeof req.query.state === 'string' ? 'present, pending validation' : 'missing'
            }
        });
    }

    passport.authenticate('auth0', {
        // Redirecting to /login on failure restarts the whole flow and can loop.
        failureRedirect: '/?error=authentication_failed',
        failureMessage: true
    })(req, res, next);
}, (req, res) => {
    if (req.flowId) req.session.flowId = req.flowId;

    recordEvent(req.flowId, {
        step: 5,
        title: 'Session established',
        data: {
            authenticated: true,
            user: { name: req.user.displayName, email: req.user.email }
        }
    });

    res.redirect('/#step=5');
});

app.get('/protected', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'protected.html'));
});

app.get('/logout', (req, res, next) => {
    const flowId = req.session.flowId;

    req.logout((err) => {
        if (err) return next(err);

        // logout() alone only clears the passport user; the session record and
        // the Auth0 session both survive it.
        req.session.destroy(() => {
            res.clearCookie('connect.sid');
            if (flowId) flows.delete(flowId);

            const logoutUrl = `https://${process.env.AUTH0_DOMAIN}/v2/logout`
                + `?client_id=${encodeURIComponent(process.env.AUTH0_CLIENT_ID)}`
                + `&returnTo=${encodeURIComponent(baseUrl)}`;
            res.redirect(logoutUrl);
        });
    });
});

function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect('/login');
}

app.use((req, res) => {
    res.status(404).send('Not found');
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send('Internal server error');
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Visit ${baseUrl} to see the demo`);
});
