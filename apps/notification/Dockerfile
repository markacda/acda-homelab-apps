# syntax=docker/dockerfile:1
# Built from the repo root so the shared ../../tsconfig.base.json is in context:
#   docker build -f apps/notification/Dockerfile .

# Build stage — compile the TypeScript server (dist/) and client bundle (Web/public/).
FROM node:24-alpine AS builder
WORKDIR /repo
# Shared base tsconfig that this app's tsconfig extends via ../../.
COPY tsconfig.base.json ./
# Shared access-log middleware. server.ts imports it by relative path and tsc
# compiles it into this app's dist/, so its deps must resolve here.
WORKDIR /repo/apps/Common/access-log
COPY apps/Common/access-log/package.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --prefer-offline --no-audit --no-fund
COPY apps/Common/access-log/ ./
# Shared server-kit bootstrap (createApp/startServer), imported by server.ts.
WORKDIR /repo/apps/Common/server-kit
COPY apps/Common/server-kit/package.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --prefer-offline --no-audit --no-fund
COPY apps/Common/server-kit/ ./
# Shared http-utils helpers (optStr/clampInt), imported by the models/controllers.
WORKDIR /repo/apps/Common/http-utils
COPY apps/Common/http-utils/package.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --prefer-offline --no-audit --no-fund
COPY apps/Common/http-utils/ ./
# Shared db kit (pg pool + SQL migration runner), imported by register.ts.
WORKDIR /repo/apps/Common/db
COPY apps/Common/db/package.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --prefer-offline --no-audit --no-fund
COPY apps/Common/db/ ./
WORKDIR /repo/apps/notification
# Manifest first for dependency-layer caching.
COPY apps/notification/package.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --prefer-offline --no-audit --no-fund
# App sources (server, the DDD layers, Web/client, tsconfigs).
COPY apps/notification/ ./
RUN npm run build

# Production stage — ships compiled JS + prod dependencies only.
FROM node:24-alpine
WORKDIR /app
COPY apps/notification/package.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --prefer-offline --no-audit --no-fund --omit=dev
COPY --from=builder /repo/apps/notification/dist ./dist
# SQL migration files aren't emitted by tsc — ship them beside the compiled code
# at the path register.ts resolves (dist/apps/notification/Adapters/Postgres/migrations).
COPY --from=builder /repo/apps/notification/Adapters/Postgres/migrations ./dist/apps/notification/Adapters/Postgres/migrations
# Client assets are served from Web/public (see server.ts staticDir).
COPY --from=builder /repo/apps/notification/Web/public ./Web/public

ENV PORT=6006
ENV LOG_DIR=/app/logs
EXPOSE 6006

# Writable log dir owned by the non-root "node" user. The named log volume
# mounted here inherits this ownership on first use. (Notification data lives in
# Postgres now, so there's no data volume.)
RUN mkdir -p /app/logs && chown -R node:node /app/logs

# Drop root privileges (the base image ships a non-root "node" user).
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:6006/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/apps/notification/server.js"]
