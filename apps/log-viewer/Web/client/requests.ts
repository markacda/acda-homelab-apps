// The Requests view: browse, filter and aggregate HTTP access-log entries.
// Talks to /api/logs, /api/stats, /api/meta.

import { el, card, table, pill, checkboxDropdown, statusClassName, fmtTs, fmtMs } from './dom.ts';
import { showRequestDetail, type RequestEntry as Entry } from './details.ts';
import { stackedBarChart } from './chart.ts';
import { tagOptions, defaultTagSelection, tagsParam } from './tags.ts';

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
interface SlowRequest {
  app: string;
  method: string;
  url: string;
  status: number;
  durationMs: number;
  ts: string;
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
  slowestRequests: SlowRequest[];
  statusDistribution: { status: number; count: number }[];
  topIps: { ip: string; count: number }[];
  topUserAgents: { ua: string; count: number }[];
  overTime: { bucket: string; ok: number; c4xx: number; c5xx: number }[];
}
interface Meta {
  apps: string[];
  methods: string[];
  tags: string[];
  count: number;
  from: string | null;
  to: string | null;
  lastRefresh: string | null;
}

const PAGE = 100;
const AUTO_MS = 7_000;
// Rendered when a filter has every option deselected (see selectionEmpty).
const EMPTY_STATS: Stats = {
  overall: { count: 0, avgDurationMs: 0, errorCount: 0, count4xx: 0, count5xx: 0, errorRate: 0 },
  perApp: [],
  perEndpoint: [],
  slowestEndpoints: [],
  slowestRequests: [],
  statusDistribution: [],
  topIps: [],
  topUserAgents: [],
  overTime: [],
};
// The dashboard tags its health probes with this UA; we hide those rows unless
// "Show discovery agent". Canonical source: @homelab/access-log constants.ts
// (DISCOVERY_UA). This is a synced copy: the client build can now import shared
// *browser* packages under apps/Common (see @homelab/web-kit / @homelab/auth-client),
// but @homelab/access-log is a Node/server package, so keep the two in step by hand.
const DISCOVERY_UA = 'homelab-dashboard-discovery-agent';

/** Mount the Requests view into `root`. Returns a teardown to stop its timer. */
export function mountRequests(root: HTMLElement): () => void {
  const cardsEl = el('section', { class: 'cards' });

  const chartEl = el('div', { class: 'chart-wrap' });
  const perAppEl = el('div', { class: 'table-wrap' });
  const perEndpointEl = el('div', { class: 'table-wrap' });
  const slowestEl = el('div', { class: 'table-wrap' });
  const slowestReqEl = el('div', { class: 'table-wrap' });
  const statusDistEl = el('div', { class: 'table-wrap' });
  const panels = el(
    'section',
    { class: 'panels' },
    panel('Requests over time (by status)', chartEl, 'panel-wide'),
    panel('Requests per app', perAppEl),
    panel('Top endpoints', perEndpointEl),
    panel('Slowest endpoints', slowestEl),
    panel('Slowest requests', slowestReqEl),
    panel('Status codes', statusDistEl)
  );

  const qEl = el('input', {
    id: 'q',
    type: 'search',
    placeholder: 'Search url / ip / user-agent…',
  }) as HTMLInputElement;
  const appDropdownEl = el('div', { class: 'dropdown' });
  const methodDropdownEl = el('div', { class: 'dropdown' });
  const statusDropdownEl = el('div', { class: 'dropdown' });
  const tagDropdownEl = el('div', { class: 'dropdown' });
  const rangeEl = rangeSelect();
  const refreshBtn = el('button', { type: 'button' }, 'Refresh');
  const autoEl = el('input', { type: 'checkbox' }) as HTMLInputElement;
  const showSelfEl = el('input', { type: 'checkbox' }) as HTMLInputElement;
  const showDiscoveryEl = el('input', { type: 'checkbox' }) as HTMLInputElement;
  const filters = el(
    'section',
    { class: 'filters' },
    qEl,
    appDropdownEl,
    methodDropdownEl,
    statusDropdownEl,
    tagDropdownEl,
    rangeEl,
    refreshBtn,
    el('label', { class: 'toggle' }, autoEl, 'Auto-refresh'),
    el('label', { class: 'toggle' }, showSelfEl, 'Show log-viewer logs'),
    el('label', { class: 'toggle' }, showDiscoveryEl, 'Show discovery agent')
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
          el('th', {}, 'Method'),
          el('th', {}, 'URL'),
          sortableTh('Status', 'status'),
          sortableTh('Duration', 'durationMs'),
          el('th', {}, 'IP'),
          el('th', {}, 'User-Agent')
        )
      ),
      logBody
    ),
    loadMoreEl
  );

  const metaEl = el('span', { class: 'meta' });
  root.replaceChildren(
    el('div', { class: 'view-head' }, el('h2', { class: 'view-title' }, 'Requests'), metaEl),
    cardsEl,
    panels,
    filters,
    logsSection
  );

  let sortField = 'ts';
  let sortDir: 'asc' | 'desc' = 'desc';
  // An exact status-code filter toggled by clicking a Status codes row (null = off).
  let statusFilter: number | null = null;
  // Last known total request count, so the header can re-render its "updated"
  // timestamp on auto-refresh without re-fetching /api/meta (which owns the count).
  let metaCount = 0;
  let offset = 0;
  let total = 0;
  let autoTimer: number | undefined;
  let loading = false;
  let loadSeq = 0;
  let sentinelVisible = false;

  const appDropdown = checkboxDropdown(appDropdownEl, 'All apps', () => refresh());
  const methodDropdown = checkboxDropdown(methodDropdownEl, 'All methods', () => refresh());
  const statusDropdown = checkboxDropdown(statusDropdownEl, 'All status', () => refresh());
  statusDropdown.setOptions(['2xx', '3xx', '4xx', '5xx']);
  const tagDropdown = checkboxDropdown(tagDropdownEl, 'All tags', () => refresh());
  // The default selection (hiding Healthcheck) is applied on the first meta load,
  // once the available tag options are known.
  let tagsInit = false;

  // Deselecting every option in any filter means "match nothing" — short-circuit
  // to an empty view rather than falling back to the server's "empty = all".
  function selectionEmpty(): boolean {
    return appDropdown.isNone() || methodDropdown.isNone() || statusDropdown.isNone() || tagDropdown.isNone();
  }

  function rangeFrom(): string | null {
    const map: Record<string, number> = {
      '1h': 3600e3,
      '24h': 24 * 3600e3,
      '7d': 7 * 24 * 3600e3,
      '30d': 30 * 24 * 3600e3,
    };
    const ms = map[rangeEl.value];
    return ms ? new Date(Date.now() - ms).toISOString() : null;
  }
  function baseParams(): URLSearchParams {
    const p = new URLSearchParams();
    if (qEl.value.trim()) p.set('q', qEl.value.trim());
    const apps = appDropdown.selected();
    const methods = methodDropdown.selected();
    const statuses = statusDropdown.selected();
    if (apps.length) p.set('app', apps.join(','));
    if (methods.length) p.set('method', methods.join(','));
    if (statuses.length) p.set('statusClass', statuses.join(','));
    const tags = tagsParam(tagDropdown.selected());
    if (tags) p.set('tags', tags);
    if (statusFilter !== null) p.set('status', String(statusFilter));
    const from = rangeFrom();
    if (from) p.set('from', from);
    // Hide noise by default; the toggles opt back in to seeing it.
    if (!showSelfEl.checked) p.set('excludeApp', 'log-viewer');
    if (!showDiscoveryEl.checked) p.set('excludeUa', DISCOVERY_UA);
    return p;
  }

  function renderCards(s: Stats): void {
    const failing = `${s.overall.errorCount.toLocaleString()} of ${s.overall.count.toLocaleString()} requests failed`;
    cardsEl.replaceChildren(
      card('Total requests', s.overall.count.toLocaleString()),
      card('Avg response time', fmtMs(s.overall.avgDurationMs)),
      card('Errors (4xx+5xx)', String(s.overall.errorCount), s.overall.errorCount ? 'warn' : '', failing),
      card('Error rate', `${(s.overall.errorRate * 100).toFixed(1)}%`, s.overall.errorRate ? 'warn' : '', failing),
      card('5xx', String(s.overall.count5xx), s.overall.count5xx ? 'bad' : '', '', () => {
        statusDropdown.setSelected(['5xx']);
        refresh();
      }),
      card('4xx', String(s.overall.count4xx), '', '', () => {
        statusDropdown.setSelected(['4xx']);
        refresh();
      })
    );
  }
  function renderStatTables(s: Stats): void {
    chartEl.replaceChildren(
      stackedBarChart(s.overTime, [
        { key: 'ok', label: '2xx/3xx', varName: '--info' },
        { key: 'c4xx', label: '4xx', varName: '--warn' },
        { key: 'c5xx', label: '5xx', varName: '--bad' },
      ])
    );
    perAppEl.replaceChildren(
      table(
        ['App', 'Requests', 'Avg ms', 'Errors'],
        s.perApp.slice(0, 10).map((a) => [a.app, String(a.count), String(a.avgDurationMs), String(a.errorCount)])
      )
    );
    perEndpointEl.replaceChildren(
      table(
        ['App', 'Method', 'URL', 'Requests', 'Avg ms'],
        s.perEndpoint.map((e) => [e.app, e.method, e.url, String(e.count), String(e.avgDurationMs)]),
        ['', '', 'cell-url', '', '']
      )
    );
    slowestEl.replaceChildren(
      table(
        ['App', 'Method', 'URL', 'Avg ms', 'Requests'],
        s.slowestEndpoints.map((e) => [e.app, e.method, e.url, String(e.avgDurationMs), String(e.count)]),
        ['', '', 'cell-url', '', '']
      )
    );
    slowestReqEl.replaceChildren(
      table(
        ['App', 'Method', 'URL', 'Status', 'ms'],
        s.slowestRequests.map((r) => [r.app, r.method, r.url, pill(String(r.status), statusClassName(r.status)), String(r.durationMs)]),
        ['', '', 'cell-url', '', '']
      )
    );
    renderStatusTable(s.statusDistribution);
  }
  // The Status codes table is built inline (not via table()) so each row can toggle
  // an exact-status filter on click; the active row is highlighted.
  function renderStatusTable(dist: { status: number; count: number }[]): void {
    const rows = dist.slice(0, 10);
    if (rows.length === 0) {
      statusDistEl.replaceChildren(el('p', { class: 'empty' }, 'No data'));
      return;
    }
    const thead = el('thead', {}, el('tr', {}, el('th', {}, 'Status'), el('th', {}, 'Count')));
    const tbody = el(
      'tbody',
      {},
      ...rows.map((d) => {
        const active = statusFilter === d.status;
        const row = el(
          'tr',
          { class: active ? 'clickable active' : 'clickable' },
          el('td', {}, pill(String(d.status), statusClassName(d.status))),
          el('td', {}, String(d.count))
        );
        row.addEventListener('click', () => {
          statusFilter = active ? null : d.status;
          refresh();
        });
        return row;
      })
    );
    statusDistEl.replaceChildren(el('table', { class: 'stat-table' }, thead, tbody));
  }

  function logRow(e: Entry): HTMLElement {
    const row = el(
      'tr',
      { class: e.status >= 400 ? 'err clickable' : 'clickable' },
      el('td', { class: 'ts' }, fmtTs(e.ts)),
      el('td', {}, e.app),
      el('td', {}, e.method ?? ''),
      el('td', { class: 'url', title: e.url ?? '' }, e.url ?? ''),
      el('td', {}, pill(String(e.status), statusClassName(e.status))),
      el('td', { class: 'dur' }, fmtMs(e.durationMs)),
      el('td', { class: 'ip' }, e.ip ?? ''),
      el('td', { class: 'ua', title: e.ua ?? '' }, e.ua ?? '')
    );
    row.addEventListener('click', () => showRequestDetail(e));
    return row;
  }

  async function loadStats(): Promise<void> {
    if (selectionEmpty()) {
      renderCards(EMPTY_STATS);
      renderStatTables(EMPTY_STATS);
      return;
    }
    const res = await fetch(`api/stats?${baseParams().toString()}`);
    if (!res.ok) return;
    const { stats, lastRefresh } = (await res.json()) as { stats: Stats; lastRefresh: string | null };
    renderCards(stats);
    renderStatTables(stats);
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
    // Don't stack auto-load appends; a reset always proceeds and supersedes any
    // in-flight load via loadSeq so its late response can't corrupt the list.
    if (!reset && loading) return;
    if (reset) offset = 0;
    const seq = ++loadSeq;
    loading = true;
    const p = baseParams();
    p.set('sort', `${sortField}:${sortDir}`);
    p.set('limit', String(PAGE));
    p.set('offset', String(offset));
    try {
      const res = await fetch(`api/logs?${p.toString()}`);
      if (seq !== loadSeq) return; // a newer load started; drop this response
      if (!res.ok) {
        logMetaEl.textContent = `Failed to load logs (HTTP ${res.status})`;
        return;
      }
      const data = (await res.json()) as LogsResponse;
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
    // A short first page may leave the sentinel still in view; keep filling.
    maybeAutoLoad();
  }
  async function refresh(): Promise<void> {
    await Promise.all([loadStats(), loadLogs(true)]);
  }
  function renderHeader(lastRefresh: string | null): void {
    metaEl.textContent = `${metaCount.toLocaleString()} requests · updated ${lastRefresh ? fmtTs(lastRefresh) : '—'}`;
  }
  async function loadMeta(): Promise<void> {
    const res = await fetch('api/meta');
    if (!res.ok) return;
    const meta = (await res.json()) as Meta;
    appDropdown.setOptions(meta.apps);
    methodDropdown.setOptions(meta.methods);
    const opts = tagOptions(meta.tags);
    tagDropdown.setOptions(opts);
    if (!tagsInit) {
      tagDropdown.setSelected(defaultTagSelection(opts));
      tagsInit = true;
    }
    metaCount = meta.count;
    renderHeader(meta.lastRefresh);
  }

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
  // Infinite scroll: pull the next page whenever the load-more row is near the
  // viewport. `sentinelVisible` is kept current by the observer so loadLogs can
  // re-check it to keep filling a viewport that a single page didn't cover.
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

  for (const control of [rangeEl, showSelfEl, showDiscoveryEl]) {
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
