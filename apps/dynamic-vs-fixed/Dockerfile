FROM node:20-alpine

WORKDIR /app

# Install dependencies first for better layer caching
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the rest of the app
COPY . .

ENV PORT=6003
ENV DATA_DIR=/app/data
EXPOSE 6003

CMD ["node", "server.js"]
