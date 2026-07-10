import type { DateTime } from 'luxon'
import type { MarketPrices } from '../../Domain/ValueObjects/market-prices.ts'

// Port for the external market-price source (EnergyZero). Implemented in the
// Adapters layer (HTTP client + on-disk month cache).

/** A single price point from the provider. */
export interface PricePoint {
  readingDate: string
  price: number
}

/** The price lookup maps plus coverage counts. */
export interface PriceData extends MarketPrices {
  months: number
  elecPoints: number
  gasPoints: number
}

export interface PriceProvider {
  /** Fetch market prices covering [start, end] and build the lookup maps. */
  fetch(start: DateTime, end: DateTime, opts?: { includeGas?: boolean }): Promise<PriceData>
}
