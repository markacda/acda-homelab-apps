import type { FailureNotifier, FailureSummary } from '../../Ports/Notifier/failure-notifier.ts';

/**
 * Posts failed-request alerts to the notification app's internal `/send`
 * endpoint (reached by container name over the docker network). The alert
 * message includes the response body's `error` when one was captured, and its
 * url deep-links the log viewer straight to the failed request's detail sheet
 * (falling back to the Requests view when the timestamp is unknown).
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
    const base = `${where}${latest.method} ${latest.url} → ${latest.status}`;
    const message = latest.error ? `${base}: ${latest.error}` : base;
    // Deep-link the log viewer to this exact request's detail sheet (see the
    // Requests view's `ts` deep-link handling); fall back to the list otherwise.
    const url = latest.ts ? `/logs/#/requests?ts=${encodeURIComponent(latest.ts)}` : '/logs/';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await fetch(this.sendUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title, message, url }),
    });
    if (!res.ok) throw new Error(`notify HTTP ${res.status}`);
  }
}
