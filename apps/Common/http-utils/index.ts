// Shared, dependency-free request/response helpers extracted from the apps'
// server.ts files, where each had re-implemented the same query/body coercion.
// The multer-backed upload factory lives in ./upload.ts so apps that only need
// these pure helpers (e.g. log-viewer) don't pull multer into their runtime.

/** First string value of a query param (unwraps a repeated param), or undefined. */
export function firstStr(v: unknown): string | undefined {
  if (Array.isArray(v)) v = v[0];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** A trimmed non-empty string, or undefined. */
export function optStr(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Split a comma-separated query param into a de-duped, non-empty, trimmed array. */
export function csvList(v: unknown): string[] {
  const raw = firstStr(v);
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    ),
  ];
}

/** Coerce a body value (string[] or newline-separated string) to a trimmed string[]. */
export function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
  }
  if (typeof v === 'string') {
    return v
      .split(/\r?\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Parse a value to an integer, clamped to [min, max]. A non-numeric or zero
 * value falls back to `fallback` (before clamping). `max` is optional.
 */
export function clampInt(value: unknown, opts: { min: number; max?: number; fallback: number }): number {
  const n = Number(value) || opts.fallback;
  const lowerBounded = Math.max(n, opts.min);
  return opts.max === undefined ? lowerBounded : Math.min(lowerBounded, opts.max);
}
