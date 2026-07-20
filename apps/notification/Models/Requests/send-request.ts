import { optStr, toStringArray } from '../../../Common/http-utils/index.ts';
import type { NewNotification } from '../../Domain/ValueObjects/notification.ts';

/**
 * Parse the JSON body of `POST /send` into caller-supplied notification content.
 * `title`/`message` are required (validated downstream in createNotification);
 * `url`/`icon`/`receiver` are optional trimmed strings. `channels` is optional
 * (every notification is recorded in the feed regardless) and accepts a JSON
 * array (or newline-separated string) of extra delivery-channel names.
 */
export function toNewNotification(body: unknown): NewNotification {
  const obj = (body ?? {}) as Record<string, unknown>;
  const input: NewNotification = {
    title: optStr(obj.title) ?? '',
    message: optStr(obj.message) ?? optStr(obj.body) ?? '',
    channels: toStringArray(obj.channels),
  };
  const url = optStr(obj.url) ?? optStr(obj.clickAction);
  const icon = optStr(obj.icon);
  const receiver = optStr(obj.receiver);
  if (url) input.url = url;
  if (icon) input.icon = icon;
  if (receiver) input.receiver = receiver;
  return input;
}
