// The Logs view: browse, filter and aggregate application (console) log entries.
// Talks to /api/app-logs, /api/app-logs/stats, /api/app-logs/meta.

import { el, card, pill, table, checkboxDropdown, fmtTs } from "./dom.ts";
import { openSheet } from "./sheet.ts";
import { stackedBarChart } from "./chart.ts";

interface AppLog {
  ts: string;
  app: string;
  level: string;
  message: string;
  params: unknown[];
}
interface AppLogsResponse {
  total: number;
  limit: number;
  offset: number;
  lastRefresh: string | null;
  entries: AppLog[];
}
interface LogStats {
  overall: { count: number; errorCount: number; warnCount: number; infoCount: number };
  perApp: { app: string; count: number; errorCount: number; warnCount: number }[];
  levelDistribution: { level: string; count: number }[];
  overTime: { bucket: string; error: number; warn: number; info: number }[];
}
interface LogMeta {
  apps: string[];
  levels: string[];
  count: number;
  from: string | null;
  to: string | null;
  lastRefresh: string | null;
}

const PAGE = 100;
const AUTO_MS = 7_000;
const ALL_LEVELS = ["log", "info", "warn", "error", "debug"];

/** CSS pill class for a log level. */
function levelClass(level: string): string {
  if (level === "error") return "lvl-error";
  if (level === "warn") return "lvl-warn";
  if (level === "debug") return "lvl-debug";
  return "lvl-info"; // log / info / anything else
}

/** Mount the Logs view into `root`. Returns a teardown to stop its timer. */
export function mountLogs(root: HTMLElement): () => void {
  const cardsEl = el("section", { class: "cards" });
  const chartEl = el("div", { class: "chart-wrap" });
  const perAppEl = el("div", { class: "table-wrap" });
  const levelDistEl = el("div", { class: "table-wrap" });
  const panels = el(
    "section",
    { class: "panels" },
    panel("Logs over time (by level)", chartEl, "panel-wide"),
    panel("Logs per app", perAppEl),
    panel("Levels", levelDistEl),
  );

  const qEl = el("input", { type: "search", placeholder: "Search message…" }) as HTMLInputElement;
  const appDropdownEl = el("div", { class: "dropdown" });
  const levelDropdownEl = el("div", { class: "dropdown" });
  const rangeEl = rangeSelect();
  const refreshBtn = el("button", { type: "button" }, "Refresh");
  const autoEl = el("input", { type: "checkbox" }) as HTMLInputElement;
  const showSelfEl = el("input", { type: "checkbox" }) as HTMLInputElement;
  const filters = el(
    "section",
    { class: "filters" },
    qEl,
    appDropdownEl,
    levelDropdownEl,
    rangeEl,
    refreshBtn,
    el("label", { class: "toggle" }, autoEl, "Auto-refresh"),
    el("label", { class: "toggle" }, showSelfEl, "Show log-viewer logs"),
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
          sortableTh("Level", "level"),
          el("th", {}, "Message"),
        ),
      ),
      logBody,
    ),
    el("div", { class: "loadmore" }, loadMoreBtn, logMetaEl),
  );

  const metaEl = el("span", { class: "meta" });
  root.replaceChildren(
    el("div", { class: "view-head" }, el("h2", { class: "view-title" }, "Logs"), metaEl),
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
  const levelDropdown = checkboxDropdown(levelDropdownEl, "All levels", () => refresh());
  levelDropdown.setOptions(ALL_LEVELS);

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
    const levels = levelDropdown.selected();
    if (apps.length) p.set("app", apps.join(","));
    if (levels.length) p.set("level", levels.join(","));
    const from = rangeFrom();
    if (from) p.set("from", from);
    if (!showSelfEl.checked) p.set("excludeApp", "log-viewer");
    return p;
  }

  // ---- rendering ----------------------------------------------------------
  function renderCards(s: LogStats): void {
    cardsEl.replaceChildren(
      card("Total logs", s.overall.count.toLocaleString()),
      card("Errors", String(s.overall.errorCount), s.overall.errorCount ? "bad" : ""),
      card("Warnings", String(s.overall.warnCount), s.overall.warnCount ? "warn" : ""),
      card("Info / debug", String(s.overall.infoCount)),
    );
  }
  function renderPanels(s: LogStats): void {
    chartEl.replaceChildren(
      stackedBarChart(s.overTime, [
        { key: "error", label: "Error", varName: "--bad" },
        { key: "warn", label: "Warn", varName: "--warn" },
        { key: "info", label: "Info", varName: "--info" },
      ]),
    );
    perAppEl.replaceChildren(
      table(
        ["App", "Logs", "Errors", "Warnings"],
        s.perApp.map((a) => [a.app, String(a.count), String(a.errorCount), String(a.warnCount)]),
      ),
    );
    levelDistEl.replaceChildren(
      table(
        ["Level", "Count"],
        s.levelDistribution.map((d) => [pill(d.level, levelClass(d.level)), String(d.count)]),
      ),
    );
  }

  function showDetail(e: AppLog): void {
    const rows = [
      { label: "Time", value: fmtTs(e.ts) },
      { label: "App", value: e.app },
      { label: "Level", value: pill(e.level, levelClass(e.level)) },
      { label: "Message", value: e.message, mono: true },
    ];
    e.params.forEach((p, i) => {
      const value = typeof p === "string" ? p : JSON.stringify(p, null, 2);
      rows.push({ label: `Param ${i + 1}`, value, mono: true });
    });
    openSheet("Log entry", rows);
  }

  function logRow(e: AppLog): HTMLElement {
    const row = el(
      "tr",
      { class: `clickable ${e.level === "error" ? "err" : ""}` },
      el("td", { class: "ts" }, fmtTs(e.ts)),
      el("td", {}, e.app),
      el("td", {}, pill(e.level, levelClass(e.level))),
      el("td", { class: "msg", title: e.message }, e.message),
    );
    row.addEventListener("click", () => showDetail(e));
    return row;
  }

  // ---- data loading -------------------------------------------------------
  async function loadStats(): Promise<void> {
    const res = await fetch(`/api/app-logs/stats?${baseParams().toString()}`);
    if (!res.ok) return;
    const { stats } = (await res.json()) as { stats: LogStats };
    renderCards(stats);
    renderPanels(stats);
  }
  async function loadLogs(reset: boolean): Promise<void> {
    if (reset) offset = 0;
    const p = baseParams();
    p.set("sort", `${sortField}:${sortDir}`);
    p.set("limit", String(PAGE));
    p.set("offset", String(offset));
    const res = await fetch(`/api/app-logs?${p.toString()}`);
    if (!res.ok) {
      logMetaEl.textContent = `Failed to load logs (HTTP ${res.status})`;
      return;
    }
    const data = (await res.json()) as AppLogsResponse;
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
    const res = await fetch("/api/app-logs/meta");
    if (!res.ok) return;
    const meta = (await res.json()) as LogMeta;
    appDropdown.setOptions(meta.apps);
    metaEl.textContent = `${meta.count.toLocaleString()} log entries · updated ${
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

  for (const control of [rangeEl, showSelfEl]) {
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

  loadMeta();
  refresh();

  return () => {
    if (autoTimer !== undefined) clearInterval(autoTimer);
  };
}

// ---- small markup helpers -------------------------------------------------

function panel(title: string, body: HTMLElement, cls = ""): HTMLElement {
  return el("div", { class: `panel ${cls}`.trim() }, el("h2", {}, title), body);
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
