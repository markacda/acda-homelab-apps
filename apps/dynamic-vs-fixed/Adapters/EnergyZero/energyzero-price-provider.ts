import { DateTime } from 'luxon';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PriceProvider, PriceData, PricePoint } from '../../Ports/EnergyZero/price-provider.ts';

const ZONE = 'Europe/Amsterdam';
const BASE = 'https://api.energyzero.nl/v1/energyprices';
const USAGE = { electricity: 1, gas: 4 };

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

function cachePath(usageType: number, ym: string): string {
  return join(DATA_DIR, `prices_${usageType}_${ym}.json`);
}

async function readCache(usageType: number, ym: string): Promise<PricePoint[] | null> {
  try {
    const raw = await readFile(cachePath(usageType, ym), 'utf8');
    return JSON.parse(raw) as PricePoint[];
  } catch {
    return null;
  }
}

async function writeCache(usageType: number, ym: string, prices: PricePoint[]): Promise<void> {
  try {
    await ensureDataDir();
    await writeFile(cachePath(usageType, ym), JSON.stringify(prices), 'utf8');
  } catch {
    /* cache is best-effort; ignore write failures */
  }
}

// Fetch the raw Prices array for one calendar month (Amsterdam) and usage type.
async function fetchMonth(usageType: number, monthStart: DateTime): Promise<PricePoint[]> {
  const from = monthStart.startOf('month');
  const till = monthStart.endOf('month');
  const url =
    `${BASE}?fromDate=${encodeURIComponent(from.toUTC().toISO() ?? '')}` +
    `&tillDate=${encodeURIComponent(till.toUTC().toISO() ?? '')}` +
    `&interval=4&usageType=${usageType}&inclBtw=false`;

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`EnergyZero request failed (${res.status}) for ${url}`);
  }
  const body = (await res.json()) as { Prices?: unknown };
  return Array.isArray(body?.Prices) ? (body.Prices as PricePoint[]) : [];
}

async function getMonth(usageType: number, monthStart: DateTime, now: DateTime): Promise<PricePoint[]> {
  const ym = monthStart.toFormat('yyyy-MM');
  const cached = await readCache(usageType, ym);
  if (cached) return cached;

  const prices = await fetchMonth(usageType, monthStart);

  // Only cache complete (fully past) months; a partial current month may still change.
  if (monthStart.endOf('month') < now && prices.length > 0) {
    await writeCache(usageType, ym, prices);
  }
  return prices;
}

function* monthsBetween(startDT: DateTime, endDT: DateTime): Generator<DateTime> {
  let cursor = startDT.startOf('month');
  const last = endDT.startOf('month');
  while (cursor <= last) {
    yield cursor;
    cursor = cursor.plus({ months: 1 });
  }
}

/**
 * PriceProvider backed by the EnergyZero public API, caching each completed
 * month's prices under DATA_DIR. Builds the lookup maps the calculator needs:
 *   elecByHour: Map<epochMillisOfHourStart, €/kWh (excl VAT & tax)>
 *   gasByDate:  Map<'yyyy-MM-dd' (Amsterdam), €/m³ (excl VAT & tax)>
 */
export class EnergyZeroPriceProvider implements PriceProvider {
  async fetch(startDT: DateTime, endDT: DateTime, { includeGas }: { includeGas?: boolean } = {}): Promise<PriceData> {
    const now = DateTime.now().setZone(ZONE);
    const months = [...monthsBetween(startDT, endDT)];

    const elecByHour = new Map<number, number>();
    const gasByDate = new Map<string, number>();

    for (const m of months) {
      const elec = await getMonth(USAGE.electricity, m, now);
      for (const point of elec) {
        const dt = DateTime.fromISO(point.readingDate, { zone: 'utc' });
        if (dt.isValid) elecByHour.set(dt.startOf('hour').toMillis(), point.price);
      }
      if (includeGas) {
        const gas = await getMonth(USAGE.gas, m, now);
        for (const point of gas) {
          const dt = DateTime.fromISO(point.readingDate, { zone: 'utc' }).setZone(ZONE);
          if (dt.isValid) {
            const key = dt.toFormat('yyyy-MM-dd');
            if (!gasByDate.has(key)) gasByDate.set(key, point.price);
          }
        }
      }
    }

    return {
      elecByHour,
      gasByDate,
      months: months.length,
      elecPoints: elecByHour.size,
      gasPoints: gasByDate.size,
    };
  }
}
