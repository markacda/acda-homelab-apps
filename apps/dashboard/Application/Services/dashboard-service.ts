import { mergeApps } from '../../Domain/Services/app-merge.ts';
import type { ContainerDiscovery } from '../../Ports/Docker/container-discovery.ts';
import type { Config } from '../../Domain/ValueObjects/dashboard-config.ts';
import type { AppEntry } from '../../Domain/ValueObjects/app-entry.ts';

/** Builds the current tile list by discovering containers and merging with config. */
export class DashboardService {
  private discovery: ContainerDiscovery;
  private config: Config;

  constructor(discovery: ContainerDiscovery, config: Config) {
    this.discovery = discovery;
    this.config = config;
  }

  /** Build the current merged app list (discovery is cheap; re-run per request). */
  async buildApps(): Promise<AppEntry[]> {
    const discovered = await this.discovery.discover(this.config);
    return mergeApps(discovered, this.config);
  }
}
