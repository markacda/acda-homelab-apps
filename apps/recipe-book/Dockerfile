# syntax=docker/dockerfile:1
# Built from the repo root so the shared ../../tsconfig.base.json is in context:
#   docker build -f apps/recipe-book/Dockerfile .

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
# Shared http-utils helpers (memoryUpload/optStr/toStringArray), imported by server.ts.
WORKDIR /repo/apps/Common/http-utils
COPY apps/Common/http-utils/package.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --prefer-offline --no-audit --no-fund
COPY apps/Common/http-utils/ ./
WORKDIR /repo/apps/recipe-book
# Manifest first for dependency-layer caching.
COPY apps/recipe-book/package.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --prefer-offline --no-audit --no-fund
# App sources (server, the DDD layers, Web/client, tsconfigs, LaTeX templates).
COPY apps/recipe-book/ ./
RUN npm run build

# Production stage — ships compiled JS + prod dependencies only.
FROM node:24-alpine
WORKDIR /app
# Tectonic: self-contained LaTeX engine used to compile generated .tex -> PDF.
# Shipped in the Alpine community repo (ARM64 + amd64). If a future base image
# drops it, swap this stage for a Debian bookworm-slim base + the official
# Tectonic install script.
RUN --mount=type=cache,target=/var/cache/apk \
    apk add tectonic
COPY apps/recipe-book/package.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --prefer-offline --no-audit --no-fund --omit=dev
COPY --from=builder /repo/apps/recipe-book/dist ./dist
# Client assets are served from Web/public (see server.ts staticDir).
COPY --from=builder /repo/apps/recipe-book/Web/public ./Web/public
# Runtime-read templates (the LaTeX layout) live outside dist/; copy them in.
COPY --from=builder /repo/apps/recipe-book/templates ./templates

ENV PORT=6005
ENV DATA_DIR=/app/data
ENV LOG_DIR=/app/logs
# Tectonic downloads LaTeX support files on first run and caches them here; on a
# persistent volume this makes later builds fast and offline-capable.
ENV TECTONIC_CACHE_DIR=/app/data/.tectonic-cache
EXPOSE 6005

# Writable data + log dirs owned by the non-root "node" user. Named volumes
# mounted here inherit this ownership on first use, so the app can persist
# recipes/books/output and write access logs.
RUN mkdir -p /app/data /app/logs && chown -R node:node /app/data /app/logs

# Drop root privileges (the base image ships a non-root "node" user).
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:6005/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/apps/recipe-book/server.js"]
