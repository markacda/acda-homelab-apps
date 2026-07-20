import type { Notification } from '../../Domain/ValueObjects/notification.ts';

/**
 * A way to deliver a notification beyond the in-app feed. Every notification is
 * always recorded in the feed (see NotificationService); channels are the extra
 * delivery mechanisms (email, push, …) applied on top, one adapter per mechanism.
 * The dispatcher fans a notification out over each channel named in POST /send.
 *
 * EMAIL is a skeleton (Adapters/Email/email-channel.ts) showing the shape. Adding
 * a channel is a drop-in: add an Adapters/<X>/<x>-channel.ts implementing this
 * interface, gate it on its env config, and push it onto the `channels` array in
 * register.ts. Candidates (comment-only, not yet scaffolded):
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
