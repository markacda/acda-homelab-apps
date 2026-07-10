import type { PointQuery } from '../../Domain/ValueObjects/point-query.ts';

/**
 * Port for the upstream airplanes.live APIs. Implemented in the Adapters layer.
 * Both methods return the upstream JSON on success and throw a ProxyError
 * (carrying the status to forward) on any failure.
 */
export interface AirplanesSource {
  /** api.airplanes.live point query for aircraft near a validated point. */
  fetchPoint(query: PointQuery, userAgent?: string): Promise<unknown>;
  /** Pass-through to globe.airplanes.live for the given path. */
  fetchGlobe(path: string, userAgent?: string): Promise<unknown>;
}
