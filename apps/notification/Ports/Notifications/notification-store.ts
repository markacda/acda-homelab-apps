import type { Notification } from '../../Domain/ValueObjects/notification.ts';

/** Persistence for the recent-notifications feed (newest first, capped). */
export interface NotificationStore {
  add(n: Notification): Promise<void>;
  recent(limit: number): Promise<Notification[]>;
}
