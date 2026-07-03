# Build stage
FROM node:24-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including devDependencies for TypeScript compilation)
RUN npm ci

# Copy TypeScript source files
COPY server ./server

# Build TypeScript to JavaScript
RUN npm run build

# Production stage
FROM node:24-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy compiled JavaScript from build stage
COPY --from=builder /app/dist ./dist

# Copy static frontend files
COPY src ./src

# Expose port 6001
EXPOSE 6001

# Set environment to production
ENV NODE_ENV=production
ENV PORT=6001

# Run as non-root user for security
USER node

# Start the server with compiled JavaScript
CMD ["node", "dist/index.js"]
