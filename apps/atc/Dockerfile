# syntax=docker/dockerfile:1
# Built from the repo root so the shared ../../tsconfig.base.json is in context:
#   docker build -f apps/atc/Dockerfile .

# Build stage — compile the TypeScript backend to dist/.
FROM node:24-alpine AS builder
WORKDIR /repo
COPY tsconfig.base.json ./
# Shared access-log middleware. server.ts imports it by relative path
# (../Common/access-log/logger.ts) and tsc compiles it into this app's
# dist/, so its deps must be installed here for that compile to resolve.
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
# Shared auth guards (requireRole/ROLE_*), imported by Registrations/auth-guards.ts.
# Its runtime dep (jose) is listed in this app's package.json for the prod stage.
WORKDIR /repo/apps/Common/auth
COPY apps/Common/auth/package.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --prefer-offline --no-audit --no-fund
COPY apps/Common/auth/ ./
# Shared browser auth-client (issue #177) — the client build (tsconfig.client.json)
# compiles the auth-guard module + this package into Web/public by relative path.
WORKDIR /repo/apps/Common/auth-client
COPY apps/Common/auth-client/ ./
WORKDIR /repo/apps/atc
COPY apps/atc/package.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --prefer-offline --no-audit --no-fund
# server.ts + the DDD layers (compiled) + the vendored Web/public + Web/client (the
# auth-guard module) + tsconfig. `npm run build` now also runs the client tsc pass,
# emitting the compiled guard under Web/public/apps/ (served alongside the vendored JS).
COPY apps/atc/ ./
RUN npm run build

# Production stage — compiled JS + static frontend + prod dependencies only.
FROM node:24-alpine
WORKDIR /app
COPY apps/atc/package.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --prefer-offline --no-audit --no-fund --omit=dev
# Compiled backend and the static frontend it serves (resolved at ./Web/public). The
# frontend comes from the builder now, so it includes the compiled client (auth-guard)
# under Web/public/apps/ as well as the vendored tar1090 assets.
COPY --from=builder /repo/apps/atc/dist ./dist
COPY --from=builder /repo/apps/atc/Web/public ./Web/public
# Cached upstream DB snapshots served when the proxied backend is unreachable.
COPY apps/atc/proxy-fallback ./proxy-fallback

EXPOSE 6001
ENV NODE_ENV=production
ENV PORT=6001
ENV LOG_DIR=/app/logs

# Writable log dir owned by the non-root "node" user. A named volume mounted
# here inherits this ownership on first use, so the app can write access logs.
RUN mkdir -p /app/logs && chown node:node /app/logs

# Run as non-root user for security
USER node

# Start the server with compiled JavaScript
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:6001/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/apps/atc/server.js"]
