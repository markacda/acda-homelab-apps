// Notification feed: polls the server for recent notifications and renders them.
// Served under the /notificaties/ proxy prefix, so all fetches use RELATIVE URLs
// (the prefix is stripped before it reaches the app).

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  url?: string;
  icon?: string;
  createdAt: string;
}

interface NotificationsResponse {
  notifications?: NotificationItem[];
}

const REFRESH_MS = 15_000;

const listEl = document.getElementById('list') as HTMLElement;
const metaEl = document.getElementById('meta') as HTMLElement;

/** Human-friendly relative time ("just now", "5m ago", "3h ago", or a date). */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 45) return 'just now';
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return new Date(iso).toLocaleString();
}

function itemEl(n: NotificationItem): HTMLElement {
  const item = document.createElement(n.url ? 'a' : 'div');
  item.className = 'item';
  if (n.url && item instanceof HTMLAnchorElement) {
    item.href = n.url;
    item.target = '_self';
  }

  const title = document.createElement('div');
  title.className = 'item-title';
  title.textContent = n.title;

  const msg = document.createElement('div');
  msg.className = 'item-msg';
  msg.textContent = n.message;

  const time = document.createElement('div');
  time.className = 'item-time';
  time.textContent = relativeTime(n.createdAt);
  time.title = n.createdAt;

  item.append(title, msg, time);
  return item;
}

function render(notifications: NotificationItem[]): void {
  listEl.innerHTML = '';
  if (notifications.length === 0) {
    listEl.innerHTML = '<p class="placeholder">No notifications yet.</p>';
    metaEl.textContent = '';
    return;
  }
  notifications.forEach((n) => listEl.appendChild(itemEl(n)));
  metaEl.textContent = `${notifications.length} notification${notifications.length === 1 ? '' : 's'}`;
}

async function refresh(): Promise<void> {
  try {
    const res = await fetch('api/notifications');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as NotificationsResponse;
    render(data.notifications ?? []);
  } catch (err) {
    listEl.innerHTML = `<p class="placeholder">Failed to load notifications: ${(err as Error).message}</p>`;
  }
}

void refresh();
setInterval(() => void refresh(), REFRESH_MS);
