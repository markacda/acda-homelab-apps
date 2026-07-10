// A dashboard tile — produced by container discovery, by config, or the two
// merged. All fields optional so the merge can build it up from partial sources.
export interface AppEntry {
  source?: string
  containerName?: string
  name?: string
  url?: string | null
  port?: number | null
  icon?: string | null
  group?: string | null
  hidden?: boolean
}

/** Per-container/app override block from config.yaml. */
export type AppOverride = Partial<AppEntry>
