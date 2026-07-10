/** The reachability of a dashboard tile's target, with the time it was checked. */
export interface HealthStatus {
  status: 'up' | 'down' | 'unknown'
  lastChecked: string | null
}
