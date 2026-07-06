import express from "express";
import { join } from "node:path";
import { pageLoadLogger } from "../../packages/access-log/logger.ts";

const app = express();
const PORT = Number(process.env.PORT) || 6002;

app.use(pageLoadLogger("ev-crossover"));

app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

// public/ resolves from the app root (cwd) — true both in dev (npm runs from
// the app dir) and in Docker (WORKDIR /app) — so it works whether we run
// server.ts directly or the compiled dist/server.js.
app.use(express.static(join(process.cwd(), "public")));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ev-crossover listening on http://0.0.0.0:${PORT}`);
});
