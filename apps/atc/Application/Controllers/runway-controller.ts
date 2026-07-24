import { Router } from 'express';
import type { RunwayConfigService } from '../Services/runway-config-service.ts';

// HTTP surface for the latest EHAM runway configuration (fed by MQTT). Returns
// the config as JSON, or 503 until the first message has been received.
export class RunwayController {
  readonly router: Router;
  private service: RunwayConfigService;

  constructor(service: RunwayConfigService) {
    this.service = service;
    const router = Router();

    router.get('/runways', (_req, res) => {
      const latest = this.service.latest();
      if (!latest) {
        res.status(503).json({ error: 'No runway configuration received yet' });
        return;
      }
      res.json(latest);
    });

    this.router = router;
  }
}
