import { optStr } from '../../../Common/http-utils/index.ts';
import type { PushSubscription } from '../../Domain/ValueObjects/push-subscription.ts';
import { toPushSubscription } from '../../Domain/ValueObjects/push-subscription.ts';

/** Parse `POST /api/push/subscribe` — the raw PushSubscription JSON from the browser. */
export function toSubscribeRequest(body: unknown): PushSubscription {
  return toPushSubscription(body);
}

/** Parse the endpoint out of `POST /api/push/unsubscribe` (a `{ endpoint }` body). */
export function toUnsubscribeEndpoint(body: unknown): string | undefined {
  const obj = (body ?? {}) as Record<string, unknown>;
  return optStr(obj.endpoint);
}
