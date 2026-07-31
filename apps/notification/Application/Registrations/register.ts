import { join } from 'node:path';
import express from 'express';
import type { Express } from 'express';
import type { Pool } from 'pg';
import { createPool, runMigrations } from '../../../Common/db/index.ts';
import { PostgresNotificationStore } from '../../Adapters/Postgres/postgres-notification-store.ts';
import { importLegacyNotifications } from '../../Adapters/Postgres/notification-import.ts';
import { EmailChannel } from '../../Adapters/Email/email-channel.ts';
import type { NotificationChannel } from '../../Ports/Channels/notification-channel.ts';
import { NotificationService } from '../Services/notification-service.ts';
import { NotificationController } from '../Controllers/notification-controller.ts';
import { errorMapping } from '../Filters/error-mapping.ts';

/**
 * Composition root: connect the shared Postgres pool, run migrations, import any
 * legacy file-backed feed once, build the DB-backed notification store (the
 * always-on feed), assemble the optional delivery channels, and mount the
 * controller (POST /send + GET /api/notifications). Returns the pool so the
 * server can close it on shutdown and ping it for /healthz.
 */
export async function register(app: Express): Promise<Pool> {
  const pool = createPool('notification');
  await runMigrations(pool, {
    schema: 'notification',
    dir: join(import.meta.dirname, '../../Adapters/Postgres/migrations'),
  });
  // One-time migration of the old JSON feed into the DB (idempotent — a no-op
  // once the table has rows or the file is gone). Removable after cut-over.
  const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data');
  await importLegacyNotifications(pool, join(dataDir, 'notifications.json'));

  const notificationStore = new PostgresNotificationStore(pool);

  // Delivery channels (the feed is not a channel — it is always written). Each is
  // registered only when configured; POST /send targets them by name.
  const channels: NotificationChannel[] = [];

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

  return pool;
}
