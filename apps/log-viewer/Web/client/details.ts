// Shared side-sheet detail builders + record shapes for the four log kinds.
// Each view (Requests/Logs/Exceptions/Dependencies) and the trace view render
// the SAME detail sheet for a given record, so the row builders live here rather
// than being duplicated per view. `openDetail` dispatches a tagged trace item to
// the matching builder.

import { el, pill, fmtTs, fmtMs, statusClassName, levelClass, sourceClass, outcomePill } from './dom.ts';
import { openSheet, type SheetRow } from './sheet.ts';

// ---- record shapes (mirror the server @homelab/access-log record types; the
// bundler-less client build cannot import them from apps/Common) --------------

export interface RequestEntry {
  ts: string;
  app: string;
  method: string | null;
  url: string | null;
  status: number;
  durationMs: number;
  ip: string | null;
  ua: string | null;
  referer: string | null;
  bytes: number | null;
  traceId?: string;
  // Present only on non-2xx entries (see @homelab/access-log buildEntry).
  resHeaders?: Record<string, string | number | string[]>;
  resBody?: string;
  resBodyTruncated?: boolean;
}

export interface AppLog {
  ts: string;
  app: string;
  level: string;
  message: string;
  params: unknown[];
  traceId?: string;
}

export interface Exception {
  ts: string;
  app: string;
  name: string;
  message: string;
  stack?: string;
  source: string;
  traceId?: string;
  method?: string;
  url?: string;
  status?: number;
}

export interface Dependency {
  ts: string;
  app: string;
  type: string;
  target: string;
  name: string;
  durationMs: number;
  success: boolean;
  status?: number;
  error?: string;
  traceId?: string;
  command?: string; // full SQL statement for postgres deps (name holds only the verb)
}

/** One record on a trace timeline, tagged with its kind (mirrors the server's TraceItem). */
export type TraceItem =
  | { kind: 'request'; entry: RequestEntry }
  | { kind: 'log'; entry: AppLog }
  | { kind: 'exception'; entry: Exception }
  | { kind: 'dependency'; entry: Dependency };

// ---- trace-id link --------------------------------------------------------

/** A link to the trace view for `traceId` (used in place of plain trace-id text). */
export function traceLink(traceId: string): HTMLAnchorElement {
  return el('a', { href: `#/trace/${encodeURIComponent(traceId)}`, class: 'trace-link' }, traceId);
}

/** The "Trace ID" sheet row: a link when present, an em dash otherwise. */
function traceRow(traceId: string | undefined): SheetRow {
  return { label: 'Trace ID', value: traceId ? traceLink(traceId) : '—', mono: true };
}

// ---- per-kind detail sheets -----------------------------------------------

export function showRequestDetail(e: RequestEntry): void {
  const rows: SheetRow[] = [
    { label: 'Time', value: fmtTs(e.ts) },
    { label: 'App', value: e.app },
    { label: 'Method', value: e.method ?? '—' },
    { label: 'URL', value: e.url ?? '—', mono: true },
    { label: 'Status', value: pill(String(e.status), statusClassName(e.status)) },
    { label: 'Duration', value: fmtMs(e.durationMs) },
    { label: 'IP', value: e.ip ?? '—' },
    { label: 'User-Agent', value: e.ua ?? '—', mono: true },
    { label: 'Referer', value: e.referer ?? '—', mono: true },
    { label: 'Bytes', value: e.bytes === null ? '—' : e.bytes.toLocaleString() },
    traceRow(e.traceId),
  ];
  // Response headers + body are captured only for non-2xx responses.
  if (e.resHeaders) {
    rows.push({ label: 'Response headers', value: fmtHeaders(e.resHeaders), mono: true });
  }
  if (e.resBody !== undefined) {
    const body = e.resBodyTruncated ? `${prettyBody(e.resBody)}\n… (truncated)` : prettyBody(e.resBody);
    rows.push({ label: 'Response body', value: body, mono: true });
  }
  openSheet(`${e.method ?? ''} ${e.url ?? ''}`.trim() || 'Request', rows);
}

export function showLogDetail(e: AppLog): void {
  const rows: SheetRow[] = [
    { label: 'Time', value: fmtTs(e.ts) },
    { label: 'App', value: e.app },
    { label: 'Level', value: pill(e.level, levelClass(e.level)) },
    { label: 'Message', value: e.message, mono: true },
    traceRow(e.traceId),
  ];
  e.params.forEach((p, i) => {
    const value = typeof p === 'string' ? p : JSON.stringify(p, null, 2);
    rows.push({ label: `Param ${i + 1}`, value, mono: true });
  });
  openSheet('Log entry', rows);
}

export function showExceptionDetail(e: Exception): void {
  const rows: SheetRow[] = [
    { label: 'Time', value: fmtTs(e.ts) },
    { label: 'App', value: e.app },
    { label: 'Source', value: pill(e.source, sourceClass(e.source)) },
    { label: 'Name', value: e.name },
    { label: 'Message', value: e.message, mono: true },
  ];
  if (e.method || e.url) rows.push({ label: 'Request', value: `${e.method ?? ''} ${e.url ?? ''}`.trim(), mono: true });
  if (e.status !== undefined) rows.push({ label: 'Status', value: String(e.status) });
  rows.push(traceRow(e.traceId));
  if (e.stack) rows.push({ label: 'Stack', value: e.stack, mono: true });
  openSheet(`${e.name}: ${e.message}`.trim() || 'Exception', rows);
}

export function showDependencyDetail(e: Dependency): void {
  const rows: SheetRow[] = [
    { label: 'Time', value: fmtTs(e.ts) },
    { label: 'App', value: e.app },
    { label: 'Type', value: e.type },
    { label: 'Target', value: e.target, mono: true },
    { label: 'Name', value: e.name, mono: true },
    { label: 'Duration', value: fmtMs(e.durationMs) },
    { label: 'Outcome', value: outcomePill(e.success) },
  ];
  if (e.command) rows.push({ label: 'Query', value: e.command, mono: true });
  if (e.status !== undefined) rows.push({ label: 'Status', value: pill(String(e.status), statusClassName(e.status)) });
  if (e.error) rows.push({ label: 'Error', value: e.error, mono: true });
  rows.push(traceRow(e.traceId));
  openSheet(`${e.type} · ${e.name}`.trim() || 'Dependency', rows);
}

/** Open the detail sheet for a tagged trace item, reusing the per-kind builder. */
export function openDetail(item: TraceItem): void {
  switch (item.kind) {
    case 'request':
      return showRequestDetail(item.entry);
    case 'log':
      return showLogDetail(item.entry);
    case 'exception':
      return showExceptionDetail(item.entry);
    case 'dependency':
      return showDependencyDetail(item.entry);
  }
}

// ---- request-body formatting (request detail only) ------------------------

/** Render a captured response header map as one `key: value` line per header. */
function fmtHeaders(headers: Record<string, string | number | string[]>): string {
  return Object.entries(headers)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join('\n');
}

/** Pretty-print a JSON response body; fall back to the raw text otherwise. */
function prettyBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}
