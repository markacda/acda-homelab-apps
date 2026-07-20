import { randomUUID } from 'node:crypto';
import type { NotificationStore } from '../../Ports/Notifications/notification-store.ts';
import type { NewNotification, Notification } from '../../Domain/ValueObjects/notification.ts';
import { createNotification } from '../../Domain/ValueObjects/notification.ts';

/**
 * Records notifications and serves the recent-notifications feed. Other apps call
 * `POST /send` to record one (e.g. log-viewer on new server errors).
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
    return notification;
  }

  recent(limit: number): Promise<Notification[]> {
    return this.store.recent(limit);
  }
}
