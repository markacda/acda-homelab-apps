// The Requests view: browse, filter and aggregate HTTP access-log entries.
// Talks to /api/logs, /api/stats, /api/meta.

import { el, card, table, pill, checkboxDropdown, statusClassName, fmtTs, fmtMs } from "./dom.ts";
import { openSheet } from "./sheet.ts";

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
// The dashboard tags its health probes with this UA; we hide those rows unless
// "Show discovery agent". Canonical source: @homelab/access-log constants.ts
// (DISCOVERY_UA). This is a synced copy — the client build is bundler-less and
// cannot import from packages/, so keep the two in step if the value changes.
const DISCOVERY_UA = "homelab-dashboard-discovery-agent";

/** Mount the Requests view into `root`. Returns a teardown to stop its timer. */
export function mountRequests(root: HTMLElement): () => void {
  // ---- build the view markup ---------------------------------------------
  const cardsEl = el("section", { class: "cards" });

  const perAppEl = el("div", { class: "table-wrap" });
  const perEndpointEl = el("div", { class: "table-wrap" });
  const slowestEl = el("div", { class: "table-wrap" });
  const statusDistEl = el("div", { class: "table-wrap" });
  const panels = el(
    "section",
    { class: "panels" },
    panel("Requests per app", perAppEl),
    panel("Top endpoints", perEndpointEl),
    panel("Slowest endpoints", slowestEl),
    panel("Status codes", statusDistEl),
  );

  const qEl = el("input", {
    id: "q",
    type: "search",
    placeholder: "Search url / ip / user-agent…",
  }) as HTMLInputElement;
  const appDropdownEl = el("div", { class: "dropdown" });
  const methodDropdownEl = el("div", { class: "dropdown" });
  const statusDropdownEl = el("div", { class: "dropdown" });
  const rangeEl = rangeSelect();
  const refreshBtn = el("button", { type: "button" }, "Refresh");
  const autoEl = el("input", { type: "checkbox" }) as HTMLInputElement;
  const showSelfEl = el("input", { type: "checkbox" }) as HTMLInputElement;
  const showDiscoveryEl = el("input", { type: "checkbox" }) as HTMLInputElement;
  const filters = el(
    "section",
    { class: "filters" },
    qEl,
    appDropdownEl,
    methodDropdownEl,
    statusDropdownEl,
    rangeEl,
    refreshBtn,
    el("label", { class: "toggle" }, autoEl, "Auto-refresh"),
    el("label", { class: "toggle" }, showSelfEl, "Show log-viewer logs"),
    el("label", { class: "toggle" }, showDiscoveryEl, "Show discovery agent"),
  );

  const logBody = el("tbody");
  const loadMoreBtn = el("button", { type: "button" }, "Load more") as HTMLButtonElement;
  const logMetaEl = el("span", { class: "meta" });
  const logsSection = el(
    "section",
    { class: "logs" },
    el(
      "table",
      { class: "log-table" },
      el(
        "thead",
        {},
        el(
          "tr",
          {},
          sortableTh("Time", "ts"),
          sortableTh("App", "app"),
          el("th", {}, "Method"),
          el("th", {}, "URL"),
          sortableTh("Status", "status"),
          sortableTh("Duration", "durationMs"),
          el("th", {}, "IP"),
          el("th", {}, "User-Agent"),
        ),
      ),
      logBody,
    ),
    el("div", { class: "loadmore" }, loadMoreBtn, logMetaEl),
  );

  const metaEl = el("span", { class: "meta" });
  root.replaceChildren(
    el("div", { class: "view-head" }, el("h2", { class: "view-title" }, "Requests"), metaEl),
    cardsEl,
    panels,
    filters,
    logsSection,
  );

  // ---- state --------------------------------------------------------------
  let sortField = "ts";
  let sortDir: "asc" | "desc" = "desc";
  let offset = 0;
  let total = 0;
  let autoTimer: number | undefined;

  const appDropdown = checkboxDropdown(appDropdownEl, "All apps", () => refresh());
  const methodDropdown = checkboxDropdown(methodDropdownEl, "All methods", () => refresh());
  const statusDropdown = checkboxDropdown(statusDropdownEl, "All status", () => refresh());
  statusDropdown.setOptions(["2xx", "3xx", "4xx", "5xx"]);

  // ---- query building -----------------------------------------------------
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

  // ---- rendering ----------------------------------------------------------
  function renderCards(s: Stats): void {
    const failing = `${s.overall.errorCount.toLocaleString()} of ${s.overall.count.toLocaleString()} requests failed`;
    cardsEl.replaceChildren(
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
  function renderStatTables(s: Stats): void {
    perAppEl.replaceChildren(
      table(
        ["App", "Requests", "Avg ms", "Errors"],
        s.perApp.map((a) => [
          a.app,
          String(a.count),
          String(a.avgDurationMs),
          String(a.errorCount),
        ]),
      ),
    );
    perEndpointEl.replaceChildren(
      table(
        ["App", "Method", "URL", "Requests", "Avg ms"],
        s.perEndpoint.map((e) => [
          e.app,
          e.method,
          e.url,
          String(e.count),
          String(e.avgDurationMs),
        ]),
        ["", "", "cell-url", "", ""],
      ),
    );
    slowestEl.replaceChildren(
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
    statusDistEl.replaceChildren(
      table(
        ["Status", "Count"],
        s.statusDistribution.map((d) => [
          pill(String(d.status), statusClassName(d.status)),
          String(d.count),
        ]),
      ),
    );
  }

  function showDetail(e: Entry): void {
    openSheet(`${e.method ?? ""} ${e.url ?? ""}`.trim() || "Request", [
      { label: "Time", value: fmtTs(e.ts) },
      { label: "App", value: e.app },
      { label: "Method", value: e.method ?? "—" },
      { label: "URL", value: e.url ?? "—", mono: true },
      { label: "Status", value: pill(String(e.status), statusClassName(e.status)) },
      { label: "Duration", value: fmtMs(e.durationMs) },
      { label: "IP", value: e.ip ?? "—" },
      { label: "User-Agent", value: e.ua ?? "—", mono: true },
      { label: "Referer", value: e.referer ?? "—", mono: true },
      { label: "Bytes", value: e.bytes === null ? "—" : e.bytes.toLocaleString() },
    ]);
  }

  function logRow(e: Entry): HTMLElement {
    const row = el(
      "tr",
      { class: e.status >= 400 ? "err clickable" : "clickable" },
      el("td", { class: "ts" }, fmtTs(e.ts)),
      el("td", {}, e.app),
      el("td", {}, e.method ?? ""),
      el("td", { class: "url", title: e.url ?? "" }, e.url ?? ""),
      el("td", {}, pill(String(e.status), statusClassName(e.status))),
      el("td", { class: "dur" }, fmtMs(e.durationMs)),
      el("td", { class: "ip" }, e.ip ?? ""),
      el("td", { class: "ua", title: e.ua ?? "" }, e.ua ?? ""),
    );
    row.addEventListener("click", () => showDetail(e));
    return row;
  }

  // ---- data loading -------------------------------------------------------
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
      logMetaEl.textContent = `Failed to load logs (HTTP ${res.status})`;
      return;
    }
    const data = (await res.json()) as LogsResponse;
    total = data.total;
    if (reset) logBody.replaceChildren();
    for (const e of data.entries) logBody.append(logRow(e));
    offset += data.entries.length;
    logMetaEl.textContent = `Showing ${offset.toLocaleString()} of ${total.toLocaleString()}`;
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
    metaEl.textContent = `${meta.count.toLocaleString()} requests · updated ${
      meta.lastRefresh ? fmtTs(meta.lastRefresh) : "—"
    }`;
  }

  // ---- wiring -------------------------------------------------------------
  function setSort(field: string): void {
    if (sortField === field) sortDir = sortDir === "desc" ? "asc" : "desc";
    else {
      sortField = field;
      sortDir = "desc";
    }
    for (const th of logsSection.querySelectorAll<HTMLElement>("th.sortable")) {
      const active = th.dataset.sort === sortField;
      th.dataset.dir = active ? sortDir : "";
    }
    loadLogs(true);
  }
  function setupAutoRefresh(): void {
    if (autoEl.checked) autoTimer = window.setInterval(refresh, AUTO_MS);
    else if (autoTimer !== undefined) {
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
  refreshBtn.addEventListener("click", () => {
    loadMeta();
    refresh();
  });
  loadMoreBtn.addEventListener("click", () => loadLogs(false));
  autoEl.addEventListener("change", setupAutoRefresh);
  for (const th of logsSection.querySelectorAll<HTMLElement>("th.sortable")) {
    th.addEventListener("click", () => setSort(th.dataset.sort!));
  }

  // initial load
  loadMeta();
  refresh();

  return () => {
    if (autoTimer !== undefined) clearInterval(autoTimer);
  };
}

// ---- small markup helpers -------------------------------------------------

function panel(title: string, body: HTMLElement): HTMLElement {
  return el("div", { class: "panel" }, el("h2", {}, title), body);
}

function sortableTh(label: string, field: string): HTMLElement {
  return el("th", { "data-sort": field, class: "sortable" }, label);
}

function rangeSelect(): HTMLSelectElement {
  const sel = el("select", { title: "Time range" }) as HTMLSelectElement;
  const opts: [string, string][] = [
    ["", "All time"],
    ["1h", "Last hour"],
    ["24h", "Last 24h"],
    ["7d", "Last 7 days"],
    ["30d", "Last 30 days"],
  ];
  for (const [value, label] of opts) sel.append(el("option", { value }, label));
  return sel;
}
