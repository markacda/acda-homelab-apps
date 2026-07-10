/** Port for checking whether a target URL is reachable. Implemented in the Adapters layer. */
export interface HealthProbe {
  /** Any HTTP response (incl. 4xx/5xx) is "up"; a network/timeout error is "down". */
  probe(target: string): Promise<'up' | 'down'>;
}
