import { join } from 'node:path';
import express from 'express';
import type { Express } from 'express';
import { FileNotificationStore } from '../../Adapters/Notifications/file-notification-store.ts';
import { FeedChannel } from '../../Adapters/Notifications/feed-channel.ts';
import { EmailChannel } from '../../Adapters/Email/email-channel.ts';
import type { NotificationChannel } from '../../Ports/Channels/notification-channel.ts';
import { NotificationService } from '../Services/notification-service.ts';
import { NotificationController } from '../Controllers/notification-controller.ts';
import { errorMapping } from '../Filters/error-mapping.ts';

/**
 * Composition root: build the file-backed notification store, assemble the
 * delivery channels, inject them into the dispatcher service, and mount the
 * controller (POST /send + GET /api/notifications).
 */
export function register(app: Express): void {
  const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data');
  const notificationStore = new FileNotificationStore(join(dataDir, 'notifications.json'));

  // The in-app feed is the one fully-implemented channel; it backs GET /api/notifications.
  const feedChannel = new FeedChannel(notificationStore);
  const channels: NotificationChannel[] = [feedChannel];

  // Email channel (skeleton) — registered only when SMTP is configured. Once
  // EmailChannel.deliver() is implemented, `channels:["email"]` starts working.
  if (process.env.SMTP_HOST) {
    channels.push(
      new EmailChannel({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        from: process.env.SMTP_FROM || 'homelab@localhost',
        to: (process.env.SMTP_TO || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      })
    );
    console.log('notification email channel enabled (skeleton)');
  }
  // Future channels (drop-in): web-push, websocket, webhook — see NotificationChannel doc.

  const service = new NotificationService(notificationStore, channels);
  const sendToken = process.env.SEND_TOKEN || undefined;

  app.use(express.json({ limit: '256kb' }));
  app.use(new NotificationController(service, sendToken).router);
  app.use(errorMapping());
}
