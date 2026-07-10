import type { AppEntry } from '../../Domain/ValueObjects/app-entry.ts'
import type { Config } from '../../Domain/ValueObjects/dashboard-config.ts'

/**
 * Port for discovering running apps from the container runtime. Implemented in
 * the Adapters layer (Docker socket). Returns [] when the runtime is unreachable
 * (e.g. local dev without Docker) rather than throwing.
 */
export interface ContainerDiscovery {
  discover(config: Config): Promise<AppEntry[]>
}
