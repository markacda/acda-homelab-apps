import type { StatusClass, LogLevel } from "./log-entry.ts";

/** Filter spec for HTTP access-log entries (empty/absent field = match all). */
export interface LogFilter {
  app?: string[]; // match ANY of these app names
  method?: string[]; // match ANY of these methods
  statusClass?: StatusClass[]; // match ANY of these status classes
  status?: number;
  q?: string; // case-insensitive substring over url/ip/ua/referer
  from?: string; // inclusive ISO lower bound on ts
  to?: string; // inclusive ISO upper bound on ts
  excludeApp?: string[]; // drop entries from these apps (noise filter)
  excludeUa?: string[]; // drop entries with these exact user-agents
}

/** Filter spec for application (console) log entries. */
export interface AppLogFilter {
  app?: string[];
  level?: LogLevel[];
  q?: string; // case-insensitive substring over message
  from?: string;
  to?: string;
  excludeApp?: string[];
}
