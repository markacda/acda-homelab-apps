import type { HealthProbe } from '../../Ports/Health/health-probe.ts';
import { DISCOVERY_UA } from '../../../Common/access-log/constants.ts';
import { withTags } from '../../../Common/access-log/logger.ts';

const CHECK_TIMEOUT_MS = 3000;

/**
 * HealthProbe over HTTP: a GET that treats any response as "up" and a
 * network/timeout error as "down". Tagged with DISCOVERY_UA so these probes are
 * recognizable (and hidden by default) in each app's access log, and scoped with
 * the "Healthcheck" log tag so the frequent probe rows don't dominate the Log
 * Viewer's dependency tables (same treatment as the DB liveness ping).
 */
export class HttpHealthProbe implements HealthProbe {
  async probe(target: string): Promise<'up' | 'down'> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
    try {
      await withTags(['Healthcheck'], () =>
        fetch(target, {
          method: 'GET',
          signal: controller.signal,
          redirect: 'manual',
          headers: { 'user-agent': DISCOVERY_UA },
        })
      );
      return 'up';
    } catch {
      return 'down';
    } finally {
      clearTimeout(timer);
    }
  }
}
