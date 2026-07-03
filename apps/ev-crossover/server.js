import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 6002;

app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

app.use(express.static(join(__dirname, "public")));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ev-crossover listening on http://0.0.0.0:${PORT}`);
});
