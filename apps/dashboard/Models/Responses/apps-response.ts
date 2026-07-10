import type { HealthStatus } from '../../Domain/ValueObjects/health-status.ts'

/** One tile in the /api/apps response: the client-facing fields plus its health. */
export interface AppTile extends HealthStatus {
  name?: string
  url: string | null
  port: number | null
  icon: string | null
  group: string | null
}

/** Body of GET /api/apps. */
export interface AppsResponse {
  title: string
  apps: AppTile[]
}
