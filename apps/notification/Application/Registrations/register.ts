import { join } from 'node:path';
import express from 'express';
import type { Express } from 'express';
import { FileNotificationStore } from '../../Adapters/Notifications/file-notification-store.ts';
import { NotificationService } from '../Services/notification-service.ts';
import { NotificationController } from '../Controllers/notification-controller.ts';
import { errorMapping } from '../Filters/error-mapping.ts';

/**
 * Composition root: build the file-backed notification store, inject it into the
 * service, and mount the controller (POST /send + GET /api/notifications).
 */
export function register(app: Express): void {
  const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data');
  const notificationStore = new FileNotificationStore(join(dataDir, 'notifications.json'));
  const service = new NotificationService(notificationStore);
  const sendToken = process.env.SEND_TOKEN || undefined;

  app.use(express.json({ limit: '256kb' }));
  app.use(new NotificationController(service, sendToken).router);
  app.use(errorMapping());
}
