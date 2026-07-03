import express from "express";
import multer from "multer";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseHomewizardCsv } from "./lib/parseHomewizardCsv.js";
import { fetchPriceData } from "./lib/energyzero.js";
import { calculate } from "./lib/calculate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 6003;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // a year of 15-min data is a few MB
});

app.use(express.static(join(__dirname, "public")));

app.post("/api/calculate", upload.single("csv"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No CSV file uploaded." });
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
    res.status(400).json({ error: err.message || "Calculation failed." });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`dynamic-vs-fixed listening on http://0.0.0.0:${PORT}`);
});
