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
// The dashboard tags its health probes with this UA (see apps/dashboard
// lib/health.ts DISCOVERY_UA); we hide those rows unless "Show discovery agent".
const DISCOVERY_UA = "homelab-dashboard-discovery-agent";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

const qEl = $<HTMLInputElement>("q");
const rangeEl = $<HTMLSelectElement>("range");
const autoEl = $<HTMLInputElement>("auto");
const showSelfEl = $<HTMLInputElement>("showSelf");
const showDiscoveryEl = $<HTMLInputElement>("showDiscovery");
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

// ---- checkbox multi-select dropdown --------------------------------------

interface CheckboxDropdown {
  /** Replace the option list, preserving selection (see below for "all"). */
  setOptions(values: string[]): void;
  /** Selected values for the query; empty array means "no filter" (all). */
  selected(): string[];
}

const openDropdowns = new Set<HTMLElement>();
document.addEventListener("click", (ev) => {
  for (const menu of openDropdowns) {
    if (!menu.parentElement!.contains(ev.target as Node)) closeDropdown(menu);
  }
});
function closeDropdown(menu: HTMLElement): void {
  menu.hidden = true;
  openDropdowns.delete(menu);
}

/**
 * Turn a container `<div class="dropdown">` into a checkbox multi-select with a
 * "Select all" master. "All checked" and "none checked" both mean no filter, so
 * `selected()` returns [] in either case; a strict subset returns those values.
 */
function checkboxDropdown(
  container: HTMLElement,
  allLabel: string,
  onChange: () => void,
): CheckboxDropdown {
  let options: string[] = [];
  let checked = new Set<string>();

  const toggle = el("button", { type: "button", class: "dropdown-toggle" }, allLabel);
  const master = el("input", { type: "checkbox" }) as HTMLInputElement;
  const masterLabel = el("label", { class: "dropdown-item master" }, master, "Select all");
  const optionsBox = el("div", { class: "dropdown-options" });
  const menu = el("div", { class: "dropdown-menu" }, masterLabel, optionsBox);
  menu.hidden = true;
  container.replaceChildren(toggle, menu);

  function isAll(): boolean {
    return options.length > 0 && checked.size === options.length;
  }
  function updateSummary(): void {
    toggle.textContent =
      checked.size === 0 || isAll() ? allLabel : `${checked.size} selected`;
    master.checked = isAll();
    master.indeterminate = checked.size > 0 && !isAll();
  }
  function render(): void {
    optionsBox.replaceChildren(
      ...options.map((v) => {
        const box = el("input", { type: "checkbox" }) as HTMLInputElement;
        box.checked = checked.has(v);
        box.addEventListener("change", () => {
          if (box.checked) checked.add(v);
          else checked.delete(v);
          updateSummary();
          onChange();
        });
        return el("label", { class: "dropdown-item" }, box, v);
      }),
    );
    updateSummary();
  }

  toggle.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (menu.hidden) {
      menu.hidden = false;
      openDropdowns.add(menu);
    } else closeDropdown(menu);
  });
  master.addEventListener("change", () => {
    checked = isAll() ? new Set() : new Set(options);
    render();
    onChange();
  });

  return {
    setOptions(values: string[]): void {
      const wasAll = options.length === 0 || isAll();
      options = values;
      checked = wasAll
        ? new Set(values)
        : new Set([...checked].filter((v) => values.includes(v)));
      render();
    },
    selected(): string[] {
      return isAll() ? [] : [...checked];
    },
  };
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
  const apps = appDropdown.selected();
  const methods = methodDropdown.selected();
  const statuses = statusDropdown.selected();
  if (apps.length) p.set("app", apps.join(","));
  if (methods.length) p.set("method", methods.join(","));
  if (statuses.length) p.set("statusClass", statuses.join(","));
  const from = rangeFrom();
  if (from) p.set("from", from);
  // Hide noise by default; the toggles opt back in to seeing it.
  if (!showSelfEl.checked) p.set("excludeApp", "log-viewer");
  if (!showDiscoveryEl.checked) p.set("excludeUa", DISCOVERY_UA);
  return p;
}

// ---- rendering: cards + stat tables ---------------------------------------

function card(label: string, value: string, cls = "", title = ""): HTMLElement {
  const attrs: Record<string, string> = { class: `card ${cls}` };
  if (title) attrs.title = title;
  return el(
    "div",
    attrs,
    el("div", { class: "card-value" }, value),
    el("div", { class: "card-label" }, label),
  );
}

function renderCards(s: Stats): void {
  const c = $("cards");
  const failing = `${s.overall.errorCount.toLocaleString()} of ${s.overall.count.toLocaleString()} requests failed`;
  c.replaceChildren(
    card("Total requests", s.overall.count.toLocaleString()),
    card("Avg response time", fmtMs(s.overall.avgDurationMs)),
    card(
      "Errors (4xx+5xx)",
      String(s.overall.errorCount),
      s.overall.errorCount ? "warn" : "",
      failing,
    ),
    card(
      "Error rate",
      `${(s.overall.errorRate * 100).toFixed(1)}%`,
      s.overall.errorRate ? "warn" : "",
      failing,
    ),
    card("5xx", String(s.overall.count5xx), s.overall.count5xx ? "bad" : ""),
    card("4xx", String(s.overall.count4xx)),
  );
}

/** Build a stat table. `colClasses[i]` (if given) is applied to column i's cells. */
function table(
  headers: string[],
  rows: (string | Node)[][],
  colClasses: string[] = [],
): HTMLElement {
  const thead = el("thead", {}, el("tr", {}, ...headers.map((h) => el("th", {}, h))));
  const tbody = el(
    "tbody",
    {},
    ...rows.map((r) =>
      el(
        "tr",
        {},
        ...r.map((c, i) => {
          const attrs: Record<string, string> = {};
          if (colClasses[i]) attrs.class = colClasses[i];
          // Long URL cells get a hover title so the ellipsized text stays readable.
          if (colClasses[i] === "cell-url" && typeof c === "string") attrs.title = c;
          return el("td", attrs, c);
        }),
      ),
    ),
  );
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
      ["", "", "cell-url", "", ""],
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
      ["", "", "cell-url", "", ""],
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
  appDropdown.setOptions(meta.apps);
  methodDropdown.setOptions(meta.methods);
  $("meta").textContent = `${meta.count.toLocaleString()} entries · updated ${
    meta.lastRefresh ? fmtTs(meta.lastRefresh) : "—"
  }`;
}

// ---- wiring ---------------------------------------------------------------

const appDropdown = checkboxDropdown($("appDropdown"), "All apps", () => refresh());
const methodDropdown = checkboxDropdown($("methodDropdown"), "All methods", () => refresh());
const statusDropdown = checkboxDropdown($("statusDropdown"), "All status", () => refresh());
statusDropdown.setOptions(["2xx", "3xx", "4xx", "5xx"]);

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

for (const control of [rangeEl, showSelfEl, showDiscoveryEl]) {
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
