# Built from the repo root so the shared ../../tsconfig.base.json is in context:
#   docker build -f apps/atc/Dockerfile .

# Build stage — compile the TypeScript backend to dist/.
FROM node:24-alpine AS builder
WORKDIR /repo
COPY tsconfig.base.json ./
WORKDIR /repo/apps/atc
COPY apps/atc/package.json ./
RUN npm install
# server/ (compiled) + tsconfig; src/ is static frontend, excluded by tsconfig.
COPY apps/atc/ ./
RUN npm run build

# Production stage — compiled JS + static frontend + prod dependencies only.
FROM node:24-alpine
WORKDIR /app
COPY apps/atc/package.json ./
RUN npm install --omit=dev
# Compiled backend and the static frontend it serves (resolved at ../src).
COPY --from=builder /repo/apps/atc/dist ./dist
COPY apps/atc/src ./src

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
CMD ["node", "dist/index.js"]
