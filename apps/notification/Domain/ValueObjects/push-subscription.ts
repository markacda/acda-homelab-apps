import { ValidationError } from '../Exceptions/validation-error.ts';

// A W3C Push API subscription as produced by the browser's PushManager and
// consumed by the web-push library. `endpoint` uniquely identifies a device;
// `keys` carry the ECDH public key + auth secret used to encrypt the payload.
export interface PushSubscription {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/** Validate an untrusted body into a PushSubscription, or throw a 400. */
export function toPushSubscription(raw: unknown): PushSubscription {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const endpoint = typeof obj.endpoint === 'string' ? obj.endpoint : '';
  const keys = (obj.keys ?? {}) as Record<string, unknown>;
  const p256dh = typeof keys.p256dh === 'string' ? keys.p256dh : '';
  const auth = typeof keys.auth === 'string' ? keys.auth : '';
  if (!endpoint) throw new ValidationError('subscription endpoint is required');
  if (!p256dh || !auth) throw new ValidationError('subscription keys (p256dh, auth) are required');
  const sub: PushSubscription = { endpoint, keys: { p256dh, auth } };
  if (typeof obj.expirationTime === 'number') sub.expirationTime = obj.expirationTime;
  return sub;
}
