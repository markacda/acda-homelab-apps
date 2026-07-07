// The log record shapes are owned by the shared @homelab/access-log package (the
// format every app writes). log-viewer's domain re-uses them as its core value
// objects and adds the small classifications it reasons about.
export type { AccessLogEntry, AppLogEntry, LogLevel } from "../../../Common/access-log/logger.ts";

/** HTTP status grouped into its class. */
export type StatusClass = "2xx" | "3xx" | "4xx" | "5xx";

/** The three visual bands the app-log chart groups the five console levels into. */
export type LogBand = "error" | "warn" | "info";
