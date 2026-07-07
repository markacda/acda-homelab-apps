import type { Request, Response } from "express";
import { parseHomewizardCsv } from "./lib/parseHomewizardCsv.ts";
import { fetchPriceData } from "./lib/energyzero.ts";
import { calculate } from "./lib/calculate.ts";
import { createApp, startServer } from "../Common/server-kit/app.ts";
import { memoryUpload } from "../Common/http-utils/upload.ts";

const app = createApp("dynamic-vs-fixed");

const upload = memoryUpload({ fileSizeMB: 25 }); // a year of 15-min data is a few MB

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

startServer(app, { name: "dynamic-vs-fixed", port: Number(process.env.PORT) || 6003 });
