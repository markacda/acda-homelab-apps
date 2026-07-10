// Entry point: a tiny hash router that swaps between the landing page, the
// Requests view and the Logs view, all mounted into <main id="view">.

import { $, el } from './dom.ts';
import { closeSheet } from './sheet.ts';
import { mountRequests } from './requests.ts';
import { mountLogs } from './logs.ts';

const view = $('view');

// Teardown for the currently-mounted view (clears its auto-refresh timer).
let teardown: (() => void) | undefined;

function unmount(): void {
  if (teardown) {
    teardown();
    teardown = undefined;
  }
  closeSheet();
  view.replaceChildren();
}

// ---- landing --------------------------------------------------------------

interface Overall {
  count: number;
  errorCount: number;
  warnCount?: number;
}

async function fetchOverall(url: string): Promise<Overall | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const { stats } = (await res.json()) as { stats: { overall: Overall } };
    return stats.overall;
  } catch {
    return null;
  }
}

interface Tile {
  anchor: HTMLAnchorElement;
  summary: HTMLElement;
}

function tile(href: string, icon: string, title: string, desc: string): Tile {
  const summary = el('div', { class: 'tile-summary' }, '…');
  const anchor = el(
    'a',
    { class: 'tile', href },
    el('div', { class: 'tile-icon' }, icon),
    el('div', { class: 'tile-title' }, title),
    el('div', { class: 'tile-desc' }, desc),
    summary
  );
  return { anchor, summary };
}

function mountLanding(root: HTMLElement): void {
  const requestsTile = tile('#/requests', '🌐', 'Requests', 'Browse & aggregate HTTP access logs');
  const logsTile = tile('#/logs', '📝', 'Logs', 'Browse & aggregate application logs');
  root.replaceChildren(el('section', { class: 'tiles' }, requestsTile.anchor, logsTile.anchor));

  void fetchOverall('/api/stats').then((o) => {
    requestsTile.summary.textContent = o ? `${o.count.toLocaleString()} requests · ${o.errorCount.toLocaleString()} errors` : 'unavailable';
  });
  void fetchOverall('/api/app-logs/stats').then((o) => {
    logsTile.summary.textContent = o
      ? `${o.count.toLocaleString()} logs · ${o.errorCount.toLocaleString()} errors · ${(o.warnCount ?? 0).toLocaleString()} warnings`
      : 'unavailable';
  });
}

// ---- routing --------------------------------------------------------------

function currentRoute(): string {
  const hash = location.hash.replace(/^#/, '');
  if (hash === '/requests') return '/requests';
  if (hash === '/logs') return '/logs';
  return '/';
}

function highlightNav(route: string): void {
  for (const link of document.querySelectorAll<HTMLElement>('.topnav a')) {
    link.classList.toggle('active', link.getAttribute('href') === `#${route}`);
  }
}

function render(): void {
  unmount();
  const route = currentRoute();
  highlightNav(route);
  if (route === '/requests') teardown = mountRequests(view);
  else if (route === '/logs') teardown = mountLogs(view);
  else mountLanding(view);
}

window.addEventListener('hashchange', render);
render();
