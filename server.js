require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const Auth0Strategy = require('passport-auth0');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const url = require('url');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store WebSocket clients
const clients = new Set();

// Session middleware
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false
}));

// Initialize Passport and restore authentication state from session
app.use(passport.initialize());
app.use(passport.session());

// Serve static files
app.use(express.static('public'));

// Broadcast to all connected clients
function broadcast(message) {
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

// WebSocket connection handling
wss.on('connection', (ws) => {
    clients.add(ws);
    
    ws.on('close', () => {
        clients.delete(ws);
    });
});

// Auth0 configuration with detailed logging
passport.use(new Auth0Strategy({
    domain: process.env.AUTH0_DOMAIN,
    clientID: process.env.AUTH0_CLIENT_ID,
    clientSecret: process.env.AUTH0_CLIENT_SECRET,
    callbackURL: process.env.AUTH0_CALLBACK_URL
},
function(accessToken, refreshToken, extraParams, profile, cb) {
    // Log token exchange success
    broadcast({
        step: 4,
        title: "Token Exchange Successful",
        data: {
            accessToken: `${accessToken.substr(0, 10)}...`,
            idToken: extraParams.id_token ? `${extraParams.id_token.substr(0, 10)}...` : null,
            profile: {
                name: profile.displayName,
                email: profile.emails?.[0]?.value,
                picture: profile.picture
            }
        }
    });
    return cb(null, profile);
}));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user, done) => {
    done(null, user);
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res, next) => {
    // Log the start of authentication
    broadcast({
        step: 2,
        title: "Starting Auth0 Authentication",
        data: {
            authUrl: `https://${process.env.AUTH0_DOMAIN}/authorize?` +
                    `client_id=${process.env.AUTH0_CLIENT_ID}&` +
                    `redirect_uri=${process.env.AUTH0_CALLBACK_URL}&` +
                    `response_type=code&` +
                    `scope=openid%20email%20profile`
        }
    });
    passport.authenticate('auth0', {
        scope: 'openid email profile',
        prompt: 'login'
    })(req, res, next);
});

app.get('/callback', (req, res, next) => {
    // Log the authorization code receipt
    if (req.query.code) {
        broadcast({
            step: 3,
            title: "Authorization Code Received",
            data: {
                code: `${req.query.code.substr(0, 10)}...`,
                state: req.query.state
            }
        });
    }

    passport.authenticate('auth0', { 
        failureRedirect: '/login',
        failureMessage: true
    })(req, res, next);
}, (req, res) => {
    // Log successful authentication
    broadcast({
        step: 3,
        title: "Authorization Code Exchange Complete",
        data: {
            auth_status: 'success',
            user: {
                name: req.user.displayName,
                email: req.user.emails?.[0]?.value,
                picture: req.user.picture
            }
        }
    });
    // Redirect with a hash that will trigger showing step 3
    res.redirect('/#step=3');
});

app.get('/protected', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'protected.html'));
});

app.get('/logout', (req, res) => {
    req.logout(() => {
        res.redirect('/');
    });
});

// Middleware to check if user is authenticated
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('Visit http://localhost:3000 to see the demo');
});
