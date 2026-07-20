import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNotification } from '../Domain/ValueObjects/notification.ts';
import { ValidationError } from '../Domain/Exceptions/validation-error.ts';
import { NotificationService } from '../Application/Services/notification-service.ts';
import { EmailChannel } from '../Adapters/Email/email-channel.ts';
import type { NotificationStore } from '../Ports/Notifications/notification-store.ts';
import type { NotificationChannel } from '../Ports/Channels/notification-channel.ts';
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

class FakeChannel implements NotificationChannel {
  readonly name: string;
  delivered: Notification[] = [];
  constructor(name: string) {
    this.name = name;
  }
  async deliver(n: Notification) {
    this.delivered.push(n);
  }
}

class ThrowingChannel implements NotificationChannel {
  readonly name: string;
  constructor(name: string) {
    this.name = name;
  }
  async deliver() {
    throw new Error('boom');
  }
}

test('createNotification requires title and message', () => {
  assert.throws(() => createNotification({ title: '', message: 'x' }, 'id', 'now'), ValidationError);
  assert.throws(() => createNotification({ title: 'x', message: '  ' }, 'id', 'now'), ValidationError);
});

test('createNotification stamps id/createdAt, trims content, and normalizes channels', () => {
  const n = createNotification({ title: '  Hi  ', message: '  there  ', url: '/logs/', channels: [' email ', ''] }, 'id-1', '2026-07-17T00:00:00Z');
  assert.equal(n.id, 'id-1');
  assert.equal(n.createdAt, '2026-07-17T00:00:00Z');
  assert.equal(n.title, 'Hi');
  assert.equal(n.message, 'there');
  assert.equal(n.url, '/logs/');
  assert.deepEqual(n.channels, ['email']);
});

test('channels is optional — a feed-only notification carries none', () => {
  const n = createNotification({ title: 'T', message: 'M' }, 'id', 'now');
  assert.equal(n.channels, undefined);
});

test('send always records to the feed, even with no channels', async () => {
  const store = new FakeNotificationStore();
  const service = new NotificationService(store, []);

  const result = await service.send({ title: 'T', message: 'M', url: '/logs/' });

  assert.equal(store.added.length, 1);
  assert.equal(store.added[0].id, result.id);
  assert.equal(result.title, 'T');
  assert.equal(result.url, '/logs/');
});

test('send delivers to the requested channels and still records to the feed', async () => {
  const store = new FakeNotificationStore();
  const email = new FakeChannel('email');
  const service = new NotificationService(store, [email]);

  await service.send({ title: 'T', message: 'M', channels: ['email'] });

  assert.equal(store.added.length, 1); // feed always written
  assert.equal(email.delivered.length, 1);
  assert.equal(email.delivered[0].id, store.added[0].id);
});

test('send fans out to every requested channel', async () => {
  const store = new FakeNotificationStore();
  const a = new FakeChannel('a');
  const b = new FakeChannel('b');
  const service = new NotificationService(store, [a, b]);

  await service.send({ title: 'T', message: 'M', channels: ['a', 'b'] });

  assert.equal(a.delivered.length, 1);
  assert.equal(b.delivered.length, 1);
});

test('send rejects an unknown channel and records nothing', async () => {
  const store = new FakeNotificationStore();
  const service = new NotificationService(store, []);
  await assert.rejects(() => service.send({ title: 'T', message: 'M', channels: ['email'] }), ValidationError);
  assert.equal(store.added.length, 0); // validation happens before the feed write
});

test('a failing channel does not fail send or block the feed', async () => {
  const store = new FakeNotificationStore();
  const service = new NotificationService(store, [new ThrowingChannel('flaky')]);

  const result = await service.send({ title: 'T', message: 'M', channels: ['flaky'] });

  assert.ok(result.id);
  assert.equal(store.added.length, 1); // feed still written
});

test('recent returns the most recent notifications up to the limit', async () => {
  const store = new FakeNotificationStore();
  const service = new NotificationService(store, []);
  await service.send({ title: 'A', message: '1' });
  await service.send({ title: 'B', message: '2' });

  const recent = await service.recent(1);
  assert.equal(recent.length, 1);
  assert.equal(recent[0].title, 'B');
});

test('the email channel skeleton is not implemented yet', async () => {
  const email = new EmailChannel({ host: 'localhost', port: 587, from: 'x@localhost', to: [] });
  await assert.rejects(() => email.deliver({ id: 'i', createdAt: 'now', title: 'T', message: 'M' }), /not implemented/);
});
