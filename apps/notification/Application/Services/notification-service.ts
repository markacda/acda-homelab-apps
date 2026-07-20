import { randomUUID } from 'node:crypto';
import type { NotificationStore } from '../../Ports/Notifications/notification-store.ts';
import type { NotificationChannel } from '../../Ports/Channels/notification-channel.ts';
import type { NewNotification, Notification } from '../../Domain/ValueObjects/notification.ts';
import { createNotification } from '../../Domain/ValueObjects/notification.ts';
import { ValidationError } from '../../Domain/Exceptions/validation-error.ts';

/**
 * Records notifications and serves the recent-notifications feed. Other apps call
 * `POST /send` to deliver one (e.g. log-viewer on new server errors), naming the
 * channel(s) to use.
 *
 * Acts as the dispatcher: `send` stamps the notification and fans it out over the
 * requested channels. One channel failing is logged but never fails the request
 * or blocks the others (Promise.allSettled). The feed channel is what backs
 * `recent()`, so `recent()` reads the store directly.
 */
export class NotificationService {
  private readonly store: NotificationStore;
  private readonly channels: Map<string, NotificationChannel>;

  constructor(store: NotificationStore, channels: NotificationChannel[]) {
    this.store = store;
    this.channels = new Map(channels.map((c) => [c.name, c]));
  }

  /** Stamp, dispatch to the requested channels, and return the stamped record. */
  async send(input: NewNotification): Promise<Notification> {
    const notification = createNotification(input, randomUUID(), new Date().toISOString());

    const targets = notification.channels.map((name) => {
      const channel = this.channels.get(name);
      if (!channel) throw new ValidationError(`unknown channel "${name}"`);
      return channel;
    });

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
