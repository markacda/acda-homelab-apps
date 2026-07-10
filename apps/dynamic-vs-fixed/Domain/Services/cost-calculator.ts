import { DateTime } from 'luxon'
import type { UsageData } from '../ValueObjects/usage.ts'
import type { MarketPrices } from '../ValueObjects/market-prices.ts'
import type { CalcParams } from '../ValueObjects/tariff-params.ts'
import type { CalcResult, MonthlyRow } from '../ValueObjects/calc-result.ts'

// The core domain service: compare a fixed vs a dynamic (hourly-market) energy
// contract over the metered period. Pure and side-effect free (no I/O), so it is
// straightforward to unit-test. NL tariff conventions (day/night windows,
// weekend-all-night, VAT applied once at the end) live here.

interface ResolvedParams {
  fixedDayTariff: number
  fixedNightTariff: number
  fixedGasPrice: number
  elecEnergyTax: number
  gasEnergyTax: number
  elecMarkup: number
  gasMarkup: number
  vatPct: number
  dayStartHour: number
  dayEndHour: number
  weekendAllNight: boolean
  includeGas: boolean
}

interface MonthBucket {
  fixedElec: number
  dynElecMarket: number
  kwh: number
  fixedGas: number
  dynGasMarket: number
  gasM3: number
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

// Is this interval billed at the DAY (peak) tariff for the fixed contract?
// Default NL convention: day = weekdays 07:00–23:00; nights + weekends = night (dal).
function isDayTariff(dt: DateTime, p: ResolvedParams): boolean {
  const weekday = dt.weekday // 1=Mon .. 7=Sun
  if (p.weekendAllNight && (weekday === 6 || weekday === 7)) return false
  const h = dt.hour
  return h >= p.dayStartHour && h < p.dayEndHour
}

/**
 * Compute fixed vs dynamic contract cost over the usage period.
 */
export function calculate(usage: UsageData, prices: MarketPrices, params: CalcParams): CalcResult {
  const p: ResolvedParams = {
    fixedDayTariff: num(params.fixedDayTariff),
    fixedNightTariff: num(params.fixedNightTariff),
    fixedGasPrice: num(params.fixedGasPrice),
    elecEnergyTax: num(params.elecEnergyTax), // €/kWh excl VAT
    gasEnergyTax: num(params.gasEnergyTax), // €/m³ excl VAT
    elecMarkup: num(params.elecMarkup), // €/kWh excl VAT
    gasMarkup: num(params.gasMarkup), // €/m³ excl VAT
    vatPct: num(params.vatPct),
    dayStartHour: intOr(params.dayStartHour, 7),
    dayEndHour: intOr(params.dayEndHour, 23),
    weekendAllNight: params.weekendAllNight !== false,
    includeGas: !!params.includeGas && usage.hasGas,
  }
  const vat = 1 + p.vatPct / 100

  const avgMarketElec = mean([...prices.elecByHour.values()])
  const avgMarketGas = mean([...prices.gasByDate.values()])

  // Per-month buckets: { fixed, dynamic } all-in euro totals.
  const months = new Map<string, MonthBucket>()
  const bucket = (key: string): MonthBucket => {
    let b = months.get(key)
    if (!b) {
      b = { fixedElec: 0, dynElecMarket: 0, kwh: 0, fixedGas: 0, dynGasMarket: 0, gasM3: 0 }
      months.set(key, b)
    }
    return b
  }

  let totalKwh = 0
  let kwhDay = 0
  let kwhNight = 0
  let totalGasM3 = 0
  let missingElecHours = 0
  let missingGasDays = 0

  for (const iv of usage.intervals) {
    const dt = iv.start
    const monthKey = dt.toFormat('yyyy-MM')
    const b = bucket(monthKey)

    // --- Electricity ---
    const kwh = iv.kwh || 0
    totalKwh += kwh
    b.kwh += kwh

    const day = isDayTariff(dt, p)
    if (day) kwhDay += kwh
    else kwhNight += kwh
    b.fixedElec += kwh * (day ? p.fixedDayTariff : p.fixedNightTariff)

    const hourKey = dt.startOf('hour').toMillis()
    let market = prices.elecByHour.get(hourKey)
    if (market == null) {
      market = avgMarketElec
      missingElecHours++
    }
    b.dynElecMarket += kwh * market

    // --- Gas ---
    if (p.includeGas) {
      const gasM3 = iv.gasM3 || 0
      totalGasM3 += gasM3
      b.gasM3 += gasM3
      b.fixedGas += gasM3 * p.fixedGasPrice
      let gp = prices.gasByDate.get(dt.toFormat('yyyy-MM-dd'))
      if (gp == null) {
        gp = avgMarketGas
        if (gasM3 > 0) missingGasDays++
      }
      b.dynGasMarket += gasM3 * gp
    }
  }

  // Roll monthly buckets up into all-in totals (single ×VAT at the end).
  const monthly: MonthlyRow[] = []
  let fixedElec = 0
  let dynElec = 0
  let fixedGas = 0
  let dynGas = 0

  for (const [key, b] of [...months.entries()].sort()) {
    const fElec = b.fixedElec
    const dElec = (b.dynElecMarket + (p.elecMarkup + p.elecEnergyTax) * b.kwh) * vat
    const fGas = p.includeGas ? b.fixedGas : 0
    const dGas = p.includeGas ? (b.dynGasMarket + (p.gasMarkup + p.gasEnergyTax) * b.gasM3) * vat : 0
    fixedElec += fElec
    dynElec += dElec
    fixedGas += fGas
    dynGas += dGas
    monthly.push({
      month: key,
      kwh: round(b.kwh, 1),
      gasM3: round(b.gasM3, 2),
      fixed: round(fElec + fGas),
      dynamic: round(dElec + dGas),
      difference: round(fElec + fGas - (dElec + dGas)),
    })
  }

  const fixedTotal = fixedElec + fixedGas
  const dynamicTotal = dynElec + dynGas

  // Annualize.
  const start = usage.periodStart
  const end = usage.periodEnd
  const spanDays = Math.max(end.diff(start, 'days').days, 1 / 24)
  const annualFactor = spanDays >= 1 ? 365 / spanDays : 1

  return {
    coverage: {
      periodStart: start.toISO(),
      periodEnd: end.toISO(),
      spanDays: round(spanDays, 1),
      annualized: spanDays < 360 || spanDays > 370,
      annualFactor: round(annualFactor, 4),
      intervals: usage.intervals.length,
      missingElecHours,
      missingGasDays,
    },
    usage: {
      totalKwh: round(totalKwh, 1),
      kwhDay: round(kwhDay, 1),
      kwhNight: round(kwhNight, 1),
      totalGasM3: round(totalGasM3, 2),
      includeGas: p.includeGas,
    },
    period: {
      fixed: round(fixedTotal),
      dynamic: round(dynamicTotal),
      difference: round(fixedTotal - dynamicTotal),
      fixedElec: round(fixedElec),
      dynamicElec: round(dynElec),
      fixedGas: round(fixedGas),
      dynamicGas: round(dynGas),
    },
    annual: {
      fixed: round(fixedTotal * annualFactor),
      dynamic: round(dynamicTotal * annualFactor),
      difference: round((fixedTotal - dynamicTotal) * annualFactor),
      dynamicCheaper: dynamicTotal < fixedTotal,
      pctVsFixed: fixedTotal > 0 ? round(((fixedTotal - dynamicTotal) / fixedTotal) * 100, 1) : 0,
    },
    monthly,
  }
}

function num(v: number | string | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
function intOr(v: number | string | undefined, d: number): number {
  const n = parseInt(String(v), 10)
  return Number.isFinite(n) ? n : d
}
function round(n: number, dp = 2): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}
