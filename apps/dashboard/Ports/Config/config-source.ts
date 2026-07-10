import type { Config } from '../../Domain/ValueObjects/dashboard-config.ts';

/** Port for loading the dashboard configuration. Implemented in the Adapters layer. */
export interface ConfigSource {
  load(): Config;
}
