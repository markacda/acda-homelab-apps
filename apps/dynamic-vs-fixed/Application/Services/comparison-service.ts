import type { UsageParser } from "../../Ports/Homewizard/usage-parser.ts";
import type { PriceProvider } from "../../Ports/EnergyZero/price-provider.ts";
import type { CalcParams } from "../../Domain/ValueObjects/tariff-params.ts";
import type { CalculateResponse } from "../../Models/Responses/calculate-response.ts";
import { calculate } from "../../Domain/Services/cost-calculator.ts";
import { DomainError } from "../../Domain/Exceptions/domain-error.ts";

/**
 * Orchestrates the calculation pipeline: parse the uploaded usage, fetch the
 * matching market prices, run the cost comparison, and assemble the response.
 * Parse failures surface as 400 (from the parser); a price-lookup failure is
 * wrapped as a 502 so its message reaches the client.
 */
export class ComparisonService {
  private parser: UsageParser;
  private prices: PriceProvider;

  constructor(parser: UsageParser, prices: PriceProvider) {
    this.parser = parser;
    this.prices = prices;
  }

  async compare(csvText: string, params: CalcParams): Promise<CalculateResponse> {
    const usage = this.parser.parse(csvText);
    const includeGas = !!params.includeGas && usage.hasGas;

    let prices;
    try {
      prices = await this.prices.fetch(usage.periodStart, usage.periodEnd, { includeGas });
    } catch (err) {
      throw new DomainError(err instanceof Error ? err.message : "Price lookup failed.", 502);
    }

    const result = calculate(usage, prices, params);
    return {
      result,
      meta: {
        mapping: usage.mapping,
        hasGas: usage.hasGas,
        rowCount: usage.rowCount,
        skippedRows: usage.skippedRows,
        pricePoints: { electricity: prices.elecPoints, gas: prices.gasPoints },
      },
    };
  }
}
