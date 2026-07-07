# Built from the repo root so the shared ../../tsconfig.base.json is in context:
#   docker build -f apps/ev-crossover/Dockerfile .

# Build stage — compile the TypeScript server (dist/) and client bundle (public/).
FROM node:24-alpine AS builder
WORKDIR /repo
# Shared base tsconfig that this app's tsconfig extends via ../../.
COPY tsconfig.base.json ./
# Shared access-log middleware. server.ts imports it by relative path
# (../../packages/access-log/logger.ts) and tsc compiles it into this app's
# dist/, so its deps must be installed here for that compile to resolve.
WORKDIR /repo/packages/access-log
COPY packages/access-log/package.json ./
RUN npm install
COPY packages/access-log/ ./
# Shared server-kit bootstrap (createApp/startServer), imported by server.ts.
WORKDIR /repo/packages/server-kit
COPY packages/server-kit/package.json ./
RUN npm install
COPY packages/server-kit/ ./
WORKDIR /repo/apps/ev-crossover
# Manifest first for dependency-layer caching.
COPY apps/ev-crossover/package.json ./
RUN npm install
# App sources (server, lib, client, tsconfigs, public static assets).
COPY apps/ev-crossover/ ./
RUN npm run build

# Production stage — ships compiled JS + prod dependencies only.
FROM node:24-alpine
WORKDIR /app
COPY apps/ev-crossover/package.json ./
RUN npm install --omit=dev
COPY --from=builder /repo/apps/ev-crossover/dist ./dist
COPY --from=builder /repo/apps/ev-crossover/public ./public

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
