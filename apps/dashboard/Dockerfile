# Built from the repo root so the shared ../../tsconfig.base.json is in context:
#   docker build -f apps/dashboard/Dockerfile .

# Build stage — compile the TypeScript server (dist/) and client bundle (public/).
FROM node:24-alpine AS builder
WORKDIR /repo
COPY tsconfig.base.json ./
WORKDIR /repo/apps/dashboard
COPY apps/dashboard/package.json ./
RUN npm install
COPY apps/dashboard/ ./
RUN npm run build

# Production stage — ships compiled JS + prod dependencies only.
FROM node:24-alpine
WORKDIR /app
COPY apps/dashboard/package.json ./
RUN npm install --omit=dev
COPY --from=builder /repo/apps/dashboard/dist ./dist
COPY --from=builder /repo/apps/dashboard/public ./public
# Bundle the default config; docker-compose mounts ./config over it read-only.
COPY apps/dashboard/config ./config

ENV PORT=8080
ENV LOG_DIR=/app/logs
EXPOSE 8080

# Writable log dir. A named volume mounted here persists the structured access logs.
RUN mkdir -p /app/logs

# NOTE: unlike the other apps, the dashboard runs as root. Its auto-discovery
# reads the host's Docker socket (mounted read-only), which is owned by
# root:docker — an unprivileged user gets EACCES and discovery silently returns
# no containers, leaving only the manually-configured tiles.

CMD ["node", "dist/server.js"]
