import express from "express";
import type { Express } from "express";
import { join } from "node:path";
import cors from "cors";
import type { CorsOptions } from "cors";
import compression from "compression";
import { HttpAirplanesSource } from "../../Adapters/AirplanesLive/http-airplanes-source.ts";
import { AirplanesController } from "../Controllers/airplanes-controller.ts";
import { errorMapping } from "../Filters/error-mapping.ts";

// atc proxies api.airplanes.live for the browser, so it needs permissive CORS
// and response compression — the two extras beyond the shared bootstrap.
const corsOptions: CorsOptions = {
  origin: (_origin, callback) => callback(null, true),
  credentials: true,
};

/**
 * Composition root: mount CORS/compression, the vendored static frontend, the
 * proxy routes, and the error filter. (server.ts passes staticDir: null so
 * startServer doesn't double-serve.)
 */
export function register(app: Express): void {
  app.use(cors(corsOptions));
  app.use(compression());

  // Vendored browser frontend, served with light caching. Web/public resolves
  // from cwd (app root in dev, /app in Docker); express.static serves index.html
  // at "/".
  app.use(express.static(join(process.cwd(), "Web", "public"), { maxAge: "1d", etag: true }));

  const source = new HttpAirplanesSource();
  const controller = new AirplanesController(source);
  app.use("/api", controller.router);

  app.use(errorMapping());
}
