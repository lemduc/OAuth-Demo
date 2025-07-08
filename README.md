# OAuth Authorization Code Flow Demo

This is a simple demonstration of the OAuth 2.0 Authorization Code Flow using Node.js and Express.

## Prerequisites

- Node.js installed on your system
- An OAuth 2.0 provider account (e.g., GitHub, Google, or any other OAuth provider)

## Setup

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure your OAuth provider:
   - Go to your OAuth provider's developer console
   - Create a new OAuth application
   - Set the callback URL to: `http://localhost:3000/callback`
   - Copy the client ID and client secret

4. Configure environment variables:
   - Copy the `.env.example` file to `.env`
   - Fill in your OAuth provider details:
     - `CLIENT_ID`: Your OAuth app's client ID
     - `CLIENT_SECRET`: Your OAuth app's client secret
     - `OAUTH_AUTH_URL`: Your provider's authorization URL
     - `OAUTH_TOKEN_URL`: Your provider's token URL
     - `CALLBACK_URL`: `http://localhost:3000/callback`

## Running the Demo

1. Start the server:
   ```bash
   npm start
   ```

2. Visit `http://localhost:3000` in your browser

3. Click the "Login with OAuth" button to start the OAuth flow

## How it Works

1. User clicks the login button
2. User is redirected to the OAuth provider
3. User authenticates and approves the application
4. Provider redirects back with an authorization code
5. Server exchanges the code for an access token
6. User is authenticated and can access protected resources

## Files

- `server.js`: Main application server
- `public/index.html`: Homepage with login button
- `public/protected.html`: Protected page only visible after authentication
- `.env`: Configuration file for OAuth credentials
