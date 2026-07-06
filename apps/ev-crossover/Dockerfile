# Built from the repo root so the shared ../../tsconfig.base.json is in context:
#   docker build -f apps/ev-crossover/Dockerfile .

# Build stage — compile the TypeScript server (dist/) and client bundle (public/).
FROM node:24-alpine AS builder
WORKDIR /repo
# Shared base tsconfig that this app's tsconfig extends via ../../.
COPY tsconfig.base.json ./
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

CMD ["node", "dist/server.js"]
