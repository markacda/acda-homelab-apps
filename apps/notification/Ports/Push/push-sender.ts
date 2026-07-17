import type { PushSubscription } from '../../Domain/ValueObjects/push-subscription.ts';

/** The encrypted payload delivered to the service worker's `push` handler. */
export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

/** Sends an encrypted Web Push message to a single subscription. */
export interface PushSender {
  /** The VAPID public key clients must use as `applicationServerKey`. */
  publicKey(): string;
  /** Deliver a payload; throws {@link PushSendError} (carrying the HTTP status) on failure. */
  send(sub: PushSubscription, payload: PushPayload): Promise<void>;
}

/**
 * A push delivery failure. `statusCode` is the push service's HTTP status when
 * known; 404/410 mean the subscription is gone and should be pruned.
 */
export class PushSendError extends Error {
  readonly statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'PushSendError';
    this.statusCode = statusCode;
  }
}
