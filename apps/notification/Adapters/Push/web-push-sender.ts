import webpush from 'web-push';
import type { PushSender, PushPayload } from '../../Ports/Push/push-sender.ts';
import { PushSendError } from '../../Ports/Push/push-sender.ts';
import type { PushSubscription } from '../../Domain/ValueObjects/push-subscription.ts';

/**
 * web-push-backed sender. If VAPID keys are absent it stays "unconfigured":
 * publicKey() returns '' and send() throws, so the app still boots (and the
 * settings/subscribe UI degrades gracefully) until keys are provided.
 */
export class WebPushSender implements PushSender {
  private readonly pub: string;
  private readonly configured: boolean;

  constructor(publicKey: string, privateKey: string, subject: string) {
    this.pub = publicKey;
    this.configured = Boolean(publicKey && privateKey);
    if (this.configured) webpush.setVapidDetails(subject, publicKey, privateKey);
  }

  publicKey(): string {
    return this.pub;
  }

  async send(sub: PushSubscription, payload: PushPayload): Promise<void> {
    if (!this.configured) throw new PushSendError('push not configured (missing VAPID keys)');
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload));
    } catch (err) {
      const e = err as { statusCode?: number; message?: string };
      throw new PushSendError(e.message ?? 'push send failed', e.statusCode);
    }
  }
}
