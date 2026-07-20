import { randomUUID } from 'node:crypto';
import type { NotificationStore } from '../../Ports/Notifications/notification-store.ts';
import type { NotificationChannel } from '../../Ports/Channels/notification-channel.ts';
import type { NewNotification, Notification } from '../../Domain/ValueObjects/notification.ts';
import { createNotification } from '../../Domain/ValueObjects/notification.ts';
import { ValidationError } from '../../Domain/Exceptions/validation-error.ts';

/**
 * Records notifications and serves the recent-notifications feed. Other apps call
 * `POST /send` to record one (e.g. log-viewer on new server errors) and may name
 * extra delivery channels to send it through.
 *
 * Every notification is written to the feed store (which backs `recent()` /
 * GET /api/notifications). Any requested channels (email, push, …) are then
 * delivered on top: one channel failing is logged but never fails the request or
 * blocks the others or the feed (Promise.allSettled). An unknown channel name is
 * a ValidationError (400) raised before anything is stored.
 */
export class NotificationService {
  private readonly store: NotificationStore;
  private readonly channels: Map<string, NotificationChannel>;

  constructor(store: NotificationStore, channels: NotificationChannel[]) {
    this.store = store;
    this.channels = new Map(channels.map((c) => [c.name, c]));
  }

  /** Stamp, record in the feed, deliver to any requested channels, return the record. */
  async send(input: NewNotification): Promise<Notification> {
    const notification = createNotification(input, randomUUID(), new Date().toISOString());

    // Resolve requested delivery channels up front so an unknown name is a 400
    // before we persist anything.
    const targets = (notification.channels ?? []).map((name) => {
      const channel = this.channels.get(name);
      if (!channel) throw new ValidationError(`unknown channel "${name}"`);
      return channel;
    });

    // The feed is always written, regardless of delivery channels.
    await this.store.add(notification);

    const results = await Promise.allSettled(targets.map((c) => c.deliver(notification)));
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        console.warn(`[notification] channel "${targets[i].name}" failed:`, result.reason);
      }
    });

    return notification;
  }

  recent(limit: number): Promise<Notification[]> {
    return this.store.recent(limit);
  }
}
