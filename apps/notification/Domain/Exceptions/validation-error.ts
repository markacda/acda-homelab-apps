/** Invalid input (missing/blank required field, wrong shape). Maps to HTTP 400. */
export class ValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
