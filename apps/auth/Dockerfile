# syntax=docker/dockerfile:1
# Built from the repo root so the shared ../../tsconfig.base.json is in context:
#   docker build -f apps/auth/Dockerfile .

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
# Shared http-utils helpers, staged for parity with the other apps (kept so the
# request/response helpers are available when the auth backend lands in #149).
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
# Shared auth guards (requireRole/ROLE_*), imported by register.ts + user-admin-service.ts.
WORKDIR /repo/apps/Common/auth
COPY apps/Common/auth/package.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --prefer-offline --no-audit --no-fund
COPY apps/Common/auth/ ./
# Shared browser packages (issue #177) — the client build (tsconfig.client.json)
# compiles them into Web/public by relative path; no deps to install.
WORKDIR /repo/apps/Common/auth-client
COPY apps/Common/auth-client/ ./
WORKDIR /repo/apps/Common/web-kit
COPY apps/Common/web-kit/ ./
WORKDIR /repo/apps/auth
# Manifest first for dependency-layer caching.
COPY apps/auth/package.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --prefer-offline --no-audit --no-fund
# App sources (server, the DDD layers, Web/client, tsconfigs).
COPY apps/auth/ ./
RUN npm run build

# Production stage — ships compiled JS + prod dependencies only.
FROM node:24-alpine
WORKDIR /app
COPY apps/auth/package.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --prefer-offline --no-audit --no-fund --omit=dev
COPY --from=builder /repo/apps/auth/dist ./dist
# SQL migration files aren't emitted by tsc — ship them beside the compiled code
# at the path register.ts resolves (dist/apps/auth/Adapters/Postgres/migrations).
COPY --from=builder /repo/apps/auth/Adapters/Postgres/migrations ./dist/apps/auth/Adapters/Postgres/migrations
# Client assets are served from Web/public (see server.ts staticDir).
COPY --from=builder /repo/apps/auth/Web/public ./Web/public

ENV PORT=6007
ENV LOG_DIR=/app/logs
# Self-provisioned JWT signing secret, persisted on the auth-secrets volume so
# redeploys keep existing sessions valid (see Adapters/Config/jwt-secret.ts).
ENV JWT_SECRET_FILE=/auth-secrets/jwt.key
EXPOSE 6007

# Writable dirs owned by the non-root "node" user. The named volumes mounted here
# inherit this ownership on first use: logs, and the secrets dir the app writes the
# JWT signing key into. (Auth data itself lives in Postgres, so there's no data volume.)
RUN mkdir -p /app/logs /auth-secrets && chown -R node:node /app/logs /auth-secrets

# Drop root privileges (the base image ships a non-root "node" user).
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:6007/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/apps/auth/server.js"]
