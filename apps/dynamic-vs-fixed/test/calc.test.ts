import { test } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { parseHomewizardCsv } from "../lib/parseHomewizardCsv.ts";
import { calculate } from "../lib/calculate.ts";

const ZONE = "Europe/Amsterdam";
const hourKey = (local: string) =>
  DateTime.fromFormat(local, "yyyy-MM-dd HH:mm", { zone: ZONE }).startOf("hour").toMillis();

// Cumulative HomeWizard-style export (T1 = low, T2 = high, plus gas).
const CSV = `Time;Import T1;Import T2;Gas
2025-01-06 00:00;100.0;200.0;500.0
2025-01-06 01:00;100.5;200.0;500.2
2025-01-06 08:00;100.5;201.0;500.2
2025-01-06 09:00;101.0;202.0;500.5`;

test("parser diffs cumulative readings into intervals", () => {
  const parsed = parseHomewizardCsv(CSV);
  assert.equal(parsed.intervals.length, 3);
  assert.equal(parsed.hasTariffSplit, true);
  assert.equal(parsed.hasGas, true);

  const [i0, i1, i2] = parsed.intervals;
  assert.equal(round(i0.kwh, 3), 0.5); // T1 0.5, T2 0
  assert.equal(round(i0.gasM3, 3), 0.2);
  assert.equal(round(i1.kwh, 3), 1.0); // T2 1.0
  assert.equal(round(i2.kwh, 3), 1.5); // T1 0.5 + T2 1.0
  assert.equal(round(i2.gasM3, 3), 0.3);
});

test("calculate matches hand-computed fixed & dynamic totals", () => {
  const parsed = parseHomewizardCsv(CSV);

  const prices = {
    elecByHour: new Map([
      [hourKey("2025-01-06 00:00"), 0.1],
      [hourKey("2025-01-06 01:00"), 0.2],
      [hourKey("2025-01-06 08:00"), 0.05],
    ]),
    gasByDate: new Map([["2025-01-06", 0.3]]),
  };

  const params = {
    fixedDayTariff: 0.4,
    fixedNightTariff: 0.3,
    fixedGasPrice: 1.2,
    elecEnergyTax: 0.1,
    gasEnergyTax: 0.5,
    elecMarkup: 0.02,
    gasMarkup: 0.05,
    vatPct: 21,
    dayStartHour: 7,
    dayEndHour: 23,
    weekendAllNight: true,
    includeGas: true,
  };

  const r = calculate(parsed, prices, params);

  // Fixed: night (0.5+1.0)*0.30 = 0.45 ; day 1.5*0.40 = 0.60 ; gas 0.5*1.20 = 0.60
  assert.equal(r.period.fixedElec, 1.05);
  assert.equal(r.period.fixedGas, 0.6);
  assert.equal(r.period.fixed, 1.65);

  // Dynamic elec: (0.325 + 0.12*3)*1.21 = 0.82885 -> 0.83
  assert.equal(r.period.dynamicElec, 0.83);
  // Dynamic gas: (0.15 + 0.55*0.5)*1.21 = 0.42525*1.21... = 0.51
  assert.equal(r.period.dynamicGas, 0.51);
  assert.equal(r.period.dynamic, 1.34);

  assert.equal(r.period.difference, 0.31);
  assert.equal(r.annual.dynamicCheaper, true);
  assert.equal(r.usage.totalKwh, 3);
  assert.equal(r.usage.kwhNight, 1.5);
  assert.equal(r.usage.kwhDay, 1.5);
  assert.equal(r.coverage.missingElecHours, 0);
});

test("meter reset / negative diff is treated as zero, not negative usage", () => {
  const csv = `Time,Import,Gas
2025-03-01 00:00,10.0,5.0
2025-03-01 00:15,9.0,5.0
2025-03-01 00:30,9.5,5.1`;
  const parsed = parseHomewizardCsv(csv);
  assert.equal(parsed.hasTariffSplit, false);
  assert.equal(parsed.intervals[0].kwh, 0); // 9.0 - 10.0 -> clamped to 0
  assert.equal(round(parsed.intervals[1].kwh, 3), 0.5);
});

function round(n: number, dp: number) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
