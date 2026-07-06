FROM node:24-alpine

WORKDIR /app

# Install dependencies first for better layer caching
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the rest of the app
COPY . .

ENV PORT=8080
ENV LOG_DIR=/app/logs
EXPOSE 8080

# Writable log dir (the dashboard runs as root, so no chown needed). A named
# volume mounted here persists the structured access logs.
RUN mkdir -p /app/logs

# NOTE: unlike the other apps, the dashboard runs as root. Its auto-discovery
# reads the host's Docker socket (mounted read-only), which is owned by
# root:docker — an unprivileged user gets EACCES and discovery silently returns
# no containers, leaving only the manually-configured tiles.

CMD ["node", "server.js"]
