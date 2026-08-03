// The Dependencies view: browse, filter and aggregate outbound-dependency calls
// (HTTP fetches + postgres queries). Talks to /api/dependencies[/stats|/meta].

import { el, card, pill, table, checkboxDropdown, fmtTs, fmtMs, statusClassName, outcomePill } from './dom.ts';
import { showDependencyDetail, type Dependency } from './details.ts';
import { stackedBarChart } from './chart.ts';

interface DependenciesResponse {
  total: number;
  limit: number;
  offset: number;
  lastRefresh: string | null;
  entries: Dependency[];
}
interface TargetStat {
  target: string;
  type: string;
  count: number;
  failureCount: number;
  avgDurationMs: number;
  p95DurationMs: number;
}
interface DependencyStats {
  overall: { count: number; failureCount: number; failureRate: number; avgDurationMs: number; p95DurationMs: number };
  perTarget: TargetStat[];
  perApp: { app: string; count: number; failureCount: number; avgDurationMs: number }[];
  slowest: TargetStat[];
  overTime: { bucket: string; ok: number; failed: number }[];
}
interface DependencyMeta {
  apps: string[];
  types: string[];
  targets: string[];
  count: number;
  from: string | null;
  to: string | null;
  lastRefresh: string | null;
}

const PAGE = 100;
const AUTO_MS = 7_000;
const ALL_TYPES = ['http', 'postgres'];
const EMPTY_STATS: DependencyStats = {
  overall: { count: 0, failureCount: 0, failureRate: 0, avgDurationMs: 0, p95DurationMs: 0 },
  perTarget: [],
  perApp: [],
  slowest: [],
  overTime: [],
};

/** Mount the Dependencies view into `root`. Returns a teardown to stop its timer. */
export function mountDependencies(root: HTMLElement): () => void {
  const cardsEl = el('section', { class: 'cards' });
  const chartEl = el('div', { class: 'chart-wrap' });
  const perTargetEl = el('div', { class: 'table-wrap' });
  const perAppEl = el('div', { class: 'table-wrap' });
  const slowestEl = el('div', { class: 'table-wrap' });
  const panels = el(
    'section',
    { class: 'panels' },
    panel('Dependency calls over time', chartEl, 'panel-wide'),
    panel('Per target', perTargetEl, 'panel-wide'),
    panel('Per app', perAppEl),
    panel('Slowest targets (p95)', slowestEl)
  );

  const qEl = el('input', { type: 'search', placeholder: 'Search name / target…' }) as HTMLInputElement;
  const appDropdownEl = el('div', { class: 'dropdown' });
  const typeDropdownEl = el('div', { class: 'dropdown' });
  const outcomeEl = outcomeSelect();
  const rangeEl = rangeSelect();
  const refreshBtn = el('button', { type: 'button' }, 'Refresh');
  const autoEl = el('input', { type: 'checkbox' }) as HTMLInputElement;
  const showSelfEl = el('input', { type: 'checkbox' }) as HTMLInputElement;
  const filters = el(
    'section',
    { class: 'filters' },
    qEl,
    appDropdownEl,
    typeDropdownEl,
    outcomeEl,
    rangeEl,
    refreshBtn,
    el('label', { class: 'toggle' }, autoEl, 'Auto-refresh'),
    el('label', { class: 'toggle' }, showSelfEl, 'Show log-viewer calls')
  );

  const logBody = el('tbody');
  const loadMoreBtn = el('button', { type: 'button' }, 'Load more') as HTMLButtonElement;
  const logMetaEl = el('span', { class: 'meta' });
  const loadMoreEl = el('div', { class: 'loadmore' }, loadMoreBtn, logMetaEl);
  const logsSection = el(
    'section',
    { class: 'logs' },
    el(
      'table',
      { class: 'log-table' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          sortableTh('Time', 'ts'),
          sortableTh('App', 'app'),
          sortableTh('Type', 'type'),
          sortableTh('Target', 'target'),
          el('th', {}, 'Name'),
          el('th', {}, 'Status'),
          sortableTh('Duration', 'durationMs'),
          el('th', {}, 'Outcome')
        )
      ),
      logBody
    ),
    loadMoreEl
  );

  const metaEl = el('span', { class: 'meta' });
  root.replaceChildren(
    el('div', { class: 'view-head' }, el('h2', { class: 'view-title' }, 'Dependencies'), metaEl),
    cardsEl,
    panels,
    filters,
    logsSection
  );

  // ---- state --------------------------------------------------------------
  let sortField = 'ts';
  let sortDir: 'asc' | 'desc' = 'desc';
  // Last known total count, so the header can re-render its "updated" timestamp
  // on auto-refresh without re-fetching /api/dependencies/meta (which owns the count).
  let metaCount = 0;
  let offset = 0;
  let total = 0;
  let autoTimer: number | undefined;
  let loading = false;
  let loadSeq = 0;
  let sentinelVisible = false;

  const appDropdown = checkboxDropdown(appDropdownEl, 'All apps', () => refresh());
  const typeDropdown = checkboxDropdown(typeDropdownEl, 'All types', () => refresh());
  typeDropdown.setOptions(ALL_TYPES);

  function selectionEmpty(): boolean {
    return appDropdown.isNone() || typeDropdown.isNone();
  }

  // ---- query building -----------------------------------------------------
  function rangeFrom(): string | null {
    const map: Record<string, number> = { '1h': 3600e3, '24h': 24 * 3600e3, '7d': 7 * 24 * 3600e3, '30d': 30 * 24 * 3600e3 };
    const ms = map[rangeEl.value];
    return ms ? new Date(Date.now() - ms).toISOString() : null;
  }
  function baseParams(): URLSearchParams {
    const p = new URLSearchParams();
    if (qEl.value.trim()) p.set('q', qEl.value.trim());
    const apps = appDropdown.selected();
    const types = typeDropdown.selected();
    if (apps.length) p.set('app', apps.join(','));
    if (types.length) p.set('type', types.join(','));
    if (outcomeEl.value) p.set('outcome', outcomeEl.value);
    const from = rangeFrom();
    if (from) p.set('from', from);
    if (!showSelfEl.checked) p.set('excludeApp', 'log-viewer');
    return p;
  }

  // ---- rendering ----------------------------------------------------------
  function renderCards(s: DependencyStats): void {
    cardsEl.replaceChildren(
      card('Total calls', s.overall.count.toLocaleString()),
      card('Failures', String(s.overall.failureCount), s.overall.failureCount ? 'bad' : '', '', () => {
        outcomeEl.value = 'failure';
        refresh();
      }),
      card('Failure rate', `${(s.overall.failureRate * 100).toFixed(1)}%`, s.overall.failureRate ? 'warn' : ''),
      card('Avg duration', fmtMs(s.overall.avgDurationMs)),
      card('p95 duration', fmtMs(s.overall.p95DurationMs))
    );
  }
  function renderPanels(s: DependencyStats): void {
    chartEl.replaceChildren(
      stackedBarChart(s.overTime, [
        { key: 'ok', label: 'OK', varName: '--info' },
        { key: 'failed', label: 'Failed', varName: '--bad' },
      ])
    );
    perTargetEl.replaceChildren(
      table(
        ['Target', 'Type', 'Calls', 'Failures', 'Avg ms', 'p95 ms'],
        s.perTarget.map((t) => [t.target, t.type, String(t.count), String(t.failureCount), String(t.avgDurationMs), String(t.p95DurationMs)]),
        ['cell-url', '', '', '', '', '']
      )
    );
    perAppEl.replaceChildren(
      table(
        ['App', 'Calls', 'Failures', 'Avg ms'],
        s.perApp.slice(0, 10).map((a) => [a.app, String(a.count), String(a.failureCount), String(a.avgDurationMs)])
      )
    );
    slowestEl.replaceChildren(
      table(
        ['Target', 'Type', 'p95 ms', 'Calls'],
        s.slowest.map((t) => [t.target, t.type, String(t.p95DurationMs), String(t.count)]),
        ['cell-url', '', '', '']
      )
    );
  }

  function logRow(e: Dependency): HTMLElement {
    const row = el(
      'tr',
      { class: e.success ? 'clickable' : 'clickable err' },
      el('td', { class: 'ts' }, fmtTs(e.ts)),
      el('td', {}, e.app),
      el('td', {}, e.type),
      el('td', { class: 'url', title: e.target }, e.target),
      el('td', { class: 'msg', title: e.name }, e.name),
      el('td', {}, e.status !== undefined ? pill(String(e.status), statusClassName(e.status)) : ''),
      el('td', { class: 'dur' }, fmtMs(e.durationMs)),
      el('td', {}, outcomePill(e.success))
    );
    row.addEventListener('click', () => showDependencyDetail(e));
    return row;
  }

  // ---- data loading -------------------------------------------------------
  async function loadStats(): Promise<void> {
    if (selectionEmpty()) {
      renderCards(EMPTY_STATS);
      renderPanels(EMPTY_STATS);
      return;
    }
    const res = await fetch(`api/dependencies/stats?${baseParams().toString()}`);
    if (!res.ok) return;
    const { stats, lastRefresh } = (await res.json()) as { stats: DependencyStats; lastRefresh: string | null };
    renderCards(stats);
    renderPanels(stats);
    // Auto-refresh runs loadStats, so advance the header timestamp here too.
    renderHeader(lastRefresh);
  }
  async function loadLogs(reset: boolean): Promise<void> {
    if (selectionEmpty()) {
      logBody.replaceChildren();
      total = 0;
      offset = 0;
      logMetaEl.textContent = 'Showing 0 of 0';
      loadMoreBtn.style.display = 'none';
      return;
    }
    if (!reset && loading) return;
    if (reset) offset = 0;
    const seq = ++loadSeq;
    loading = true;
    const p = baseParams();
    p.set('sort', `${sortField}:${sortDir}`);
    p.set('limit', String(PAGE));
    p.set('offset', String(offset));
    try {
      const res = await fetch(`api/dependencies?${p.toString()}`);
      if (seq !== loadSeq) return;
      if (!res.ok) {
        logMetaEl.textContent = `Failed to load dependencies (HTTP ${res.status})`;
        return;
      }
      const data = (await res.json()) as DependenciesResponse;
      if (seq !== loadSeq) return;
      total = data.total;
      if (reset) logBody.replaceChildren();
      for (const e of data.entries) logBody.append(logRow(e));
      offset += data.entries.length;
      logMetaEl.textContent = `Showing ${offset.toLocaleString()} of ${total.toLocaleString()}`;
      loadMoreBtn.disabled = offset >= total;
      loadMoreBtn.style.display = offset >= total ? 'none' : '';
    } finally {
      if (seq === loadSeq) loading = false;
    }
    maybeAutoLoad();
  }
  async function refresh(): Promise<void> {
    await Promise.all([loadStats(), loadLogs(true)]);
  }
  function renderHeader(lastRefresh: string | null): void {
    metaEl.textContent = `${metaCount.toLocaleString()} dependency calls · updated ${lastRefresh ? fmtTs(lastRefresh) : '—'}`;
  }
  async function loadMeta(): Promise<void> {
    const res = await fetch('api/dependencies/meta');
    if (!res.ok) return;
    const meta = (await res.json()) as DependencyMeta;
    appDropdown.setOptions(meta.apps);
    metaCount = meta.count;
    renderHeader(meta.lastRefresh);
  }

  // ---- wiring -------------------------------------------------------------
  function setSort(field: string): void {
    if (sortField === field) sortDir = sortDir === 'desc' ? 'asc' : 'desc';
    else {
      sortField = field;
      sortDir = 'desc';
    }
    for (const th of logsSection.querySelectorAll<HTMLElement>('th.sortable')) {
      const active = th.dataset.sort === sortField;
      th.dataset.dir = active ? sortDir : '';
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
  function maybeAutoLoad(): void {
    if (sentinelVisible && !loading && !selectionEmpty() && offset < total) loadLogs(false);
  }
  const observer = new IntersectionObserver(
    (entries) => {
      sentinelVisible = entries[0].isIntersecting;
      maybeAutoLoad();
    },
    { rootMargin: '200px' }
  );
  observer.observe(loadMoreEl);

  for (const control of [outcomeEl, rangeEl, showSelfEl]) {
    control.addEventListener('change', () => refresh());
  }
  let debounce: number | undefined;
  qEl.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = window.setTimeout(() => refresh(), 300);
  });
  refreshBtn.addEventListener('click', () => {
    loadMeta();
    refresh();
  });
  loadMoreBtn.addEventListener('click', () => loadLogs(false));
  autoEl.addEventListener('change', setupAutoRefresh);
  for (const th of logsSection.querySelectorAll<HTMLElement>('th.sortable')) {
    th.addEventListener('click', () => setSort(th.dataset.sort!));
  }

  loadMeta();
  refresh();

  return () => {
    if (autoTimer !== undefined) clearInterval(autoTimer);
    observer.disconnect();
  };
}

// ---- small markup helpers -------------------------------------------------

function panel(title: string, body: HTMLElement, cls = ''): HTMLElement {
  return el('div', { class: `panel ${cls}`.trim() }, el('h2', {}, title), body);
}

function sortableTh(label: string, field: string): HTMLElement {
  return el('th', { 'data-sort': field, class: 'sortable' }, label);
}

function rangeSelect(): HTMLSelectElement {
  const sel = el('select', { title: 'Time range' }) as HTMLSelectElement;
  const opts: [string, string][] = [
    ['', 'All time'],
    ['1h', 'Last hour'],
    ['24h', 'Last 24h'],
    ['7d', 'Last 7 days'],
    ['30d', 'Last 30 days'],
  ];
  for (const [value, label] of opts) sel.append(el('option', { value }, label));
  sel.value = '24h';
  return sel;
}

function outcomeSelect(): HTMLSelectElement {
  const sel = el('select', { title: 'Outcome' }) as HTMLSelectElement;
  const opts: [string, string][] = [
    ['', 'All outcomes'],
    ['success', 'Success only'],
    ['failure', 'Failures only'],
  ];
  for (const [value, label] of opts) sel.append(el('option', { value }, label));
  return sel;
}
