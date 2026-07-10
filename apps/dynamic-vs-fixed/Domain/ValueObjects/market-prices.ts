/** Market price lookups consumed by the cost calculator. */
export interface MarketPrices {
  /** epoch millis of hour start -> €/kWh (excl VAT & tax) */
  elecByHour: Map<number, number>
  /** 'yyyy-MM-dd' (Amsterdam) -> €/m³ (excl VAT & tax) */
  gasByDate: Map<string, number>
}
