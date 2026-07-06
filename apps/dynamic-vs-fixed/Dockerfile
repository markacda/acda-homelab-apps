FROM node:24-alpine

WORKDIR /app

# Install dependencies first for better layer caching
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the rest of the app
COPY . .

ENV PORT=6003
ENV DATA_DIR=/app/data
ENV LOG_DIR=/app/logs
EXPOSE 6003

# Create the price-cache and log dirs owned by the non-root "node" user (the base
# image ships this user). A named volume mounted here inherits this ownership on
# first use, so the app can write without running as root.
RUN mkdir -p /app/data /app/logs && chown node:node /app/data /app/logs
USER node

CMD ["node", "server.js"]
