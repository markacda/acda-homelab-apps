# syntax=docker/dockerfile:1
# Built from the repo root so the shared ../../tsconfig.base.json is in context:
#   docker build -f apps/ev-crossover/Dockerfile .

# Build stage — compile the TypeScript server (dist/) and client bundle (Web/public/).
FROM node:24-alpine AS builder
WORKDIR /repo
# Shared base tsconfig that this app's tsconfig extends via ../../.
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
WORKDIR /repo/apps/ev-crossover
# Manifest first for dependency-layer caching.
COPY apps/ev-crossover/package.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --prefer-offline --no-audit --no-fund
# App sources (server, Web client, tsconfigs, static assets).
COPY apps/ev-crossover/ ./
RUN npm run build

# Production stage — ships compiled JS + prod dependencies only.
FROM node:24-alpine
WORKDIR /app
COPY apps/ev-crossover/package.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --prefer-offline --no-audit --no-fund --omit=dev
COPY --from=builder /repo/apps/ev-crossover/dist ./dist
# Client assets are served from Web/public (see server.ts staticDir).
COPY --from=builder /repo/apps/ev-crossover/Web/public ./Web/public

ENV PORT=6002
ENV LOG_DIR=/app/logs
EXPOSE 6002

# Writable log dir owned by the non-root "node" user. A named volume mounted
# here inherits this ownership on first use, so the app can write access logs.
RUN mkdir -p /app/logs && chown node:node /app/logs

# Drop root privileges (the base image ships a non-root "node" user).
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:6002/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/apps/ev-crossover/server.js"]
