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
RUN npm install
COPY apps/Common/access-log/ ./
# Shared server-kit bootstrap (createApp/startServer), imported by server.ts.
WORKDIR /repo/apps/Common/server-kit
COPY apps/Common/server-kit/package.json ./
RUN npm install
COPY apps/Common/server-kit/ ./
WORKDIR /repo/apps/atc
COPY apps/atc/package.json ./
RUN npm install
# server.ts + the DDD layers (compiled) + tsconfig; Web/public is the vendored
# static frontend, not compiled.
COPY apps/atc/ ./
RUN npm run build

# Production stage — compiled JS + static frontend + prod dependencies only.
FROM node:24-alpine
WORKDIR /app
COPY apps/atc/package.json ./
RUN npm install --omit=dev
# Compiled backend and the vendored static frontend it serves (resolved at ./Web/public).
COPY --from=builder /repo/apps/atc/dist ./dist
COPY apps/atc/Web/public ./Web/public

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
