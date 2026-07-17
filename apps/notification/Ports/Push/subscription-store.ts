import type { PushSubscription } from '../../Domain/ValueObjects/push-subscription.ts';

/** Persistence for the set of push subscriptions (deduped by endpoint). */
export interface SubscriptionStore {
  list(): Promise<PushSubscription[]>;
  /** Add a subscription; replaces any existing one with the same endpoint. */
  add(sub: PushSubscription): Promise<void>;
  remove(endpoint: string): Promise<void>;
}
