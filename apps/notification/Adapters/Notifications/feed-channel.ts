import type { NotificationChannel } from '../../Ports/Channels/notification-channel.ts';
import type { NotificationStore } from '../../Ports/Notifications/notification-store.ts';
import type { Notification } from '../../Domain/ValueObjects/notification.ts';

/**
 * The in-app feed channel: "delivering" a notification means appending it to the
 * recent-notifications store that backs GET /api/notifications. This is the one
 * fully-implemented channel; it wraps the retained {@link NotificationStore}.
 */
export class FeedChannel implements NotificationChannel {
  readonly name = 'feed';
  private readonly store: NotificationStore;

  constructor(store: NotificationStore) {
    this.store = store;
  }

  deliver(notification: Notification): Promise<void> {
    return this.store.add(notification);
  }
}
