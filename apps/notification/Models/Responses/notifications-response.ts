import type { Notification } from '../../Domain/ValueObjects/notification.ts';

/** Response body of `GET /api/notifications`. */
export interface NotificationsResponse {
  notifications: Notification[];
}
