import type { DateTime } from 'luxon';

// The domain's view of metered energy usage over a period: a series of intervals
// (each differenced from cumulative meter readings) plus the covered span. How
// the readings arrive (HomeWizard CSV) is an adapter concern; the parser
// produces this shape.

/** One usage interval, starting at `start`, differenced from cumulative readings. */
export interface Interval {
  start: DateTime;
  kwh: number;
  kwhT1: number;
  kwhT2: number;
  gasM3: number;
}

/** Parsed usage the cost calculator consumes. */
export interface UsageData {
  intervals: Interval[];
  hasTariffSplit: boolean;
  hasGas: boolean;
  /** First reading timestamp (start of the covered period). */
  periodStart: DateTime;
  /** Last reading timestamp (end of the covered period). */
  periodEnd: DateTime;
}
