import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { AirplanesSource } from '../../Ports/AirplanesLive/airplanes-source.ts';
import type { PointQuery } from '../../Domain/ValueObjects/point-query.ts';

/**
 * AirplanesSource decorator that serves a saved snapshot when the wrapped source
 * fails. On any error from `fetchGlobe` it looks for `<fallbackDir>/<path>`; if a
 * matching JSON file exists it logs the failure and returns the cached body,
 * otherwise it rethrows so the upstream status still propagates. Only pass-through
 * `fetchGlobe` calls are cached — `fetchPoint` is live positional data, so a stale
 * snapshot would be misleading and it delegates without a fallback.
 */
export class FallbackAirplanesSource implements AirplanesSource {
  private inner: AirplanesSource;
  private fallbackDir: string;

  constructor(inner: AirplanesSource, fallbackDir: string) {
    this.inner = inner;
    this.fallbackDir = resolve(fallbackDir);
  }

  fetchPoint(query: PointQuery, userAgent?: string): Promise<unknown> {
    return this.inner.fetchPoint(query, userAgent);
  }

  async fetchGlobe(path: string, userAgent?: string): Promise<unknown> {
    try {
      return await this.inner.fetchGlobe(path, userAgent);
    } catch (error) {
      const fallback = await this.readFallback(path);
      if (fallback === undefined) throw error;
      console.error(
        `[${new Date().toISOString()}] Upstream fetch for "${path}" failed (${error instanceof Error ? error.message : 'unknown error'}); serving cached fallback`
      );
      return fallback;
    }
  }

  /** Read + parse `<fallbackDir>/<path>`, or undefined if absent/invalid/out of bounds. */
  private async readFallback(path: string): Promise<unknown> {
    const file = resolve(this.fallbackDir, path);
    // Guard against `..` traversal escaping the fallback directory.
    if (file !== this.fallbackDir && !file.startsWith(this.fallbackDir + sep)) {
      return undefined;
    }
    try {
      return JSON.parse(await readFile(file, 'utf8'));
    } catch {
      return undefined;
    }
  }
}
