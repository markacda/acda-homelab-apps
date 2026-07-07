// Constants shared across apps that reason about the access-log format. Kept in
// a separate, dependency-free module (no Node imports) so any server-side code
// can import it without pulling in the logger's filesystem machinery.

// Sent as the User-Agent on the dashboard's outgoing health probes so those
// requests are recognizable in each app's access log (instead of undici's
// default "node"). The log-viewer hides this UA by default.
//
// NOTE: the log-viewer's browser client (apps/log-viewer/client/requests.ts)
// keeps a synced copy of this literal — it is compiled by a separate, bundler-
// less client build (rootDir ./client) and cannot import from packages/. Update
// both if this value ever changes.
export const DISCOVERY_UA = "homelab-dashboard-discovery-agent";
