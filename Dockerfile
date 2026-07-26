# Use Node.js LTS version
FROM node:20-slim

# Create app directory
WORKDIR /usr/src/app

# Copy manifests first so the dependency layer caches independently of source changes.
COPY package*.json ./

# ci installs exactly what package-lock.json pins; install can silently drift.
RUN npm ci --omit=dev

# Bundle app source
COPY . .

# Drop root before running the app. The node image already ships a `node` user.
RUN chown -R node:node /usr/src/app
USER node

# Define environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Your app binds to port 3000 - expose it
EXPOSE 3000

# Start the app
CMD [ "node", "server.js" ]
