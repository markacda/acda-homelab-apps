import { Router } from "express";
import { LogQueryService } from "../Services/log-query-service.ts";
import { parseRequestFilter, parseRequestSort, parsePagination } from "../Mappers/query-mapper.ts";

// HTTP access-log surface: /api/logs (paginated), /api/stats, /api/meta.
// Thin — map query params, delegate to the query service, respond.
export class RequestLogController {
  readonly router: Router;
  private query: LogQueryService;

  constructor(query: LogQueryService) {
    this.query = query;
    const router = Router();

    router.get("/logs", (req, res) => {
      res.json(
        this.query.listRequests(
          parseRequestFilter(req.query),
          parseRequestSort(req.query),
          parsePagination(req.query),
        ),
      );
    });

    router.get("/stats", (req, res) => {
      res.json(this.query.requestStats(parseRequestFilter(req.query)));
    });

    router.get("/meta", (_req, res) => {
      res.json(this.query.requestMeta());
    });

    this.router = router;
  }
}
