import { Router } from 'express';
import { clampInt } from '../../../Common/http-utils/index.ts';
import type { NotificationService } from '../Services/notification-service.ts';
import { toNewNotification } from '../../Models/Requests/send-request.ts';
import type { NotificationsResponse } from '../../Models/Responses/notifications-response.ts';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * The notification surface mounted at the app root:
 *   POST /send             — internal: other apps ask us to notify the user
 *   GET  /api/notifications — the frontend's recent-notifications feed
 *
 * `/send` is intended for container-to-container calls. If SEND_TOKEN is set it
 * must be presented as `Authorization: Bearer <token>` (defence-in-depth, since
 * the proxy also exposes this path publicly).
 */
export class NotificationController {
  readonly router: Router;
  private readonly notifications: NotificationService;
  private readonly sendToken?: string;

  constructor(notifications: NotificationService, sendToken?: string) {
    this.notifications = notifications;
    this.sendToken = sendToken;
    const router = Router();

    router.post('/send', async (req, res) => {
      if (this.sendToken && req.header('authorization') !== `Bearer ${this.sendToken}`) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const notification = await this.notifications.send(toNewNotification(req.body));
      res.status(201).json(notification);
    });

    router.get('/api/notifications', async (req, res) => {
      const limit = clampInt(req.query.limit, { min: 1, max: MAX_LIMIT, fallback: DEFAULT_LIMIT });
      const body: NotificationsResponse = { notifications: await this.notifications.recent(limit) };
      res.json(body);
    });

    this.router = router;
  }
}
