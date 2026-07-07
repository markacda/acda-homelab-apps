import { Router } from "express";
import { memoryUpload } from "../../../Common/http-utils/upload.ts";
import { ComparisonService } from "../Services/comparison-service.ts";
import { parseCalcParams } from "../Mappers/calc-params-mapper.ts";
import { ValidationError } from "../../Domain/Exceptions/validation-error.ts";

// HTTP surface for the cost comparison: a single multipart POST /api/calculate
// (CSV file + params JSON). Thin — parse via the mapper, delegate to the service,
// and let thrown DomainErrors flow to the error-mapping filter.
export class CalculationController {
  readonly router: Router;
  private comparison: ComparisonService;

  constructor(comparison: ComparisonService) {
    this.comparison = comparison;
    const upload = memoryUpload({ fileSizeMB: 25 }); // a year of 15-min data is a few MB
    const router = Router();

    router.post("/calculate", upload.single("csv"), async (req, res) => {
      if (!req.file) throw new ValidationError("No CSV file uploaded.");
      const params = parseCalcParams(req.body?.params);
      const response = await this.comparison.compare(req.file.buffer.toString("utf8"), params);
      res.json(response);
    });

    this.router = router;
  }
}
