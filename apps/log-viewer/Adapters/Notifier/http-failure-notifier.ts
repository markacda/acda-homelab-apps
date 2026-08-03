import type { Notifier, AlertMessage } from '../../Ports/Notifier/failure-notifier.ts';

/**
 * Posts alerts to the notification app's internal `/send` endpoint (reached by
 * container name over the docker network). Alerts link back to the log viewer
 * (url "/logs/") unless the caller overrides it.
 */
export class HttpFailureNotifier implements Notifier {
  private readonly sendUrl: string;
  private readonly token?: string;

  constructor(baseUrl: string, token?: string) {
    this.sendUrl = `${baseUrl.replace(/\/$/, '')}/send`;
    this.token = token;
  }

  async notify(alert: AlertMessage): Promise<void> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await fetch(this.sendUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: alert.title, message: alert.message, url: alert.url ?? '/logs/' }),
    });
    if (!res.ok) throw new Error(`notify HTTP ${res.status}`);
  }
}
