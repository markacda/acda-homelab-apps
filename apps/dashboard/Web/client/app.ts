interface AppTile {
  name?: string;
  url?: string | null;
  port?: number | null;
  icon?: string | null;
  group?: string | null;
  status?: string | null;
  lastChecked?: string | null;
}

interface ApiResponse {
  title?: string;
  apps?: AppTile[];
}

const REFRESH_MS = 30_000;

/** Generic placeholder shown in place of an icon when an app has no image. */
const FALLBACK_EMOJI = '📦';
/** The app moved out of the tile grid into the header logs button. */
const LOGS_APP_NAME = 'Logs';

const titleEl = document.getElementById('title') as HTMLElement;
const metaEl = document.getElementById('meta') as HTMLElement;
const contentEl = document.getElementById('content') as HTMLElement;
const logsLinkEl = document.getElementById('logs-link') as HTMLAnchorElement;

/** Build the click-through URL. Prefer an explicit url; otherwise use the
 * browser's current hostname + the published port so links work from any
 * client on the network. */
function resolveHref(app: AppTile): string {
  if (app.url) return app.url;
  if (app.port) return `${location.protocol}//${location.hostname}:${app.port}`;
  return '#';
}

function iconEl(app: AppTile): HTMLElement {
  if (app.icon && /^(https?:\/\/|\/)/.test(app.icon)) {
    const img = document.createElement('img');
    img.className = 'tile-icon';
    img.src = app.icon;
    img.alt = '';
    img.loading = 'lazy';
    // Fall back to the emoji placeholder if the image fails to load.
    img.onerror = () => img.replaceWith(fallbackIcon());
    return img;
  }
  if (app.icon) {
    // Treat as a slug: try the dashboard-icons CDN, fall back to the emoji.
    const img = document.createElement('img');
    img.className = 'tile-icon';
    img.src = `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/${app.icon}.png`;
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = () => img.replaceWith(fallbackIcon());
    return img;
  }
  return fallbackIcon();
}

function fallbackIcon(): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'tile-icon emoji';
  wrap.textContent = FALLBACK_EMOJI;
  return wrap;
}

function tileEl(app: AppTile): HTMLAnchorElement {
  const href = resolveHref(app);
  const a = document.createElement('a');
  a.className = 'tile';
  a.href = href;
  a.target = '_self';
  a.rel = 'noopener noreferrer';

  a.appendChild(iconEl(app));

  const body = document.createElement('div');
  body.className = 'tile-body';
  const name = document.createElement('div');
  name.className = 'tile-name';
  name.textContent = app.name || 'Unnamed';
  const sub = document.createElement('div');
  sub.className = 'tile-sub';
  sub.textContent = href === '#' ? 'no url' : href.replace(/^https?:\/\//, '');
  body.append(name, sub);
  a.appendChild(body);

  const dot = document.createElement('span');
  dot.className = `status-dot ${app.status || 'unknown'}`;
  dot.title = `Status: ${app.status || 'unknown'}`;
  a.appendChild(dot);

  return a;
}

function render(data: ApiResponse): void {
  const { title, apps } = data;
  if (title) {
    titleEl.textContent = title;
    document.title = title;
  }

  contentEl.innerHTML = '';

  // Pull the logs app out of the grid into the header button.
  const logsApp = apps?.find((a) => a.name === LOGS_APP_NAME);
  if (logsApp) {
    logsLinkEl.href = resolveHref(logsApp);
    logsLinkEl.hidden = false;
  } else {
    logsLinkEl.hidden = true;
  }
  const visible = (apps ?? []).filter((a) => a.name !== LOGS_APP_NAME);

  if (visible.length === 0) {
    contentEl.innerHTML = '<p class="placeholder">No apps found. Check your config or Docker labels.</p>';
    metaEl.textContent = '';
    return;
  }

  const hasGroups = visible.some((a) => a.group);
  if (hasGroups) {
    const groups = new Map<string, AppTile[]>();
    for (const app of visible) {
      const key = app.group || 'Other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(app);
    }
    for (const [group, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const h = document.createElement('h2');
      h.className = 'group-title';
      h.textContent = group;
      contentEl.appendChild(h);
      const grid = document.createElement('div');
      grid.className = 'grid';
      list.forEach((app) => grid.appendChild(tileEl(app)));
      contentEl.appendChild(grid);
    }
  } else {
    const grid = document.createElement('div');
    grid.className = 'grid';
    visible.forEach((app) => grid.appendChild(tileEl(app)));
    contentEl.appendChild(grid);
  }

  const up = visible.filter((a) => a.status === 'up').length;
  metaEl.textContent = `${visible.length} app${visible.length === 1 ? '' : 's'} · ${up} up`;
}

async function refresh(): Promise<void> {
  try {
    const res = await fetch('/api/apps');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    render((await res.json()) as ApiResponse);
  } catch (err) {
    contentEl.innerHTML = `<p class="placeholder">Failed to load apps: ${(err as Error).message}</p>`;
  }
}

refresh();
setInterval(refresh, REFRESH_MS);
