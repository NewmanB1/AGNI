# AGNI/Dockerfile
# Lightweight Node image
FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Install dependencies
# We use 'npm install' because you might not have a lockfile yet
COPY package*.json ./
RUN npm install --production

# Bundle app source
COPY . .

# Default command
CMD [ "node", "src/compiler.js" ]
