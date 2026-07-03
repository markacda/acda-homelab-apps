FROM node:24-alpine

WORKDIR /app

# Install dependencies first for better layer caching
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the rest of the app
COPY . .

ENV PORT=8080
EXPOSE 8080

# Drop root privileges (the base image ships a non-root "node" user).
USER node

CMD ["node", "server.js"]
