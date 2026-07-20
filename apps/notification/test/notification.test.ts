import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNotification } from '../Domain/ValueObjects/notification.ts';
import { ValidationError } from '../Domain/Exceptions/validation-error.ts';
import { NotificationService } from '../Application/Services/notification-service.ts';
import type { NotificationStore } from '../Ports/Notifications/notification-store.ts';
import type { Notification } from '../Domain/ValueObjects/notification.ts';

class FakeNotificationStore implements NotificationStore {
  added: Notification[] = [];
  async add(n: Notification) {
    this.added.unshift(n);
  }
  async recent(limit: number) {
    return this.added.slice(0, limit);
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

test('send records the notification and returns the stamped record', async () => {
  const store = new FakeNotificationStore();
  const service = new NotificationService(store);

  const result = await service.send({ title: 'T', message: 'M', url: '/logs/' });

  assert.equal(store.added.length, 1);
  assert.equal(store.added[0].id, result.id);
  assert.equal(result.title, 'T');
  assert.equal(result.message, 'M');
  assert.equal(result.url, '/logs/');
});

test('recent returns the most recent notifications up to the limit', async () => {
  const store = new FakeNotificationStore();
  const service = new NotificationService(store);
  await service.send({ title: 'A', message: '1' });
  await service.send({ title: 'B', message: '2' });

  const recent = await service.recent(1);
  assert.equal(recent.length, 1);
  assert.equal(recent[0].title, 'B');
});
