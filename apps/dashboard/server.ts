import { join } from "node:path";
import { createApp, startServer } from "../Common/server-kit/app.ts";
import { register } from "./Application/Registrations/register.ts";

// Thin composition root: create the app on the shared bootstrap, wire the DDD
// layers via register(), then start listening and kick off the gated health
// loop. Everything else lives under Domain/ Application/ Adapters/ Ports/
// Models/ Web/ — see ARCHITECTURE.md.
const app = createApp("dashboard");
const { config, startMonitoring } = register(app);
startServer(app, {
  name: "dashboard",
  port: Number(process.env.PORT) || 8080,
  staticDir: join(process.cwd(), "Web", "public"),
  onListen: () => {
    console.log(
      `[server] ${config.settings.title} autoDiscover=${config.settings.autoDiscover} hostAddress=${config.settings.hostAddress}`,
    );
    // Poll on the configured interval, but only probe while a client is watching
    // (see HealthMonitor). No startup probe — it waits for the first client.
    startMonitoring();
  },
});
