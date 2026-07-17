import { Router } from 'express';
import type { NotificationService } from '../Services/notification-service.ts';
import { toSubscribeRequest, toUnsubscribeEndpoint } from '../../Models/Requests/subscribe-request.ts';
import type { PublicKeyResponse } from '../../Models/Responses/public-key-response.ts';

/**
 * Push-subscription surface, mounted at /api/push. Called by the dashboard
 * client (over the same origin via the proxy): it fetches the VAPID public key,
 * then registers/removes the browser's push subscription. Express 5 forwards
 * async rejections to the error filter, so no try/catch is needed here.
 */
export class PushController {
  readonly router: Router;
  private readonly notifications: NotificationService;

  constructor(notifications: NotificationService) {
    this.notifications = notifications;
    const router = Router();

    router.get('/public-key', (_req, res) => {
      const body: PublicKeyResponse = { publicKey: this.notifications.publicKey() };
      res.json(body);
    });

    router.post('/subscribe', async (req, res) => {
      await this.notifications.subscribe(toSubscribeRequest(req.body));
      res.status(201).json({ ok: true });
    });

    router.post('/unsubscribe', async (req, res) => {
      const endpoint = toUnsubscribeEndpoint(req.body);
      if (endpoint) await this.notifications.unsubscribe(endpoint);
      res.json({ ok: true });
    });

    this.router = router;
  }
}
