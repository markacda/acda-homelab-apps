import { Router } from 'express';
import { LogQueryService } from '../Services/log-query-service.ts';
import { parseExceptionFilter, parseExceptionSort, parsePagination } from '../Mappers/query-mapper.ts';

// Exception surface, mounted at /api/exceptions: the list, /stats and /meta —
// mirroring the access-log controller.
export class ExceptionController {
  readonly router: Router;
  private query: LogQueryService;

  constructor(query: LogQueryService) {
    this.query = query;
    const router = Router();

    router.get('/', (req, res) => {
      res.json(this.query.listExceptions(parseExceptionFilter(req.query), parseExceptionSort(req.query), parsePagination(req.query)));
    });

    router.get('/stats', (req, res) => {
      res.json(this.query.exceptionStats(parseExceptionFilter(req.query)));
    });

    router.get('/meta', (_req, res) => {
      res.json(this.query.exceptionMeta());
    });

    this.router = router;
  }
}
