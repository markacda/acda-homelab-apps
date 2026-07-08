import { DomainError } from "./domain-error.ts";

/**
 * An upstream (airplanes.live) call failed or was rejected. Carries the status to
 * forward and any extra body fields (`status` for a forwarded upstream code,
 * `message` for a timeout/fetch detail).
 */
export class ProxyError extends DomainError {
  constructor(message: string, status: number, extra?: Record<string, unknown>) {
    super(message, status, extra);
  }
}
