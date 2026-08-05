import type { StatusClass, LogLevel, ExceptionSource, DependencyType } from './log-entry.ts';

// Sentinel tag value meaning "the entry has no tags at all". Included in a
// `tags` filter to keep untagged entries; sent by the client's "No tag" option.
export const UNTAGGED = '__untagged__';

/** Filter spec for HTTP access-log entries (empty/absent field = match all). */
export interface LogFilter {
  app?: string[]; // match ANY of these app names
  method?: string[]; // match ANY of these methods
  statusClass?: StatusClass[]; // match ANY of these status classes
  status?: number;
  tags?: string[]; // match entries with ANY of these tags (UNTAGGED = no tags)
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
  tags?: string[];
  q?: string; // case-insensitive substring over message
  from?: string;
  to?: string;
  excludeApp?: string[];
}

/** Filter spec for exception records. */
export interface ExceptionFilter {
  app?: string[];
  source?: ExceptionSource[]; // match ANY of these sources
  tags?: string[];
  q?: string; // case-insensitive substring over name/message
  from?: string;
  to?: string;
  excludeApp?: string[];
}

/** Filter spec for outbound-dependency records. */
export interface DependencyFilter {
  app?: string[];
  type?: DependencyType[]; // match ANY of these dependency types
  target?: string[]; // match ANY of these targets
  outcome?: 'success' | 'failure'; // restrict to only successes or only failures
  tags?: string[];
  q?: string; // case-insensitive substring over name/target
  from?: string;
  to?: string;
  excludeApp?: string[];
}
