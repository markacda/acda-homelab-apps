// Base class for expected, client-facing errors. Each carries the HTTP status
// the API should respond with; the Application/Filters error mapper turns any
// DomainError into `status { error: message }` and lets everything else fall
// through to the shared 500 handler. Subclasses fix the status for common cases;
// throw `new DomainError(message, status)` directly for one-off codes.
export class DomainError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = new.target.name;
    this.status = status;
  }
}
