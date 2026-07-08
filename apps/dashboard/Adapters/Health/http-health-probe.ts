import type { HealthProbe } from "../../Ports/Health/health-probe.ts";
import { DISCOVERY_UA } from "../../../Common/access-log/constants.ts";

const CHECK_TIMEOUT_MS = 3000;

/**
 * HealthProbe over HTTP: a GET that treats any response as "up" and a
 * network/timeout error as "down". Tagged with DISCOVERY_UA so these probes are
 * recognizable (and hidden by default) in each app's access log.
 */
export class HttpHealthProbe implements HealthProbe {
  async probe(target: string): Promise<"up" | "down"> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
    try {
      await fetch(target, {
        method: "GET",
        signal: controller.signal,
        redirect: "manual",
        headers: { "user-agent": DISCOVERY_UA },
      });
      return "up";
    } catch {
      return "down";
    } finally {
      clearTimeout(timer);
    }
  }
}
