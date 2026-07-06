import express from "express";
import type { Express } from "express";
import cors from "cors";
import compression from "compression";
import path from "path";
import corsOptions from "./config/cors.ts";
import mainRoutes from "./routes/index.ts";
import apiRoutes from "./routes/api.ts";
import { pageLoadLogger } from "../../../packages/access-log/logger.ts";

const app: Express = express();

// Middleware
// To Do: maybe use helmet middleware for security headers
app.use(pageLoadLogger("atc")); // Structured per-request access logging to a rotating file
app.use(cors(corsOptions));
app.use(compression()); // Compress responses for better performance

// Serve static files from the src directory. Resolve from the app root (cwd) —
// true both in dev (npm runs from the app dir) and in Docker (WORKDIR /app) — so
// it works regardless of where the compiled server.js nests under dist/.
app.use(
  express.static(path.join(process.cwd(), "src"), {
    maxAge: "1d", // Cache static assets for 1 day
    etag: true,
  }),
);

// Routes
app.use("/", mainRoutes);
app.use("/api", apiRoutes);

export default app;
