import { join } from 'node:path';
import express from 'express';
import type { Express } from 'express';
import { FileSubscriptionStore } from '../../Adapters/Push/file-subscription-store.ts';
import { FileNotificationStore } from '../../Adapters/Notifications/file-notification-store.ts';
import { WebPushSender } from '../../Adapters/Push/web-push-sender.ts';
import { NotificationService } from '../Services/notification-service.ts';
import { PushController } from '../Controllers/push-controller.ts';
import { NotificationController } from '../Controllers/notification-controller.ts';
import { errorMapping } from '../Filters/error-mapping.ts';

/**
 * Composition root: read the VAPID config, build the file-backed stores + the
 * web-push sender, inject them into the service, and mount the two controllers.
 * With no VAPID keys the app still boots; sending is disabled until they're set.
 */
export function register(app: Express): void {
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? '';
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? '';
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@homelab.local';
  if (!publicKey || !privateKey) {
    console.error('[notification] VAPID keys missing (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY) — push disabled until set');
  }

  const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data');
  const subscriptions = new FileSubscriptionStore(join(dataDir, 'subscriptions.json'));
  const notificationStore = new FileNotificationStore(join(dataDir, 'notifications.json'));
  const sender = new WebPushSender(publicKey, privateKey, subject);
  const service = new NotificationService(subscriptions, sender, notificationStore);
  const sendToken = process.env.SEND_TOKEN || undefined;

  app.use(express.json({ limit: '256kb' }));
  app.use('/api/push', new PushController(service).router);
  app.use(new NotificationController(service, sendToken).router);
  app.use(errorMapping());
}
