import { createApp, startServer } from "../../packages/server-kit/app.ts";

// No API routes — this app is a static calculator page. createApp mounts the
// access logger; startServer adds /healthz, serves public/, and listens.
const app = createApp("ev-crossover");

startServer(app, { name: "ev-crossover", port: Number(process.env.PORT) || 6002 });
