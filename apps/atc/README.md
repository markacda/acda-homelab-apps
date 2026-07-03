# ATC Frontend - Aircraft Tracking Application

A web-based aircraft tracking application with real-time data visualization using OpenLayers, jQuery, and integration with airplanes.live API. The backend server is built with **TypeScript** and **Express.js**.

## 📋 Table of Contents

- [Features](#-features)
- [Prerequisites](#-prerequisites)
- [Local Development (Without Docker)](#-local-development-without-docker)
- [TypeScript Development](#-typescript-development)
- [Docker Deployment](#-docker-deployment)
- [Raspberry Pi 5 Deployment](#-raspberry-pi-5-deployment)
- [Configuration](#-configuration)
- [Project Structure](#-project-structure)
- [Useful Commands](#-useful-commands)
- [Troubleshooting](#-troubleshooting)

## ✨ Features

- **TypeScript Backend**: Fully type-safe Express.js server with strict type checking
- Real-time aircraft tracking and visualization
- Interactive map with OpenLayers
- GeoJSON overlays for military zones, airspace boundaries, and refueling areas
- Flight data from airplanes.live API
- Country flag display for aircraft registrations
- Responsive web interface
- CORS-enabled API proxy with request validation
- Compression for optimized performance
- Health check endpoint for monitoring

## 🔧 Prerequisites

### For Local Development
- **Node.js 24+** - [Download here](https://nodejs.org/)
- npm (comes with Node.js)

### For Docker Deployment
- **Docker** - [Install Docker](https://docs.docker.com/get-docker/)
- **Docker Compose** (included with Docker Desktop)

### For Raspberry Pi 5
- Raspberry Pi OS (64-bit recommended)
- Docker installed on Raspberry Pi
- SSH access to Raspberry Pi

## 💻 Local Development (Without Docker)

### 1. Install Dependencies

```bash
npm install
```

This will install both production dependencies and development dependencies (TypeScript, type definitions, etc.).

### 2. Build the TypeScript Server

```bash
npm run build
```

This compiles TypeScript files from `server/` to JavaScript in `dist/`.

### 3. Start the Server

**Option A: Run Compiled JavaScript**
```bash
npm start
```

**Option B: Run TypeScript Directly (Development)**
```bash
npm run dev
```

**Option C: Run with Auto-Reload (Recommended for Development)**
```bash
npm run dev:watch
```

This will automatically restart the server when you make changes to TypeScript files.

### 4. Access the Application

- Default: `http://localhost:8080`

#### Running on a Different Port

If you want to use a different port:

**Set environment variable**
```bash
# Windows
set PORT=3000 && npm start

# Linux/Mac
PORT=3000 npm start
```

Then access at `http://localhost:3000`

### 5. Verify Node Version

Check your Node.js version (must be 24+):
```bash
node --version
```

## 🔷 TypeScript Development

The server is written in **TypeScript** for improved type safety and developer experience.

### Project Structure

```
server/
├── config/
│   └── cors.ts              # CORS configuration
├── controllers/
│   └── airplanes.controller.ts  # API controllers
├── routes/
│   ├── api.ts               # API routes
│   └── index.ts             # Main routes
├── app.ts                   # Express app setup
└── index.ts                 # Server entry point
```

### Development Workflow

1. **Edit TypeScript files** in the `server/` directory
2. **Auto-compile and run** with `npm run dev:watch`
3. **Build for production** with `npm run build`
4. **Test production build** with `npm start`

### TypeScript Configuration

The project uses strict TypeScript settings defined in `tsconfig.json`:
- **Target**: ES2022
- **Module**: CommonJS
- **Strict Mode**: Enabled
- **Source Maps**: Generated for debugging
- **Output**: `dist/` directory

### Available Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Run server with ts-node (no compilation)
- `npm run dev:watch` - Run with auto-reload on file changes
- `npm start` - Run compiled JavaScript from dist/
- `npm run clean` - Remove dist/ directory

### Type Definitions

All Express types are included via `@types/express`, `@types/node`, `@types/cors`, `@types/compression`, and `@types/morgan`.

## 🐳 Docker Deployment

The Dockerfile uses a **multi-stage build** to compile TypeScript in a build stage and run the compiled JavaScript in a lightweight production image.

### Build and Run with Docker Compose

```bash
# Build the image
docker compose build

# Start the container
docker compose up -d

# View logs
docker compose logs -f
```

### Multi-Stage Build Process

1. **Builder Stage**: Installs all dependencies and compiles TypeScript
2. **Production Stage**: Copies only compiled JavaScript and production dependencies

This approach results in a smaller, more secure production image.

### Access the Application

```
http://localhost:6001
```

The container listens on port `8080` internally, which `docker-compose.yml` maps to host port `6001` (chosen to avoid conflicts on a Raspberry Pi running Home Assistant). On the Pi, access it at `http://<pi-ip>:6001`.

### Stop the Container

```bash
docker compose down
```

### Automated Deployment Scripts

For quick deployment, use the provided scripts that automatically pull the latest code, rebuild, and restart:

**Linux/Mac:**
```bash
./deploy.sh
```

This script can be made executable with the following command:
```bash
chmod +x deploy.sh
```

These scripts execute:
1. `git pull` - Pull latest changes
2. `docker compose build` - Build the image
3. `docker compose up -d` - Start container in detached mode

## 🥧 Raspberry Pi 5 Deployment

### 1. Transfer Files to Raspberry Pi

From your development machine:

```bash
# Using SCP
scp -r * pi@<raspberry-pi-ip>:~/atc/

# Or using rsync (excludes node_modules)
rsync -av --exclude 'node_modules' . pi@<raspberry-pi-ip>:~/atc/
```

### 2. SSH into Raspberry Pi

```bash
ssh pi@<raspberry-pi-ip>
```

### 3. Build and Deploy

```bash
cd ~/atc

# Build the Docker image (ARM64 optimized) and start the container
./deploy.sh

# Check status
docker compose ps
docker compose logs -f
```

### 4. Access Your Application

```
http://<raspberry-pi-ip>
```

### 5. Enable Auto-Start on Boot (Optional)

The container is configured with `restart: unless-stopped`, so it will automatically start on reboot.

To ensure Docker starts on boot:

```bash
sudo systemctl enable docker
```

## ⚙️ Configuration

### Environment Variables

The following environment variables can be configured:

- `PORT` - Server port (default: 8080)
- `NODE_ENV` - Environment mode (default: production)

### Docker Resource Limits

In `docker-compose.yml`, you can adjust resource limits:

```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 512M
    reservations:
      cpus: '0.5'
      memory: 128M
```

### CORS Configuration

The server is configured to allow CORS for `api.airplanes.live`. To modify CORS settings, edit `server/config/cors.ts`:

```typescript
import { CorsOptions } from 'cors';

const corsOptions: CorsOptions = {
  origin: function (origin, callback) {
    // Add your custom logic here
    callback(null, true);
  },
  credentials: true
};

export default corsOptions;
```

### API Proxy

The application includes a built-in proxy for `api.airplanes.live` API calls with full TypeScript type safety:

- **Endpoint**: `GET /api/airplanes/:lat/:lon/:radius`
- **Purpose**: Proxies requests to `https://api.airplanes.live/v2/point/:lat/:lon/:radius`
- **Implementation**: `server/controllers/airplanes.controller.ts`
- **Benefits**:
  - Type-safe request/response handling
  - Centralizes API calls through your server
  - Request parameter validation with TypeScript
  - Easier to manage API keys or rate limiting if needed
  - Enables server-side logging and monitoring
  - Works around CORS restrictions if any

**Example**:
```
GET http://localhost:8080/api/airplanes/51.9082/-3.1966/50
```

This will fetch aircraft data for:
- Latitude: 51.9082
- Longitude: -3.1966
- Radius: 50 nautical miles

**Validation**:
- Latitude: -90 to 90
- Longitude: -180 to 180
- Radius: 1 to 250 nautical miles

The frontend automatically uses this proxy endpoint for all API calls.

## 📁 Project Structure

```
atc/
├── server/                    # TypeScript backend source
│   ├── config/
│   │   └── cors.ts           # CORS configuration with types
│   ├── controllers/
│   │   └── airplanes.controller.ts  # API controllers
│   ├── routes/
│   │   ├── api.ts            # API routes
│   │   └── index.ts          # Main routes
│   ├── app.ts                # Express app setup
│   └── index.ts              # Server entry point
├── dist/                      # Compiled JavaScript (generated by build)
│   ├── config/
│   ├── controllers/
│   ├── routes/
│   ├── app.js
│   └── index.js
├── src/                       # Static frontend files
│   ├── index.html            # Main HTML page
│   ├── script.js             # Main application logic
│   ├── style.css             # Styles
│   ├── config.js             # Configuration
│   ├── planeObject.js        # Plane data model
│   ├── libs/                 # Third-party libraries (OpenLayers, jQuery)
│   ├── images/               # Images and icons
│   ├── geojson/              # GeoJSON map overlays
│   └── flags/                # Country flags
├── tsconfig.json              # TypeScript configuration
├── nodemon.json               # Nodemon configuration for auto-reload
├── package.json               # Node.js dependencies and scripts
├── Dockerfile                 # Multi-stage Docker build
├── docker-compose.yml         # Docker Compose configuration
└── .dockerignore              # Docker ignore rules
```

### Key Directories

- **`server/`** - TypeScript source code for the backend
- **`dist/`** - Compiled JavaScript (gitignored, generated by `npm run build`)
- **`src/`** - Frontend static files served by Express
- **`node_modules/`** - Dependencies (gitignored)

## 🛠️ Useful Commands

### TypeScript Commands

```bash
# Build TypeScript to JavaScript
npm run build

# Run with TypeScript directly (no build needed)
npm run dev

# Run with auto-reload on file changes
npm run dev:watch

# Clean build artifacts
npm run clean

# Type-check without building
npx tsc --noEmit
```

### Docker Commands

```bash
# View running containers
docker compose ps

# View logs
docker compose logs -f

# Restart container
docker compose restart

# Stop container
docker compose down

# Rebuild and restart
docker compose up -d --build

# Remove container and image
docker compose down --rmi all
```

### Local Development Commands

```bash
# Install dependencies
npm install

# Start server
npm start

# Check Node version
node --version

# Check for vulnerabilities
npm audit
```

### Raspberry Pi Commands

```bash
# Check Docker status
sudo systemctl status docker

# View Docker resource usage
docker stats

# Free up disk space
docker system prune -a

# View Raspberry Pi temperature
vcgencmd measure_temp
```

## 🔍 Troubleshooting

### Docker Build Fails on Raspberry Pi

**Problem**: ARM64 compatibility issues.

**Solution**: The Dockerfile uses `node:24-alpine` which supports ARM64. Ensure your Raspberry Pi is running 64-bit OS:
```bash
uname -m  # Should show "aarch64"
```

### Container Won't Start

**Problem**: Port already in use.

**Solution**: Check what's using the host port 6001:
```bash
# Linux/Mac
sudo lsof -i :6001

# Windows
netstat -ano | findstr :6001
```

### API Requests Blocked by CORS

**Problem**: Requests to external APIs are blocked.

**Solution**: The server includes CORS middleware. Ensure `server/config/cors.ts` has proper CORS configuration for your API endpoints.

### TypeScript Compilation Errors

**Problem**: Build fails with TypeScript errors.

**Solution**:
```bash
# Check TypeScript version
npx tsc --version

# Run type-check only (no build)
npx tsc --noEmit

# Clean and rebuild
npm run clean && npm run build
```

### Development Server Won't Start

**Problem**: `npm run dev` or `npm run dev:watch` fails.

**Solution**:
1. Ensure all dependencies are installed: `npm install`
2. Check if TypeScript files have syntax errors
3. Verify `ts-node` is installed: `npm list ts-node`
4. Try running with compiled JavaScript instead: `npm run build && npm start`

### Missing Type Definitions

**Problem**: TypeScript can't find types for installed packages.

**Solution**:
```bash
# Install missing type definitions
npm install --save-dev @types/packagename

# For example:
npm install --save-dev @types/express @types/node
```

### High Memory Usage on Raspberry Pi

**Problem**: Container uses too much memory.

**Solution**: Adjust limits in `docker-compose.yml`:
```yaml
resources:
  limits:
    memory: 256M  # Reduce from 512M
```

### Cannot Connect to Application

**Problem**: Application not accessible from network.

**Solution**:
1. Check if container is running: `docker compose ps`
2. Check firewall rules
3. Ensure correct IP address
4. Verify port mapping in `docker-compose.yml`

## 📊 Performance Tips

### General

1. **Use production builds**: Always run `npm run build` before deploying to production
2. **TypeScript overhead**: Development mode (`npm run dev`) uses ts-node which is slower - use compiled JavaScript in production
3. **Enable compression**: Already configured in `server/app.ts`
4. **Cache static assets**: Configured with 1-day cache in Express static middleware
5. **Monitor build times**: Multi-stage Docker builds compile TypeScript only once during image creation

### For Raspberry Pi 5

1. **Use Docker instead of local Node**: Docker provides better isolation and resource management
2. **Pre-compile TypeScript**: The Docker image includes pre-compiled JavaScript for faster startup
3. **Monitor resources**: Use `docker stats` to monitor CPU/memory usage
4. **Keep system updated**: Regularly update Raspberry Pi OS and Docker

## 🔒 Security Considerations

- **TypeScript Type Safety**: Compile-time type checking prevents common runtime errors
- **Request Validation**: Strict parameter validation in API controllers
- Container runs as non-root user (`USER node` in Dockerfile)
- Static file serving with no code execution
- CORS configured for specific domains
- Health check endpoint for monitoring
- Resource limits prevent resource exhaustion

## 📝 License

[Add your license information here]

## 🚀 Recent Updates

### TypeScript Migration

The backend server has been fully migrated to TypeScript for improved:
- **Type Safety**: Catch errors at compile time instead of runtime
- **Developer Experience**: Better IDE autocompletion and inline documentation
- **Code Quality**: Enforced strict typing and best practices
- **Maintainability**: Easier refactoring and codebase navigation

All server code is now written in TypeScript with full type definitions for Express, Node.js, and all middleware.

## 📋 Roadmap / TODO

### ATC Professional Features

- [ ] **History dots instead of continuous trails** - Display discrete position dots at time intervals (e.g., every 10 seconds) instead of continuous lines for more ATC-like visualization
- [ ] **Approach centerlines overlays** - Add ILS localizer centerlines, runway extended centerlines, and final approach courses for major Dutch airports (EHAM, EHRD, EHEH)
- [ ] **Sector boundaries display** - Add airspace sector boundaries with sector names/codes and control frequencies (Amsterdam FIR, ACC sectors, Schiphol TMA)
- [ ] **Conflict Alert / STCA (Short-Term Conflict Alert)** - Implement automated alerts when two aircraft are predicted to violate separation minima (5 NM horizontal, 1000/2000 ft vertical)
- [ ] **Situation Display Modes** - Add filtering modes: Normal (all traffic), Arrival (inbound only), Departure (outbound only), Overflights (transit), Emergency (7700/7600/7500 priority)

## 🤝 Contributing

[Add contribution guidelines here]

## 📧 Contact

[Add contact information here]
