import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'
import type { ConfigSource } from '../../Ports/Config/config-source.ts'
import type { Config, Settings, DiscoveryConfig } from '../../Domain/ValueObjects/dashboard-config.ts'
import type { AppEntry, AppOverride } from '../../Domain/ValueObjects/app-entry.ts'

// config/ lives at the app root and is a read-only mounted volume in Docker, so
// resolve it from cwd (the app dir in dev, /app in the container) rather than
// relative to this file — which moves into dist/ once compiled.
const DEFAULT_CONFIG_PATH = join(process.cwd(), 'config', 'config.yaml')

/** Shape of the raw parsed YAML before normalization (everything optional). */
interface RawConfig {
  settings?: Partial<Settings> & Record<string, unknown>
  discovery?: Partial<DiscoveryConfig> & Record<string, unknown>
  apps?: unknown
  overrides?: unknown
}

const DEFAULTS = {
  settings: {
    title: 'Homelab Dashboard',
    hostAddress: 'host.docker.internal',
    healthCheckIntervalSeconds: 30,
    autoDiscover: true,
  } satisfies Settings,
  discovery: {
    requireLabel: false,
    ignore: [] as string[],
  } satisfies DiscoveryConfig,
  apps: [] as AppEntry[],
  overrides: {} as Record<string, AppOverride>,
}

/**
 * ConfigSource that loads and normalizes config.yaml. A missing file is tolerated
 * (defaults are used, i.e. auto-discovery-only mode). Environment variables
 * override the matching settings when present.
 */
export class YamlConfigSource implements ConfigSource {
  private configPath: string

  constructor(configPath: string = process.env.CONFIG_PATH || DEFAULT_CONFIG_PATH) {
    this.configPath = configPath
  }

  load(): Config {
    let raw: RawConfig = {}
    try {
      const text = readFileSync(this.configPath, 'utf8')
      raw = (yaml.load(text) as RawConfig) || {}
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        console.warn(`[config] ${this.configPath} not found — running with defaults (auto-discovery only).`)
      } else {
        console.error(`[config] Failed to read ${this.configPath}: ${(err as Error).message}. Using defaults.`)
      }
    }

    const settings: Settings = { ...DEFAULTS.settings, ...(raw.settings || {}) }
    const discovery: DiscoveryConfig = { ...DEFAULTS.discovery, ...(raw.discovery || {}) }

    // Environment overrides
    if (process.env.HOST_ADDRESS) settings.hostAddress = process.env.HOST_ADDRESS
    if (process.env.TITLE) settings.title = process.env.TITLE
    if (process.env.HEALTH_INTERVAL) {
      const n = Number(process.env.HEALTH_INTERVAL)
      if (Number.isFinite(n) && n > 0) settings.healthCheckIntervalSeconds = n
    }

    // Normalize types
    settings.healthCheckIntervalSeconds = Number(settings.healthCheckIntervalSeconds) || 30
    settings.autoDiscover = settings.autoDiscover !== false
    discovery.requireLabel = discovery.requireLabel === true
    discovery.ignore = Array.isArray(discovery.ignore) ? discovery.ignore.map(String) : []

    const apps = Array.isArray(raw.apps) ? (raw.apps as AppEntry[]) : []
    const overrides = raw.overrides && typeof raw.overrides === 'object' ? (raw.overrides as Record<string, AppOverride>) : {}

    return { settings, discovery, apps, overrides }
  }
}
