// A notification the homelab has sent (or is about to send). `NewNotification` is
// the caller-supplied content; `Notification` is that content stamped with an id
// and creation time, which is what gets persisted and shown in the recent feed.
import { ValidationError } from '../Exceptions/validation-error.ts';

export interface NewNotification {
  title: string;
  message: string;
  /** Which delivery channels to send through (e.g. ["feed"]). Required, non-empty. */
  channels: string[];
  /** Where tapping the notification should take the user (an origin-absolute path or URL). */
  url?: string;
  /** Optional icon URL shown on the notification. */
  icon?: string;
  /** Reserved for future per-user targeting within a channel. */
  receiver?: string;
}

export interface Notification extends NewNotification {
  id: string;
  createdAt: string;
}

/**
 * Validate caller-supplied content and stamp it with the given id/timestamp.
 * Throws {@link ValidationError} on missing title/message so the controller can
 * map it to a 400. Kept pure (id/createdAt injected) so it is trivially testable.
 */
export function createNotification(input: NewNotification, id: string, createdAt: string): Notification {
  const title = input.title?.trim();
  const message = input.message?.trim();
  const channels = (input.channels ?? []).map((c) => c.trim()).filter((c) => c.length > 0);
  if (!title) throw new ValidationError('title is required');
  if (!message) throw new ValidationError('message is required');
  if (channels.length === 0) throw new ValidationError('at least one channel is required');
  const n: Notification = { id, createdAt, title, message, channels };
  if (input.url) n.url = input.url;
  if (input.icon) n.icon = input.icon;
  if (input.receiver) n.receiver = input.receiver;
  return n;
}
