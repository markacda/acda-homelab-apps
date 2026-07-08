import { createApp, startServer } from "../Common/server-kit/app.ts";
import { register } from "./Application/Registrations/register.ts";

// Thin composition root: create the app on the shared bootstrap, wire the DDD
// layers via register() (which also mounts CORS/compression + the vendored
// static frontend), then start listening. See ARCHITECTURE.md.
const app = createApp("atc");
register(app);
startServer(app, {
  name: "atc",
  port: Number(process.env.PORT) || 6001,
  // atc mounts its own cached static in register(), so disable startServer's default.
  staticDir: null,
});
