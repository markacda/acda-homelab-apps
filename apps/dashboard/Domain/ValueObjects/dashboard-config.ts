import type { AppEntry, AppOverride } from "./app-entry.ts";

export interface Settings {
  title: string;
  hostAddress: string;
  healthCheckIntervalSeconds: number;
  autoDiscover: boolean;
}

export interface DiscoveryConfig {
  requireLabel: boolean;
  ignore: string[];
}

export interface Config {
  settings: Settings;
  discovery: DiscoveryConfig;
  apps: AppEntry[];
  overrides: Record<string, AppOverride>;
}
