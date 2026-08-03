import { Router } from 'express';
import { LogQueryService } from '../Services/log-query-service.ts';

// Trace-timeline surface, mounted at /api/trace: GET /:traceId returns every
// record (requests/logs/exceptions/dependencies) sharing that trace id, ordered
// by timestamp ascending. Unlike the other controllers this reads a route param
// rather than query filters — an unknown trace simply yields an empty timeline.
export class TraceController {
  readonly router: Router;
  private query: LogQueryService;

  constructor(query: LogQueryService) {
    this.query = query;
    const router = Router();

    router.get('/:traceId', (req, res) => {
      res.json(this.query.traceById(req.params.traceId));
    });

    this.router = router;
  }
}
