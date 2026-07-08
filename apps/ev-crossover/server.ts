import { join } from "node:path";
import { createApp, startServer } from "../Common/server-kit/app.ts";

// A static calculator page — no API routes and no server-side domain (the whole
// crossover computation runs in the browser; see Web/client/crossover.ts). This
// thin composition root just mounts the access logger (createApp), then serves
// the built client from Web/public and adds /healthz (startServer). See
// ARCHITECTURE.md for why the server DDD layers are omitted here.
const app = createApp("ev-crossover");
startServer(app, {
  name: "ev-crossover",
  port: Number(process.env.PORT) || 6002,
  staticDir: join(process.cwd(), "Web", "public"),
});
