import { Router } from 'express';
import { LogQueryService } from '../Services/log-query-service.ts';
import { parseAppLogFilter, parseAppLogSort, parsePagination } from '../Mappers/query-mapper.ts';

// Application (console) log surface, mounted at /api/app-logs: the list,
// /stats and /meta — mirroring the access-log controller.
export class AppLogController {
  readonly router: Router;
  private query: LogQueryService;

  constructor(query: LogQueryService) {
    this.query = query;
    const router = Router();

    router.get('/', (req, res) => {
      res.json(this.query.listAppLogs(parseAppLogFilter(req.query), parseAppLogSort(req.query), parsePagination(req.query)));
    });

    router.get('/stats', (req, res) => {
      res.json(this.query.appLogStats(parseAppLogFilter(req.query)));
    });

    router.get('/meta', (_req, res) => {
      res.json(this.query.appLogMeta());
    });

    this.router = router;
  }
}
