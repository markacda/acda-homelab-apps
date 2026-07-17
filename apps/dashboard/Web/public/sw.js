// Homelab PWA service worker. Registered at the origin root by the dashboard, so
// its scope ("/") covers every app behind the proxy. Responsibilities: receive
// Web Push messages and show notifications, and open the right app when tapped.
// No offline caching — a redeploy is always picked up, and there are no stale
// assets to debug. The empty fetch handler exists only to satisfy older
// installability heuristics.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Homelab', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Homelab';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(url);
            } catch {
              // Cross-origin or navigation not allowed — ignore and keep focus.
            }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});

self.addEventListener('fetch', () => {});
