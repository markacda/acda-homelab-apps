import type { FailureNotifier, FailureSummary } from '../../Ports/Notifier/failure-notifier.ts';

/**
 * Posts failed-request alerts to the notification app's internal `/send`
 * endpoint (reached by container name over the docker network). The alert links
 * back to the log viewer (url "/logs/").
 */
export class HttpFailureNotifier implements FailureNotifier {
  private readonly sendUrl: string;
  private readonly token?: string;

  constructor(baseUrl: string, token?: string) {
    this.sendUrl = `${baseUrl.replace(/\/$/, '')}/send`;
    this.token = token;
  }

  async notify(summary: FailureSummary): Promise<void> {
    const { count, latest } = summary;
    const title = count === 1 ? '⚠️ Failed request' : `⚠️ ${count} failed requests`;
    const where = latest.app ? `[${latest.app}] ` : '';
    const message = `${where}${latest.method} ${latest.url} → ${latest.status}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await fetch(this.sendUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title, message, url: '/logs/' }),
    });
    if (!res.ok) throw new Error(`notify HTTP ${res.status}`);
  }
}
