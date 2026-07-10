import { Router } from 'express';
import type { AirplanesSource } from '../../Ports/AirplanesLive/airplanes-source.ts';
import { PointQuery } from '../../Domain/ValueObjects/point-query.ts';

// HTTP surface for the airplanes.live proxy. Thin — validate/parse params,
// delegate to the source port, forward its JSON. Thrown DomainErrors (bad params
// -> 400, upstream failure -> forwarded status) flow to the error-mapping filter;
// Express 5 forwards async rejections automatically.
export class AirplanesController {
  readonly router: Router;
  private source: AirplanesSource;

  constructor(source: AirplanesSource) {
    this.source = source;
    const router = Router();

    // Proxy endpoint for api.airplanes.live.
    router.get('/airplanes/:lat/:lon/:radius', async (req, res) => {
      const { lat, lon, radius } = req.params;
      const query = PointQuery.create(lat, lon, radius);
      res.json(await this.source.fetchPoint(query, req.get('User-Agent')));
    });

    // Fallback pass-through for globe.airplanes.live. Express 5 (path-to-regexp
    // v8) requires a *named* wildcard; the matched segments arrive as an array.
    router.get('/globe-airplanes-live/*splat', async (req, res) => {
      const splat = (req.params as Record<string, unknown>).splat as string[] | undefined;
      const path = (splat ?? []).join('/');
      res.json(await this.source.fetchGlobe(path, req.get('User-Agent')));
    });

    this.router = router;
  }
}
