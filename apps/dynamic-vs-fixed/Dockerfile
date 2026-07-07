# Built from the repo root so the shared ../../tsconfig.base.json is in context:
#   docker build -f apps/dynamic-vs-fixed/Dockerfile .

# Build stage — compile the TypeScript server (dist/) and client bundle (public/).
FROM node:24-alpine AS builder
WORKDIR /repo
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
# Shared http-utils helpers (memoryUpload), imported by server.ts.
WORKDIR /repo/packages/http-utils
COPY packages/http-utils/package.json ./
RUN npm install
COPY packages/http-utils/ ./
WORKDIR /repo/apps/dynamic-vs-fixed
COPY apps/dynamic-vs-fixed/package.json ./
RUN npm install
COPY apps/dynamic-vs-fixed/ ./
RUN npm run build

# Production stage — ships compiled JS + prod dependencies only.
FROM node:24-alpine
WORKDIR /app
COPY apps/dynamic-vs-fixed/package.json ./
RUN npm install --omit=dev
COPY --from=builder /repo/apps/dynamic-vs-fixed/dist ./dist
COPY --from=builder /repo/apps/dynamic-vs-fixed/public ./public

ENV PORT=6003
ENV DATA_DIR=/app/data
ENV LOG_DIR=/app/logs
EXPOSE 6003

# Create the price-cache and log dirs owned by the non-root "node" user (the base
# image ships this user). A named volume mounted here inherits this ownership on
# first use, so the app can write without running as root.
RUN mkdir -p /app/data /app/logs && chown node:node /app/data /app/logs
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:6003/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/apps/dynamic-vs-fixed/server.js"]
