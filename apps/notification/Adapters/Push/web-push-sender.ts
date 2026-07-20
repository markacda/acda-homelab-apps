import type { PushSender, PushPayload } from '../../Ports/Push/push-sender.ts';
import type { PushSubscription } from '../../Domain/ValueObjects/push-subscription.ts';

/**
 * Push sender for the homelab. Actual Web Push delivery is currently DISABLED:
 * the notification app still records notifications (so /send and the feed work)
 * and exposes the public-key / subscribe endpoints, but nothing is pushed to
 * devices yet. Reinstate delivery when the PWA/push work is picked back up.
 */
export class WebPushSender implements PushSender {
  private readonly pub: string;

  constructor(publicKey: string, _privateKey: string, _subject: string) {
    this.pub = publicKey;
  }

  publicKey(): string {
    return this.pub;
  }

  send(_sub: PushSubscription, _payload: PushPayload): Promise<void> {
    // TODO: actually deliver the payload as a Web Push here — configure VAPID
    // details from the keys, call web-push `sendNotification`, and throw a
    // PushSendError (carrying the HTTP status) so the service prunes gone
    // subscriptions (404/410). Deferred with the PWA/push work.
    return Promise.resolve();
  }
}
