// PWA glue for the homelab, loaded only by the dashboard (the hub). It registers
// the root-scope service worker, drives the install + notification-permission
// banners and the info modal, and exposes the notification helpers the settings
// page reuses. Push permission/subscription are origin-wide, so doing this on
// the dashboard covers the whole PWA.

/** Where the notification app is reachable through the proxy (same origin). */
const NOTIF_BASE = '/notificaties';
/** localStorage flag: the user chose "Don't ask again" for notifications. */
const DECLINED_KEY = 'homelab.notif.declined';

export type NotifStatus = 'accepted' | 'rejected' | 'ignored' | 'unsupported';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function notificationsSupported(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

/** Map the browser permission (plus support) to our three display states. */
export function getStatus(): NotifStatus {
  if (!notificationsSupported()) return 'unsupported';
  const perm = Notification.permission;
  if (perm === 'granted') return 'accepted';
  if (perm === 'denied') return 'rejected';
  return 'ignored';
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.error('[pwa] service worker registration failed', err);
    return null;
  }
}

/** VAPID keys arrive base64url-encoded; PushManager wants an ArrayBuffer view. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function fetchPublicKey(): Promise<string> {
  const res = await fetch(`${NOTIF_BASE}/api/push/public-key`);
  if (!res.ok) throw new Error(`public-key HTTP ${res.status}`);
  const data = (await res.json()) as { publicKey?: string };
  return data.publicKey ?? '';
}

/** Create (or reuse) the browser push subscription and register it server-side. */
async function subscribeToPush(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const key = await fetchPublicKey();
  if (!key) throw new Error('server has no VAPID public key configured');
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    }));
  const res = await fetch(`${NOTIF_BASE}/api/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription),
  });
  if (!res.ok) throw new Error(`subscribe HTTP ${res.status}`);
}

/**
 * Ask for notification permission and, if granted, subscribe to push. Clears the
 * "Don't ask again" flag (the user is actively opting in). Returns the resulting
 * status. Exported so the settings page can reuse the same flow.
 */
export async function requestPermissionAndSubscribe(): Promise<NotifStatus> {
  if (!notificationsSupported()) return 'unsupported';
  localStorage.removeItem(DECLINED_KEY);
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    try {
      await subscribeToPush();
    } catch (err) {
      console.error('[pwa] push subscribe failed', err);
    }
  }
  return getStatus();
}

function setupNotifBanner(): void {
  const banner = document.getElementById('notif-banner');
  if (!banner) return;
  const declined = localStorage.getItem(DECLINED_KEY) === '1';
  // Only prompt while the decision is still open and the user hasn't opted out.
  if (getStatus() !== 'ignored' || declined) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  document.getElementById('notif-enable')?.addEventListener('click', async () => {
    await requestPermissionAndSubscribe();
    banner.hidden = true;
  });
  document.getElementById('notif-decline')?.addEventListener('click', () => {
    localStorage.setItem(DECLINED_KEY, '1'); // never ask again
    banner.hidden = true;
  });
  document.getElementById('notif-close')?.addEventListener('click', () => {
    banner.hidden = true; // transient dismiss — returns on the next page load
  });
  // If permission is granted (e.g. from another page), make sure we hold a
  // live subscription without prompting.
  if (getStatus() === 'accepted') void subscribeToPush().catch(() => {});
}

function setupInstallBanner(): void {
  const banner = document.getElementById('install-banner');
  if (!banner) return;
  let deferred: BeforeInstallPromptEvent | null = null;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // suppress the mini-infobar; we show our own banner
    deferred = event as BeforeInstallPromptEvent;
    banner.hidden = false;
  });
  document.getElementById('install-btn')?.addEventListener('click', async () => {
    banner.hidden = true;
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    deferred = null;
  });
  document.getElementById('install-close')?.addEventListener('click', () => {
    banner.hidden = true;
  });
  window.addEventListener('appinstalled', () => {
    banner.hidden = true;
    deferred = null;
  });
}

function setupInfoModal(): void {
  const modal = document.getElementById('info-modal');
  const openBtn = document.getElementById('info-btn');
  if (!modal || !openBtn) return;
  const open = (): void => {
    modal.hidden = false;
  };
  const close = (): void => {
    modal.hidden = true;
  };
  openBtn.addEventListener('click', open);
  modal.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) close();
  });
}

/** Wire up everything the dashboard page owns. Call once on load. */
export function initDashboardPwa(): void {
  void registerServiceWorker();
  setupInstallBanner();
  setupNotifBanner();
  setupInfoModal();
}
