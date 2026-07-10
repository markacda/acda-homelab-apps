/** Raw tariff/tax inputs (from the form / JSON body); coerced defensively by the calculator. */
export interface CalcParams {
  fixedDayTariff?: number | string
  fixedNightTariff?: number | string
  fixedGasPrice?: number | string
  elecEnergyTax?: number | string
  gasEnergyTax?: number | string
  elecMarkup?: number | string
  gasMarkup?: number | string
  vatPct?: number | string
  dayStartHour?: number | string
  dayEndHour?: number | string
  weekendAllNight?: boolean
  includeGas?: boolean
}
