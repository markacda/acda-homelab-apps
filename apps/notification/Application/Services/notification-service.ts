import { randomUUID } from 'node:crypto';
import type { NotificationStore } from '../../Ports/Notifications/notification-store.ts';
import type { NewNotification, Notification } from '../../Domain/ValueObjects/notification.ts';
import { createNotification } from '../../Domain/ValueObjects/notification.ts';

/**
 * Records notifications and serves the recent-notifications feed. Other apps call
 * `POST /send` to record one (e.g. log-viewer on new server errors).
 *
 * NOTE: actual push delivery to devices is not implemented — see the TODO in
 * send(). The push-subscription/web-push subsystem was removed with the PWA work.
 */
export class NotificationService {
  private readonly store: NotificationStore;

  constructor(store: NotificationStore) {
    this.store = store;
  }

  /** Record a notification and return the stamped record. */
  async send(input: NewNotification): Promise<Notification> {
    const notification = createNotification(input, randomUUID(), new Date().toISOString());
    await this.store.add(notification);
    // TODO: also deliver this as a Web Push to subscribed devices. The push
    // subsystem (subscription store + web-push sender + subscribe/public-key
    // endpoints) was removed with the PWA work; reintroduce it here to actually
    // notify devices rather than only recording the notification.
    return notification;
  }

  recent(limit: number): Promise<Notification[]> {
    return this.store.recent(limit);
  }
}
