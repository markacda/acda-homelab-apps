import { randomUUID } from 'node:crypto';
import type { SubscriptionStore } from '../../Ports/Push/subscription-store.ts';
import type { NotificationStore } from '../../Ports/Notifications/notification-store.ts';
import type { PushSender, PushPayload } from '../../Ports/Push/push-sender.ts';
import { PushSendError } from '../../Ports/Push/push-sender.ts';
import type { PushSubscription } from '../../Domain/ValueObjects/push-subscription.ts';
import type { NewNotification, Notification } from '../../Domain/ValueObjects/notification.ts';
import { createNotification } from '../../Domain/ValueObjects/notification.ts';

/**
 * Orchestrates the push subsystem: records a notification, fans it out to every
 * subscription, and prunes subscriptions the push service reports as gone
 * (404/410). Also fronts the subscription CRUD used by the subscribe endpoints.
 */
export class NotificationService {
  private readonly subs: SubscriptionStore;
  private readonly sender: PushSender;
  private readonly store: NotificationStore;

  constructor(subs: SubscriptionStore, sender: PushSender, store: NotificationStore) {
    this.subs = subs;
    this.sender = sender;
    this.store = store;
  }

  /** Record and broadcast a notification; returns the stamped record. */
  async send(input: NewNotification): Promise<Notification> {
    const notification = createNotification(input, randomUUID(), new Date().toISOString());
    await this.store.add(notification);

    const payload: PushPayload = { title: notification.title, body: notification.message };
    if (notification.url) payload.url = notification.url;
    if (notification.icon) payload.icon = notification.icon;

    const subscriptions = await this.subs.list();
    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await this.sender.send(sub, payload);
        } catch (err) {
          const code = err instanceof PushSendError ? err.statusCode : undefined;
          if (code === 404 || code === 410) {
            await this.subs.remove(sub.endpoint);
          } else {
            console.error(`[push] delivery failed (${code ?? 'no status'}): ${(err as Error).message}`);
          }
        }
      })
    );
    return notification;
  }

  recent(limit: number): Promise<Notification[]> {
    return this.store.recent(limit);
  }

  subscribe(sub: PushSubscription): Promise<void> {
    return this.subs.add(sub);
  }

  unsubscribe(endpoint: string): Promise<void> {
    return this.subs.remove(endpoint);
  }

  publicKey(): string {
    return this.sender.publicKey();
  }
}
