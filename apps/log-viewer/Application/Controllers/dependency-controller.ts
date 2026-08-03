import { Router } from 'express';
import { LogQueryService } from '../Services/log-query-service.ts';
import { parseDependencyFilter, parseDependencySort, parsePagination } from '../Mappers/query-mapper.ts';

// Outbound-dependency surface, mounted at /api/dependencies: the list, /stats and
// /meta — mirroring the access-log controller.
export class DependencyController {
  readonly router: Router;
  private query: LogQueryService;

  constructor(query: LogQueryService) {
    this.query = query;
    const router = Router();

    router.get('/', (req, res) => {
      res.json(this.query.listDependencies(parseDependencyFilter(req.query), parseDependencySort(req.query), parsePagination(req.query)));
    });

    router.get('/stats', (req, res) => {
      res.json(this.query.dependencyStats(parseDependencyFilter(req.query)));
    });

    router.get('/meta', (_req, res) => {
      res.json(this.query.dependencyMeta());
    });

    this.router = router;
  }
}
