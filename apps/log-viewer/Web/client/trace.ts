// The Trace view: every record (requests, logs, exceptions, dependencies) that
// shares one trace id, merged into a single timeline ordered by timestamp
// ascending. Reached via a trace-id link in any side sheet (#/trace/<id>).
// Clicking a row opens the very same side sheet it would on its own page.

import { el, pill, fmtTs, fmtMs, statusClassName, levelClass, sourceClass, outcomePill } from './dom.ts';
import { openDetail, type TraceItem } from './details.ts';

interface TraceResponse {
  traceId: string;
  lastRefresh: string | null;
  items: TraceItem[];
}

const KIND_LABEL: Record<TraceItem['kind'], string> = {
  request: 'Request',
  log: 'Log',
  exception: 'Exception',
  dependency: 'Dependency',
};
// Reuse the existing level/source pill colours to tint each kind.
const KIND_CLASS: Record<TraceItem['kind'], string> = {
  request: 'lvl-info',
  log: 'lvl-debug',
  exception: 'lvl-error',
  dependency: 'lvl-warn',
};

/** A one-line description + status/duration cell content for a timeline row. */
function describe(item: TraceItem): { detail: string; status: HTMLElement | string; duration: string; err: boolean } {
  switch (item.kind) {
    case 'request': {
      const e = item.entry;
      return {
        detail: `${e.method ?? ''} ${e.url ?? ''}`.trim(),
        status: pill(String(e.status), statusClassName(e.status)),
        duration: fmtMs(e.durationMs),
        err: e.status >= 400,
      };
    }
    case 'log': {
      const e = item.entry;
      return { detail: e.message, status: pill(e.level, levelClass(e.level)), duration: '', err: e.level === 'error' };
    }
    case 'exception': {
      const e = item.entry;
      return { detail: `${e.name}: ${e.message}`, status: pill(e.source, sourceClass(e.source)), duration: '', err: true };
    }
    case 'dependency': {
      const e = item.entry;
      return {
        detail: `${e.type} · ${e.name}`,
        status: e.status !== undefined ? pill(String(e.status), statusClassName(e.status)) : outcomePill(e.success),
        duration: fmtMs(e.durationMs),
        err: !e.success,
      };
    }
  }
}

/** Mount the Trace view for `traceId` into `root`. Returns a no-op teardown. */
export function mountTrace(root: HTMLElement, traceId: string): () => void {
  const metaEl = el('span', { class: 'meta' });
  const refreshBtn = el('button', { type: 'button' }, 'Refresh');
  const tbody = el('tbody');

  root.replaceChildren(
    el('div', { class: 'view-head' }, el('h2', { class: 'view-title' }, 'Trace'), el('code', { class: 'trace-id' }, traceId), metaEl, refreshBtn),
    el(
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
            el('th', {}, 'Time'),
            el('th', {}, 'Kind'),
            el('th', {}, 'App'),
            el('th', {}, 'Detail'),
            el('th', {}, 'Status'),
            el('th', {}, 'Duration')
          )
        ),
        tbody
      )
    )
  );

  function row(item: TraceItem): HTMLElement {
    const d = describe(item);
    const tr = el(
      'tr',
      { class: d.err ? 'clickable err' : 'clickable' },
      el('td', { class: 'ts' }, fmtTs(item.entry.ts)),
      el('td', {}, pill(KIND_LABEL[item.kind], KIND_CLASS[item.kind])),
      el('td', {}, item.entry.app),
      el('td', { class: 'msg', title: d.detail }, d.detail),
      el('td', {}, d.status),
      el('td', { class: 'dur' }, d.duration)
    );
    tr.addEventListener('click', () => openDetail(item));
    return tr;
  }

  async function load(): Promise<void> {
    let data: TraceResponse;
    try {
      const res = await fetch(`api/trace/${encodeURIComponent(traceId)}`);
      if (!res.ok) {
        metaEl.textContent = `Failed to load trace (HTTP ${res.status})`;
        return;
      }
      data = (await res.json()) as TraceResponse;
    } catch {
      metaEl.textContent = 'Failed to load trace';
      return;
    }
    tbody.replaceChildren(...data.items.map(row));
    metaEl.textContent = data.items.length
      ? `${data.items.length} record${data.items.length === 1 ? '' : 's'} · updated ${data.lastRefresh ? fmtTs(data.lastRefresh) : '—'}`
      : 'No records found for this trace id';
  }

  refreshBtn.addEventListener('click', () => load());
  load();

  return () => {};
}
