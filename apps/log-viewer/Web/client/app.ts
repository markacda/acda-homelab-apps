// Entry point: a tiny hash router that swaps between the landing page, the
// Requests view and the Logs view, all mounted into <main id="view">.

import { installAuthRedirect } from '../../../Common/auth-client/index.ts';
import { $, el } from './dom.ts';
import { closeSheet } from './sheet.ts';
import { mountRequests } from './requests.ts';
import { mountLogs } from './logs.ts';
import { mountExceptions } from './exceptions.ts';
import { mountDependencies } from './dependencies.ts';
import { mountTrace } from './trace.ts';

// LogViewer is Administrator-gated server-side (issue #153). If a session expires
// while the SPA is open, its API calls start returning 401 — installAuthRedirect
// wraps window.fetch once to bounce to the auth login and return to the exact view
// afterwards. The browser knows our true /logs/…#/view path, which the
// prefix-stripping proxy hides from the server, so the redirect target is precise.
installAuthRedirect();

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

async function fetchOverall(url: string): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const { stats } = (await res.json()) as { stats: { overall: Record<string, number> } };
    return stats.overall;
  } catch {
    return null;
  }
}

const num = (o: Record<string, number> | null, k: string): string => (o ? (o[k] ?? 0).toLocaleString() : '—');

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
  const exceptionsTile = tile('#/exceptions', '💥', 'Exceptions', 'Grouped faults with stack traces');
  const dependenciesTile = tile('#/dependencies', '🔗', 'Dependencies', 'Outbound HTTP & database calls');
  root.replaceChildren(el('section', { class: 'tiles' }, requestsTile.anchor, logsTile.anchor, exceptionsTile.anchor, dependenciesTile.anchor));

  void fetchOverall('api/stats').then((o) => {
    requestsTile.summary.textContent = o ? `${num(o, 'count')} requests · ${num(o, 'errorCount')} errors` : 'unavailable';
  });
  void fetchOverall('api/app-logs/stats').then((o) => {
    logsTile.summary.textContent = o ? `${num(o, 'count')} logs · ${num(o, 'errorCount')} errors · ${num(o, 'warnCount')} warnings` : 'unavailable';
  });
  void fetchOverall('api/exceptions/stats').then((o) => {
    exceptionsTile.summary.textContent = o ? `${num(o, 'count')} exceptions · ${num(o, 'problemCount')} problems` : 'unavailable';
  });
  void fetchOverall('api/dependencies/stats').then((o) => {
    dependenciesTile.summary.textContent = o ? `${num(o, 'count')} calls · ${num(o, 'failureCount')} failures` : 'unavailable';
  });
}

function currentRoute(): string {
  const hash = location.hash.replace(/^#/, '');
  if (hash === '/requests') return '/requests';
  if (hash === '/logs') return '/logs';
  if (hash === '/exceptions') return '/exceptions';
  if (hash === '/dependencies') return '/dependencies';
  return '/';
}

function highlightNav(route: string): void {
  for (const link of document.querySelectorAll<HTMLElement>('.topnav a')) {
    link.classList.toggle('active', link.getAttribute('href') === `#${route}`);
  }
}

function render(): void {
  unmount();
  const hash = location.hash.replace(/^#/, '');
  // The trace view is a parameterised route (#/trace/<id>) with no nav entry.
  if (hash.startsWith('/trace/')) {
    highlightNav('');
    teardown = mountTrace(view, decodeURIComponent(hash.slice('/trace/'.length)));
    return;
  }
  const route = currentRoute();
  highlightNav(route);
  if (route === '/requests') teardown = mountRequests(view);
  else if (route === '/logs') teardown = mountLogs(view);
  else if (route === '/exceptions') teardown = mountExceptions(view);
  else if (route === '/dependencies') teardown = mountDependencies(view);
  else mountLanding(view);
}

window.addEventListener('hashchange', render);
render();
