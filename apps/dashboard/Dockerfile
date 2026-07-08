# Built from the repo root so the shared ../../tsconfig.base.json is in context:
#   docker build -f apps/dashboard/Dockerfile .

# Build stage — compile the TypeScript server (dist/) and client bundle (Web/public/).
FROM node:24-alpine AS builder
WORKDIR /repo
COPY tsconfig.base.json ./
# Shared access-log middleware. server.ts imports it by relative path
# (../Common/access-log/logger.ts) and tsc compiles it into this app's
# dist/, so its deps must be installed here for that compile to resolve.
WORKDIR /repo/apps/Common/access-log
COPY apps/Common/access-log/package.json ./
RUN npm install
COPY apps/Common/access-log/ ./
# Shared server-kit bootstrap (createApp/startServer), imported by server.ts.
WORKDIR /repo/apps/Common/server-kit
COPY apps/Common/server-kit/package.json ./
RUN npm install
COPY apps/Common/server-kit/ ./
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
# Client assets are served from Web/public (see server.ts staticDir).
COPY --from=builder /repo/apps/dashboard/Web/public ./Web/public
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

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/apps/dashboard/server.js"]
