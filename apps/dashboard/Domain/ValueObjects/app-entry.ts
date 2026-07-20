// A dashboard tile — produced by container discovery, by config, or the two
// merged. All fields optional so the merge can build it up from partial sources.
export interface AppEntry {
  source?: string;
  containerName?: string;
  name?: string;
  url?: string | null;
  port?: number | null;
  // Scheme to use when the click-through URL is built from the port ("http" or
  // "https"). Defaults to the browser's current protocol. Set "http" for
  // services that don't speak TLS (e.g. Home Assistant on :8123).
  protocol?: string | null;
  icon?: string | null;
  group?: string | null;
  hidden?: boolean;
}

/** Per-container/app override block from config.yaml. */
export type AppOverride = Partial<AppEntry>;
