# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Start development server**: `npm run dev` (uses nodemon with auto-restart on file changes)
- **Start production server**: `npm start` 
- **Install dependencies**: `npm install`

## Architecture Overview

This is an OAuth 2.0 Authorization Code Flow demo application built with Node.js/Express that demonstrates real-time OAuth flow visualization.

### Core Components

**Backend (`server.js`)**:
- Express.js server with session management
- Passport.js authentication using Auth0Strategy
- WebSocket server for real-time communication
- Environment variable configuration for OAuth credentials

**Frontend (`public/`)**:
- Interactive HTML interface showing OAuth flow steps
- WebSocket client for real-time updates during authentication
- CSS styling for visual flow demonstration

### Key Architecture Patterns

**Real-time OAuth Visualization**: The application broadcasts OAuth flow events via WebSocket to provide live updates of the authentication process. The `broadcast()` function sends messages to all connected clients when:
- Authentication starts (`/login` route)
- Authorization code is received (`/callback` route) 
- Token exchange completes (Auth0Strategy callback)

**Session-based Authentication**: Uses express-session with Passport.js for maintaining user authentication state across requests.

**Environment Configuration**: OAuth provider settings (Auth0 domain, client ID/secret, callback URL) are configured via environment variables in `.env` file.

## Configuration Requirements

The application requires these environment variables:
- `AUTH0_DOMAIN`: Your Auth0 domain
- `AUTH0_CLIENT_ID`: OAuth application client ID
- `AUTH0_CLIENT_SECRET`: OAuth application client secret  
- `AUTH0_CALLBACK_URL`: Callback URL (typically `http://localhost:3000/callback`)
- `PORT`: Server port (defaults to 3000)

## Deployment

The application includes Vercel configuration (`vercel.json`) for deployment and integrates Vercel Speed Insights for performance monitoring.

## Key Routes

- `/`: Homepage with OAuth flow visualization
- `/login`: Initiates OAuth authentication with Auth0
- `/callback`: Handles OAuth callback and token exchange
- `/protected`: Protected route requiring authentication
- `/logout`: Clears user session