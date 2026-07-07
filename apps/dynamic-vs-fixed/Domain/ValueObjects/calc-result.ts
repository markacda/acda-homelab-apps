/** One month's fixed-vs-dynamic totals in the comparison result. */
export interface MonthlyRow {
  month: string;
  kwh: number;
  gasM3: number;
  fixed: number;
  dynamic: number;
  difference: number;
}

/** Result of the fixed-vs-dynamic cost comparison. */
export interface CalcResult {
  coverage: {
    periodStart: string | null;
    periodEnd: string | null;
    spanDays: number;
    annualized: boolean;
    annualFactor: number;
    intervals: number;
    missingElecHours: number;
    missingGasDays: number;
  };
  usage: {
    totalKwh: number;
    kwhDay: number;
    kwhNight: number;
    totalGasM3: number;
    includeGas: boolean;
  };
  period: {
    fixed: number;
    dynamic: number;
    difference: number;
    fixedElec: number;
    dynamicElec: number;
    fixedGas: number;
    dynamicGas: number;
  };
  annual: {
    fixed: number;
    dynamic: number;
    difference: number;
    dynamicCheaper: boolean;
    pctVsFixed: number;
  };
  monthly: MonthlyRow[];
}
