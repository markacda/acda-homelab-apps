// Settings page: shows the current notification status and, when notifications
// are ignored or blocked, offers a button to (re-)request permission. Reuses the
// permission/subscribe helpers from pwa.ts so the flow matches the banner.
import { getStatus, requestPermissionAndSubscribe, registerServiceWorker } from './pwa.ts';
import type { NotifStatus } from './pwa.ts';

const STATUS_LABEL: Record<NotifStatus, string> = {
  accepted: 'Accepted',
  rejected: 'Rejected',
  ignored: 'Ignored',
  unsupported: 'Not supported',
};

const STATUS_DESC: Record<NotifStatus, string> = {
  accepted: 'You will receive homelab notifications on this device.',
  rejected: 'Notifications are blocked for this site. Try the button below; if it stays blocked, enable them in your browser or OS settings.',
  ignored: 'You have not enabled notifications yet.',
  unsupported: 'This browser does not support notifications.',
};

const statusEl = document.getElementById('notif-status') as HTMLElement;
const descEl = document.getElementById('notif-desc') as HTMLElement;
const enableBtn = document.getElementById('notif-enable') as HTMLButtonElement;
const hintEl = document.getElementById('notif-hint') as HTMLElement;

function render(): void {
  const status = getStatus();
  statusEl.textContent = STATUS_LABEL[status];
  statusEl.className = `status-badge ${status}`;
  descEl.textContent = STATUS_DESC[status];
  // Re-request only makes sense while the decision is still open or was blocked.
  enableBtn.hidden = !(status === 'ignored' || status === 'rejected');
}

enableBtn.addEventListener('click', async () => {
  enableBtn.disabled = true;
  hintEl.hidden = true;
  const before = getStatus();
  const after = await requestPermissionAndSubscribe();
  enableBtn.disabled = false;
  render();
  // A blocked permission can't be re-prompted from JS — guide the user.
  if (before === 'rejected' && after === 'rejected') {
    hintEl.hidden = false;
    hintEl.textContent = 'Still blocked — enable notifications for this site in your browser/OS settings, then reload.';
  }
});

void registerServiceWorker();
render();
