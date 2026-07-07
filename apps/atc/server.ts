import express from "express";
import { join } from "node:path";
import cors from "cors";
import compression from "compression";
import corsOptions from "./lib/config/cors.ts";
import apiRoutes from "./lib/routes/api.ts";
import { createApp, startServer } from "../Common/server-kit/app.ts";

const app = createApp("atc");

// atc proxies api.airplanes.live for the browser, so it needs permissive CORS
// and response compression — the two extras beyond the shared bootstrap.
app.use(cors(corsOptions));
app.use(compression());

// Vendored browser frontend, served with light caching. public/ resolves from
// the app root (cwd) in dev and Docker; express.static serves index.html at "/".
app.use(express.static(join(process.cwd(), "public"), { maxAge: "1d", etag: true }));

app.use("/api", apiRoutes);

startServer(app, {
  name: "atc",
  port: Number(process.env.PORT) || 6001,
  // atc mounts its own cached static above, so disable startServer's default.
  staticDir: null,
});
