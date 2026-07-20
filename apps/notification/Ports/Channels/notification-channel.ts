import type { Notification } from '../../Domain/ValueObjects/notification.ts';

/**
 * A way to deliver a notification. One adapter per mechanism; the dispatcher
 * (NotificationService) fans a notification out over every requested channel.
 *
 * The in-app FEED channel is fully implemented; EMAIL is a skeleton
 * (Adapters/Email/email-channel.ts) showing the shape. Adding a channel is a
 * drop-in: add an Adapters/<X>/<x>-channel.ts implementing this interface, gate
 * it on its env config, and push it onto the `channels` array in register.ts.
 * Remaining candidates (comment-only, not yet scaffolded):
 *   - web-push : browser push — VAPID keys + a subscription store + a service worker
 *   - websocket: live push to the open feed page — a ws server + client upgrade
 *   - webhook  : HTTP POST to configured URLs (Slack/Discord/generic)
 */
export interface NotificationChannel {
  /** Stable id used for per-call targeting (the `channels` field of POST /send). */
  readonly name: string;
  /** Deliver one notification. Throwing is fine — the dispatcher isolates failures. */
  deliver(notification: Notification): Promise<void>;
}
