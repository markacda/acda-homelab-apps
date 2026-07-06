import express, { type Request, type Response } from "express";
import multer from "multer";
import { join } from "node:path";
import { parseHomewizardCsv } from "./lib/parseHomewizardCsv.ts";
import { fetchPriceData } from "./lib/energyzero.ts";
import { calculate } from "./lib/calculate.ts";
import { pageLoadLogger, installConsoleLogging } from "../../packages/access-log/logger.ts";

// Mirror console.* output into the structured app.log (see log-viewer).
installConsoleLogging("dynamic-vs-fixed");

const app = express();
const PORT = Number(process.env.PORT) || 6003;

app.use(pageLoadLogger("dynamic-vs-fixed"));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // a year of 15-min data is a few MB
});

app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

// public/ resolves from the app root (cwd) — true both in dev (npm runs from
// the app dir) and in Docker (WORKDIR /app) — so it works whether we run
// server.ts directly or the compiled dist/server.js.
app.use(express.static(join(process.cwd(), "public")));

app.post("/api/calculate", upload.single("csv"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No CSV file uploaded." });
      return;
    }
    const params = JSON.parse(req.body.params || "{}");

    const parsed = parseHomewizardCsv(req.file.buffer.toString("utf8"));
    const prices = await fetchPriceData(parsed.periodStart, parsed.periodEnd, {
      includeGas: !!params.includeGas && parsed.hasGas,
    });
    const result = calculate(parsed, prices, params);

    res.json({
      result,
      meta: {
        mapping: parsed.mapping,
        hasGas: parsed.hasGas,
        rowCount: parsed.rowCount,
        skippedRows: parsed.skippedRows,
        pricePoints: { electricity: prices.elecPoints, gas: prices.gasPoints },
      },
    });
  } catch (err) {
    console.error("calculate failed:", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Calculation failed." });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`dynamic-vs-fixed listening on http://0.0.0.0:${PORT}`);
});
