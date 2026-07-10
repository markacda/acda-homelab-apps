import { DateTime } from 'luxon';
import type { UsageParser, ParseResult } from '../../Ports/Homewizard/usage-parser.ts';
import type { Interval } from '../../Domain/ValueObjects/usage.ts';
import { ValidationError } from '../../Domain/Exceptions/validation-error.ts';

const ZONE = 'Europe/Amsterdam';

// Timestamp formats seen in HomeWizard exports (local Amsterdam time).
const TS_FORMATS = ['yyyy-MM-dd HH:mm:ss', 'yyyy-MM-dd HH:mm', 'yyyy-MM-dd'];

interface ColumnIndices {
  time: number;
  importT1: number;
  importT2: number;
  importTotal: number;
  gas: number;
}

interface Row {
  time: DateTime;
  t1: number | null;
  t2: number | null;
  total: number | null;
  gas: number | null;
}

function detectDelimiter(headerLine: string): string {
  const candidates = [';', ',', '\t'];
  let best = ',';
  let bestCount = -1;
  for (const d of candidates) {
    const count = headerLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

function splitLine(line: string, delimiter: string): string[] {
  // HomeWizard exports are simple (no quoted fields with embedded delimiters),
  // but tolerate optional surrounding quotes.
  return line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
}

function parseTimestamp(raw: string): DateTime | null {
  const value = raw.trim();
  for (const fmt of TS_FORMATS) {
    const dt = DateTime.fromFormat(value, fmt, { zone: ZONE });
    if (dt.isValid) return dt;
  }
  const iso = DateTime.fromISO(value, { zone: ZONE });
  return iso.isValid ? iso : null;
}

function parseNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (s === '') return null;
  // HomeWizard uses '.' as decimal separator, but be defensive: if there is a
  // comma and no dot, treat comma as the decimal separator.
  if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
  else s = s.replace(/,/g, ''); // stray thousands separators
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Classify each header into a logical role.
function classifyColumns(headers: string[]): ColumnIndices {
  const map: ColumnIndices = {
    time: -1,
    importT1: -1,
    importT2: -1,
    importTotal: -1,
    gas: -1,
  };

  headers.forEach((raw, idx) => {
    const h = raw.toLowerCase();
    if (map.time === -1 && /time|date|timestamp|datum|tijd/.test(h)) {
      map.time = idx;
      return;
    }
    if (/water/.test(h)) return; // ignored
    if (/gas/.test(h)) {
      if (map.gas === -1) map.gas = idx;
      return;
    }
    const isExport = /export|terug|feed|delivered|geleverd|opgewekt|productie/.test(h);
    if (isExport) return; // feed-in ignored in v1
    const isImport = /import|verbruik|consum|afgenomen|grid|geimporteerd|geïmporteerd/.test(h);
    if (!isImport) return;
    const isT1 = /t1|laag|low|dal|off.?peak|nacht|night/.test(h);
    const isT2 = /t2|hoog|high|piek|peak|normaal|\bdag\b|\bday\b/.test(h);
    if (isT1) map.importT1 = idx;
    else if (isT2) map.importT2 = idx;
    else if (map.importTotal === -1) map.importTotal = idx;
  });

  // Fallback: if no time column matched, assume the first column is the timestamp.
  if (map.time === -1) map.time = 0;
  return map;
}

/**
 * UsageParser for HomeWizard Energy CSV exports (cumulative meter readings):
 * detect the delimiter/columns and difference consecutive rows into per-interval
 * usage. All parse failures surface as ValidationError (HTTP 400).
 */
export class HomewizardCsvParser implements UsageParser {
  parse(text: string): ParseResult {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      throw new ValidationError('CSV has no data rows.');
    }

    const delimiter = detectDelimiter(lines[0]);
    const headers = splitLine(lines[0], delimiter);
    const map = classifyColumns(headers);

    const hasTariffSplit = map.importT1 !== -1 && map.importT2 !== -1;
    const hasTotal = map.importTotal !== -1;
    if (!hasTariffSplit && !hasTotal) {
      throw new ValidationError('Could not find an electricity import column. Detected headers: ' + headers.join(', '));
    }
    const hasGas = map.gas !== -1;

    // Parse cumulative rows.
    const rows: Row[] = [];
    let skippedRows = 0;
    for (let i = 1; i < lines.length; i++) {
      const cells = splitLine(lines[i], delimiter);
      const time = parseTimestamp(cells[map.time]);
      if (!time) {
        skippedRows++;
        continue;
      }
      rows.push({
        time,
        t1: hasTariffSplit ? parseNumber(cells[map.importT1]) : null,
        t2: hasTariffSplit ? parseNumber(cells[map.importT2]) : null,
        total: hasTotal ? parseNumber(cells[map.importTotal]) : null,
        gas: hasGas ? parseNumber(cells[map.gas]) : null,
      });
    }

    rows.sort((a, b) => a.time.toMillis() - b.time.toMillis());

    // Difference consecutive readings. Usage between row[i-1] and row[i] is
    // attributed to the interval starting at row[i-1].time.
    const diff = (prev: number | null, cur: number | null): number => {
      if (prev == null || cur == null) return 0;
      const d = cur - prev;
      return d >= 0 ? d : 0; // negative => meter reset / gap => skip
    };

    const intervals: Interval[] = [];
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const cur = rows[i];
      let kwhT1 = 0;
      let kwhT2 = 0;
      let kwh = 0;
      if (hasTariffSplit) {
        kwhT1 = diff(prev.t1, cur.t1);
        kwhT2 = diff(prev.t2, cur.t2);
        kwh = kwhT1 + kwhT2;
      } else {
        kwh = diff(prev.total, cur.total);
      }
      const gasM3 = hasGas ? diff(prev.gas, cur.gas) : 0;
      intervals.push({ start: prev.time, kwh, kwhT1, kwhT2, gasM3 });
    }

    if (intervals.length === 0) {
      throw new ValidationError('Not enough rows to compute usage intervals.');
    }

    return {
      intervals,
      hasTariffSplit,
      hasGas,
      mapping: {
        headers,
        time: headers[map.time],
        importT1: map.importT1 === -1 ? null : headers[map.importT1],
        importT2: map.importT2 === -1 ? null : headers[map.importT2],
        importTotal: map.importTotal === -1 ? null : headers[map.importTotal],
        gas: map.gas === -1 ? null : headers[map.gas],
      },
      rowCount: rows.length,
      skippedRows,
      // The covered period runs from the first reading to the LAST reading.
      // intervals[last].start is only the *start* of the final interval, so using
      // it here would drop that interval's duration and under-annualize.
      periodStart: rows[0].time,
      periodEnd: rows[rows.length - 1].time,
    };
  }
}
