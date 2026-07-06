// Vanilla-TS UI for the log viewer. Talks to /api/logs, /api/stats, /api/meta.

interface Entry {
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
}

interface LogsResponse {
  total: number;
  limit: number;
  offset: number;
  lastRefresh: string | null;
  entries: Entry[];
}

interface EndpointStat {
  app: string;
  method: string;
  url: string;
  count: number;
  avgDurationMs: number;
  errorCount: number;
}
interface AppStat {
  app: string;
  count: number;
  avgDurationMs: number;
  errorCount: number;
}
interface Stats {
  overall: {
    count: number;
    avgDurationMs: number;
    errorCount: number;
    count4xx: number;
    count5xx: number;
    errorRate: number;
  };
  perApp: AppStat[];
  perEndpoint: EndpointStat[];
  slowestEndpoints: EndpointStat[];
  statusDistribution: { status: number; count: number }[];
  topIps: { ip: string; count: number }[];
  topUserAgents: { ua: string; count: number }[];
  overTime: { bucket: string; count: number }[];
}
interface Meta {
  apps: string[];
  methods: string[];
  count: number;
  from: string | null;
  to: string | null;
  lastRefresh: string | null;
}

const PAGE = 100;
const AUTO_MS = 7_000;

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

const qEl = $<HTMLInputElement>("q");
const appEl = $<HTMLSelectElement>("app");
const methodEl = $<HTMLSelectElement>("method");
const statusClassEl = $<HTMLSelectElement>("statusClass");
const rangeEl = $<HTMLSelectElement>("range");
const autoEl = $<HTMLInputElement>("auto");
const logBody = $("logBody");
const logMeta = $("logMeta");
const loadMoreBtn = $<HTMLButtonElement>("loadMore");

let sortField = "ts";
let sortDir: "asc" | "desc" = "desc";
let offset = 0;
let total = 0;
let autoTimer: number | undefined;

// ---- small DOM helpers ----------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "title") node.title = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(typeof c === "string" ? document.createTextNode(c) : c);
  return node;
}

function statusClassName(status: number): string {
  if (status >= 500) return "s5";
  if (status >= 400) return "s4";
  if (status >= 300) return "s3";
  return "s2";
}

function fmtTs(ts: string): string {
  const d = new Date(ts);
  return isNaN(d.getTime()) ? ts : d.toLocaleString();
}

function fmtMs(ms: number): string {
  return `${ms} ms`;
}

// ---- query building -------------------------------------------------------

function rangeFrom(): string | null {
  const map: Record<string, number> = {
    "1h": 3600e3,
    "24h": 24 * 3600e3,
    "7d": 7 * 24 * 3600e3,
    "30d": 30 * 24 * 3600e3,
  };
  const ms = map[rangeEl.value];
  return ms ? new Date(Date.now() - ms).toISOString() : null;
}

function baseParams(): URLSearchParams {
  const p = new URLSearchParams();
  if (qEl.value.trim()) p.set("q", qEl.value.trim());
  if (appEl.value) p.set("app", appEl.value);
  if (methodEl.value) p.set("method", methodEl.value);
  if (statusClassEl.value) p.set("statusClass", statusClassEl.value);
  const from = rangeFrom();
  if (from) p.set("from", from);
  return p;
}

// ---- rendering: cards + stat tables ---------------------------------------

function card(label: string, value: string, cls = ""): HTMLElement {
  return el(
    "div",
    { class: `card ${cls}` },
    el("div", { class: "card-value" }, value),
    el("div", { class: "card-label" }, label),
  );
}

function renderCards(s: Stats): void {
  const c = $("cards");
  c.replaceChildren(
    card("Total requests", s.overall.count.toLocaleString()),
    card("Avg response time", fmtMs(s.overall.avgDurationMs)),
    card("Errors (4xx+5xx)", String(s.overall.errorCount), s.overall.errorCount ? "warn" : ""),
    card(
      "Error rate",
      `${(s.overall.errorRate * 100).toFixed(1)}%`,
      s.overall.errorRate ? "warn" : "",
    ),
    card("5xx", String(s.overall.count5xx), s.overall.count5xx ? "bad" : ""),
    card("4xx", String(s.overall.count4xx)),
  );
}

function table(headers: string[], rows: (string | Node)[][]): HTMLElement {
  const thead = el("thead", {}, el("tr", {}, ...headers.map((h) => el("th", {}, h))));
  const tbody = el("tbody", {}, ...rows.map((r) => el("tr", {}, ...r.map((c) => el("td", {}, c)))));
  if (rows.length === 0) return el("p", { class: "empty" }, "No data");
  return el("table", { class: "stat-table" }, thead, tbody);
}

function renderStatTables(s: Stats): void {
  $("perApp").replaceChildren(
    table(
      ["App", "Requests", "Avg ms", "Errors"],
      s.perApp.map((a) => [a.app, String(a.count), String(a.avgDurationMs), String(a.errorCount)]),
    ),
  );
  $("perEndpoint").replaceChildren(
    table(
      ["App", "Method", "URL", "Requests", "Avg ms"],
      s.perEndpoint.map((e) => [e.app, e.method, e.url, String(e.count), String(e.avgDurationMs)]),
    ),
  );
  $("slowest").replaceChildren(
    table(
      ["App", "Method", "URL", "Avg ms", "Requests"],
      s.slowestEndpoints.map((e) => [
        e.app,
        e.method,
        e.url,
        String(e.avgDurationMs),
        String(e.count),
      ]),
    ),
  );
  $("statusDist").replaceChildren(
    table(
      ["Status", "Count"],
      s.statusDistribution.map((d) => [
        el("span", { class: `pill ${statusClassName(d.status)}` }, String(d.status)),
        String(d.count),
      ]),
    ),
  );
}

// ---- rendering: log rows --------------------------------------------------

function logRow(e: Entry): HTMLElement {
  const statusCell = el(
    "td",
    {},
    el("span", { class: `pill ${statusClassName(e.status)}` }, String(e.status)),
  );
  const urlCell = el("td", { class: "url", title: e.url ?? "" }, e.url ?? "");
  const uaCell = el("td", { class: "ua", title: e.ua ?? "" }, e.ua ?? "");
  const row = el(
    "tr",
    { class: e.status >= 400 ? "err" : "" },
    el("td", { class: "ts" }, fmtTs(e.ts)),
    el("td", {}, e.app),
    el("td", {}, e.method ?? ""),
    urlCell,
    statusCell,
    el("td", { class: "dur" }, fmtMs(e.durationMs)),
    el("td", { class: "ip" }, e.ip ?? ""),
    uaCell,
  );
  return row;
}

// ---- data loading ---------------------------------------------------------

async function loadStats(): Promise<void> {
  const res = await fetch(`/api/stats?${baseParams().toString()}`);
  if (!res.ok) return;
  const { stats } = (await res.json()) as { stats: Stats };
  renderCards(stats);
  renderStatTables(stats);
}

async function loadLogs(reset: boolean): Promise<void> {
  if (reset) offset = 0;
  const p = baseParams();
  p.set("sort", `${sortField}:${sortDir}`);
  p.set("limit", String(PAGE));
  p.set("offset", String(offset));
  const res = await fetch(`/api/logs?${p.toString()}`);
  if (!res.ok) {
    logMeta.textContent = `Failed to load logs (HTTP ${res.status})`;
    return;
  }
  const data = (await res.json()) as LogsResponse;
  total = data.total;
  if (reset) logBody.replaceChildren();
  for (const e of data.entries) logBody.append(logRow(e));
  offset += data.entries.length;
  logMeta.textContent = `Showing ${offset.toLocaleString()} of ${total.toLocaleString()}`;
  loadMoreBtn.disabled = offset >= total;
  loadMoreBtn.style.display = offset >= total ? "none" : "";
}

async function refresh(): Promise<void> {
  await Promise.all([loadStats(), loadLogs(true)]);
}

async function loadMeta(): Promise<void> {
  const res = await fetch("/api/meta");
  if (!res.ok) return;
  const meta = (await res.json()) as Meta;
  fillSelect(appEl, meta.apps, "All apps");
  fillSelect(methodEl, meta.methods, "All methods");
  $("meta").textContent = `${meta.count.toLocaleString()} entries · updated ${
    meta.lastRefresh ? fmtTs(meta.lastRefresh) : "—"
  }`;
}

/** Populate a <select> while preserving the current selection if still valid. */
function fillSelect(sel: HTMLSelectElement, values: string[], allLabel: string): void {
  const prev = sel.value;
  sel.replaceChildren(el("option", { value: "" }, allLabel));
  for (const v of values) sel.append(el("option", { value: v }, v));
  if (values.includes(prev)) sel.value = prev;
}

// ---- wiring ---------------------------------------------------------------

function setSort(field: string): void {
  if (sortField === field) sortDir = sortDir === "desc" ? "asc" : "desc";
  else {
    sortField = field;
    sortDir = "desc";
  }
  for (const th of document.querySelectorAll<HTMLElement>("th.sortable")) {
    const active = th.dataset.sort === sortField;
    th.dataset.dir = active ? sortDir : "";
  }
  loadLogs(true);
}

function setupAutoRefresh(): void {
  if (autoEl.checked) {
    autoTimer = window.setInterval(refresh, AUTO_MS);
  } else if (autoTimer !== undefined) {
    clearInterval(autoTimer);
    autoTimer = undefined;
  }
}

for (const control of [appEl, methodEl, statusClassEl, rangeEl]) {
  control.addEventListener("change", () => refresh());
}
let debounce: number | undefined;
qEl.addEventListener("input", () => {
  clearTimeout(debounce);
  debounce = window.setTimeout(() => refresh(), 300);
});
$("refresh").addEventListener("click", () => {
  loadMeta();
  refresh();
});
loadMoreBtn.addEventListener("click", () => loadLogs(false));
autoEl.addEventListener("change", setupAutoRefresh);
for (const th of document.querySelectorAll<HTMLElement>("th.sortable")) {
  th.addEventListener("click", () => setSort(th.dataset.sort!));
}

// initial load
loadMeta();
refresh();
