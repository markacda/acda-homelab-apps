// Pure, deterministic alert-rule evaluation over a trailing time window. No I/O
// and `now` is injected, so it's fully unit-testable. The ingest service calls
// this each cycle and applies per-rule cooldowns to what it returns.

/** Thresholds for the rule engine. A rule with a 0/false threshold is disabled. */
export interface AlertRuleConfig {
  windowMs: number; // trailing window evaluated, ending at `now`
  errorBurst: number; // fire when ≥ this many 5xx requests in the window
  errorRate: number; // fire when the 4xx+5xx fraction exceeds this (0..1)
  slowP95Ms: number; // fire when the request p95 duration exceeds this
  exceptionBurst: number; // fire when ≥ this many exceptions in the window
  minSample: number; // min requests in the window for the rate/p95 rules
}

/** A triggered alert. `key` is stable per rule so the caller can cool it down. */
export interface Alert {
  key: string;
  title: string;
  message: string;
}

/** The slices of the in-memory view the rules read (kept minimal for testing). */
export interface AlertInputs {
  requests: { ts: string; status: number; durationMs: number }[];
  exceptions: { ts: string }[];
}

/** The p-th percentile of an ascending-sorted array (nearest-rank). 0 if empty. */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const rank = Math.ceil(p * sortedAsc.length);
  return sortedAsc[Math.min(sortedAsc.length - 1, Math.max(0, rank - 1))];
}

/**
 * Evaluate every enabled rule against the entries falling in the trailing
 * `windowMs` before `now`. Returns the alerts that currently trigger (deduped by
 * `key`); the caller decides whether to actually deliver each, honouring cooldown.
 */
export function evaluateAlertRules(inputs: AlertInputs, config: AlertRuleConfig, now: number): Alert[] {
  const since = now - config.windowMs;
  const inWindow = (ts: string): boolean => {
    const t = Date.parse(ts);
    return t >= since && t <= now;
  };
  const reqs = inputs.requests.filter((r) => inWindow(r.ts));
  const excs = inputs.exceptions.filter((e) => inWindow(e.ts));
  const mins = Math.max(1, Math.round(config.windowMs / 60_000));
  const alerts: Alert[] = [];

  const count5xx = reqs.reduce((n, r) => (r.status >= 500 ? n + 1 : n), 0);
  if (config.errorBurst > 0 && count5xx >= config.errorBurst) {
    alerts.push({ key: 'errorBurst', title: '🚨 Error burst', message: `${count5xx} server errors (5xx) in the last ${mins} min` });
  }

  if (config.errorRate > 0 && reqs.length >= config.minSample) {
    const errors = reqs.reduce((n, r) => (r.status >= 400 ? n + 1 : n), 0);
    const rate = errors / reqs.length;
    if (rate > config.errorRate) {
      alerts.push({
        key: 'errorRate',
        title: '🚨 High error rate',
        message: `${(rate * 100).toFixed(1)}% of ${reqs.length} requests failed in the last ${mins} min`,
      });
    }
  }

  if (config.slowP95Ms > 0 && reqs.length >= config.minSample) {
    const p95 = percentile(
      reqs.map((r) => r.durationMs || 0).sort((a, b) => a - b),
      0.95
    );
    if (p95 > config.slowP95Ms) {
      alerts.push({
        key: 'slowP95',
        title: '🐌 Slow responses',
        message: `p95 response time ${Math.round(p95)} ms over the last ${mins} min (${reqs.length} requests)`,
      });
    }
  }

  if (config.exceptionBurst > 0 && excs.length >= config.exceptionBurst) {
    alerts.push({ key: 'exceptionBurst', title: '💥 Exceptions', message: `${excs.length} exceptions in the last ${mins} min` });
  }

  return alerts;
}
