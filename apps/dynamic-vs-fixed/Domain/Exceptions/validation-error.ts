import { DomainError } from './domain-error.ts';

/** Invalid input (no file, unparseable CSV/params, missing columns). Maps to HTTP 400. */
export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 400);
  }
}
