import type { CalcResult } from "../../Domain/ValueObjects/calc-result.ts";
import type { ColumnMapping } from "../../Ports/Homewizard/usage-parser.ts";

/** Body of POST /api/calculate: the comparison result plus parse/coverage metadata. */
export interface CalculateResponse {
  result: CalcResult;
  meta: {
    mapping: ColumnMapping;
    hasGas: boolean;
    rowCount: number;
    skippedRows: number;
    pricePoints: { electricity: number; gas: number };
  };
}
