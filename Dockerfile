# Use Node.js LTS version
FROM node:20-slim

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# Copy package.json and package-lock.json first for better caching
COPY package*.json ./

RUN npm install

# Bundle app source
COPY . .

# Your app binds to port 3000 - expose it
EXPOSE 3000

# Create a non-root user
RUN adduser --disabled-password --gecos "" appuser
USER appuser

# Define environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Start the app
CMD [ "node", "server.js" ]
