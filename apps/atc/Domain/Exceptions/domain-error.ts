// Base class for expected, client-facing errors. Carries the HTTP status to
// respond with and, optionally, extra fields to merge into the JSON body (the
// proxy forwards `status`/`message` alongside `error`). The Application/Filters
// error mapper renders it; anything else falls through to the shared 500 handler.
export class DomainError extends Error {
  readonly status: number;
  readonly extra?: Record<string, unknown>;

  constructor(message: string, status: number, extra?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.extra = extra;
  }
}
