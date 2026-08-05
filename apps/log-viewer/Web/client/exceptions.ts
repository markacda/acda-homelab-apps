// The Exceptions view: browse, filter and aggregate first-class exception records.
// Talks to /api/exceptions, /api/exceptions/stats, /api/exceptions/meta.

import { el, card, pill, table, checkboxDropdown, fmtTs, sourceClass } from './dom.ts';
import { showExceptionDetail, type Exception } from './details.ts';
import { stackedBarChart } from './chart.ts';

interface ExceptionsResponse {
  total: number;
  limit: number;
  offset: number;
  lastRefresh: string | null;
  entries: Exception[];
}
interface Problem {
  name: string;
  message: string;
  count: number;
  lastSeen: string;
  apps: string[];
}
interface ExceptionStats {
  overall: { count: number; problemCount: number; appCount: number };
  problems: Problem[];
  perApp: { app: string; count: number }[];
  bySource: { source: string; count: number }[];
  overTime: { bucket: string; count: number }[];
}
interface ExceptionMeta {
  apps: string[];
  sources: string[];
  count: number;
  from: string | null;
  to: string | null;
  lastRefresh: string | null;
}

const PAGE = 100;
const AUTO_MS = 7_000;
const ALL_SOURCES = ['express', 'uncaught', 'unhandledRejection', 'manual'];
const EMPTY_STATS: ExceptionStats = {
  overall: { count: 0, problemCount: 0, appCount: 0 },
  problems: [],
  perApp: [],
  bySource: [],
  overTime: [],
};

/** Mount the Exceptions view into `root`. Returns a teardown to stop its timer. */
export function mountExceptions(root: HTMLElement): () => void {
  const cardsEl = el('section', { class: 'cards' });
  const chartEl = el('div', { class: 'chart-wrap' });
  const problemsEl = el('div', { class: 'table-wrap' });
  const perAppEl = el('div', { class: 'table-wrap' });
  const bySourceEl = el('div', { class: 'table-wrap' });
  const panels = el(
    'section',
    { class: 'panels' },
    panel('Exceptions over time', chartEl, 'panel-wide'),
    panel('Top problems', problemsEl, 'panel-wide'),
    panel('Exceptions per app', perAppEl),
    panel('By source', bySourceEl)
  );

  const qEl = el('input', { type: 'search', placeholder: 'Search name / message…' }) as HTMLInputElement;
  const appDropdownEl = el('div', { class: 'dropdown' });
  const sourceDropdownEl = el('div', { class: 'dropdown' });
  const rangeEl = rangeSelect();
  const refreshBtn = el('button', { type: 'button' }, 'Refresh');
  const autoEl = el('input', { type: 'checkbox' }) as HTMLInputElement;
  const showSelfEl = el('input', { type: 'checkbox' }) as HTMLInputElement;
  const filters = el(
    'section',
    { class: 'filters' },
    qEl,
    appDropdownEl,
    sourceDropdownEl,
    rangeEl,
    refreshBtn,
    el('label', { class: 'toggle' }, autoEl, 'Auto-refresh'),
    el('label', { class: 'toggle' }, showSelfEl, 'Show log-viewer exceptions')
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
          sortableTh('Source', 'source'),
          sortableTh('Name', 'name'),
          el('th', {}, 'Message')
        )
      ),
      logBody
    ),
    loadMoreEl
  );

  const metaEl = el('span', { class: 'meta' });
  root.replaceChildren(
    el('div', { class: 'view-head' }, el('h2', { class: 'view-title' }, 'Exceptions'), metaEl),
    cardsEl,
    panels,
    filters,
    logsSection
  );

  let sortField = 'ts';
  let sortDir: 'asc' | 'desc' = 'desc';
  // Last known total count, so the header can re-render its "updated" timestamp
  // on auto-refresh without re-fetching /api/exceptions/meta (which owns the count).
  let metaCount = 0;
  let offset = 0;
  let total = 0;
  let autoTimer: number | undefined;
  let loading = false;
  let loadSeq = 0;
  let sentinelVisible = false;

  const appDropdown = checkboxDropdown(appDropdownEl, 'All apps', () => refresh());
  const sourceDropdown = checkboxDropdown(sourceDropdownEl, 'All sources', () => refresh());
  sourceDropdown.setOptions(ALL_SOURCES);

  function selectionEmpty(): boolean {
    return appDropdown.isNone() || sourceDropdown.isNone();
  }

  function rangeFrom(): string | null {
    const map: Record<string, number> = { '1h': 3600e3, '24h': 24 * 3600e3, '7d': 7 * 24 * 3600e3, '30d': 30 * 24 * 3600e3 };
    const ms = map[rangeEl.value];
    return ms ? new Date(Date.now() - ms).toISOString() : null;
  }
  function baseParams(): URLSearchParams {
    const p = new URLSearchParams();
    if (qEl.value.trim()) p.set('q', qEl.value.trim());
    const apps = appDropdown.selected();
    const sources = sourceDropdown.selected();
    if (apps.length) p.set('app', apps.join(','));
    if (sources.length) p.set('source', sources.join(','));
    const from = rangeFrom();
    if (from) p.set('from', from);
    if (!showSelfEl.checked) p.set('excludeApp', 'log-viewer');
    return p;
  }

  function renderCards(s: ExceptionStats): void {
    cardsEl.replaceChildren(
      card('Total exceptions', s.overall.count.toLocaleString(), s.overall.count ? 'bad' : ''),
      card('Distinct problems', s.overall.problemCount.toLocaleString()),
      card('Apps affected', s.overall.appCount.toLocaleString())
    );
  }
  function renderPanels(s: ExceptionStats): void {
    chartEl.replaceChildren(stackedBarChart(s.overTime, [{ key: 'count', label: 'Exceptions', varName: '--bad' }]));
    problemsEl.replaceChildren(
      table(
        ['Name', 'Message', 'Count', 'Last seen', 'Apps'],
        s.problems.map((p) => [p.name, p.message, String(p.count), fmtTs(p.lastSeen), p.apps.join(', ')]),
        ['', 'cell-url', '', '', '']
      )
    );
    perAppEl.replaceChildren(
      table(
        ['App', 'Exceptions'],
        s.perApp.slice(0, 10).map((a) => [a.app, String(a.count)])
      )
    );
    bySourceEl.replaceChildren(
      table(
        ['Source', 'Count'],
        s.bySource.map((d) => [pill(d.source, sourceClass(d.source)), String(d.count)])
      )
    );
  }

  function logRow(e: Exception): HTMLElement {
    const row = el(
      'tr',
      { class: 'clickable err' },
      el('td', { class: 'ts' }, fmtTs(e.ts)),
      el('td', {}, e.app),
      el('td', {}, pill(e.source, sourceClass(e.source))),
      el('td', {}, e.name),
      el('td', { class: 'msg', title: e.message }, e.message)
    );
    row.addEventListener('click', () => showExceptionDetail(e));
    return row;
  }

  async function loadStats(): Promise<void> {
    if (selectionEmpty()) {
      renderCards(EMPTY_STATS);
      renderPanels(EMPTY_STATS);
      return;
    }
    const res = await fetch(`api/exceptions/stats?${baseParams().toString()}`);
    if (!res.ok) return;
    const { stats, lastRefresh } = (await res.json()) as { stats: ExceptionStats; lastRefresh: string | null };
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
      const res = await fetch(`api/exceptions?${p.toString()}`);
      if (seq !== loadSeq) return;
      if (!res.ok) {
        logMetaEl.textContent = `Failed to load exceptions (HTTP ${res.status})`;
        return;
      }
      const data = (await res.json()) as ExceptionsResponse;
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
    metaEl.textContent = `${metaCount.toLocaleString()} exceptions · updated ${lastRefresh ? fmtTs(lastRefresh) : '—'}`;
  }
  async function loadMeta(): Promise<void> {
    const res = await fetch('api/exceptions/meta');
    if (!res.ok) return;
    const meta = (await res.json()) as ExceptionMeta;
    appDropdown.setOptions(meta.apps);
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

  for (const control of [rangeEl, showSelfEl]) {
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
