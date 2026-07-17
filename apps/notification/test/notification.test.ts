import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNotification } from '../Domain/ValueObjects/notification.ts';
import { ValidationError } from '../Domain/Exceptions/validation-error.ts';
import { NotificationService } from '../Application/Services/notification-service.ts';
import { PushSendError } from '../Ports/Push/push-sender.ts';
import type { PushSender, PushPayload } from '../Ports/Push/push-sender.ts';
import type { SubscriptionStore } from '../Ports/Push/subscription-store.ts';
import type { NotificationStore } from '../Ports/Notifications/notification-store.ts';
import type { PushSubscription } from '../Domain/ValueObjects/push-subscription.ts';
import type { Notification } from '../Domain/ValueObjects/notification.ts';

function sub(endpoint: string): PushSubscription {
  return { endpoint, keys: { p256dh: 'p', auth: 'a' } };
}

class FakeSubscriptionStore implements SubscriptionStore {
  subs: PushSubscription[];
  constructor(initial: PushSubscription[] = []) {
    this.subs = initial;
  }
  async list() {
    return this.subs;
  }
  async add(s: PushSubscription) {
    this.subs = [...this.subs.filter((x) => x.endpoint !== s.endpoint), s];
  }
  async remove(endpoint: string) {
    this.subs = this.subs.filter((x) => x.endpoint !== endpoint);
  }
}

class FakeNotificationStore implements NotificationStore {
  added: Notification[] = [];
  async add(n: Notification) {
    this.added.unshift(n);
  }
  async recent(limit: number) {
    return this.added.slice(0, limit);
  }
}

class FakeSender implements PushSender {
  sent: Array<{ endpoint: string; payload: PushPayload }> = [];
  private goneEndpoints: Set<string>;
  constructor(goneEndpoints: Set<string> = new Set()) {
    this.goneEndpoints = goneEndpoints;
  }
  publicKey() {
    return 'test-key';
  }
  async send(s: PushSubscription, payload: PushPayload) {
    if (this.goneEndpoints.has(s.endpoint)) throw new PushSendError('gone', 410);
    this.sent.push({ endpoint: s.endpoint, payload });
  }
}

test('createNotification requires title and message', () => {
  assert.throws(() => createNotification({ title: '', message: 'x' }, 'id', 'now'), ValidationError);
  assert.throws(() => createNotification({ title: 'x', message: '  ' }, 'id', 'now'), ValidationError);
});

test('createNotification stamps id/createdAt and trims content', () => {
  const n = createNotification({ title: '  Hi  ', message: '  there  ', url: '/logs/' }, 'id-1', '2026-07-17T00:00:00Z');
  assert.equal(n.id, 'id-1');
  assert.equal(n.createdAt, '2026-07-17T00:00:00Z');
  assert.equal(n.title, 'Hi');
  assert.equal(n.message, 'there');
  assert.equal(n.url, '/logs/');
});

test('send records the notification and fans out to every subscription', async () => {
  const store = new FakeNotificationStore();
  const sender = new FakeSender();
  const subs = new FakeSubscriptionStore([sub('a'), sub('b')]);
  const service = new NotificationService(subs, sender, store);

  const result = await service.send({ title: 'T', message: 'M', url: '/logs/' });

  assert.equal(store.added.length, 1);
  assert.equal(result.title, 'T');
  assert.equal(sender.sent.length, 2);
  assert.deepEqual(sender.sent.map((s) => s.endpoint).sort(), ['a', 'b']);
  assert.equal(sender.sent[0].payload.body, 'M');
  assert.equal(sender.sent[0].payload.url, '/logs/');
});

test('send prunes subscriptions the push service reports as gone (410)', async () => {
  const store = new FakeNotificationStore();
  const sender = new FakeSender(new Set(['dead']));
  const subs = new FakeSubscriptionStore([sub('live'), sub('dead')]);
  const service = new NotificationService(subs, sender, store);

  await service.send({ title: 'T', message: 'M' });

  const remaining = (await subs.list()).map((s) => s.endpoint);
  assert.deepEqual(remaining, ['live']);
});
