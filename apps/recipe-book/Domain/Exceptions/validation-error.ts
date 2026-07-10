import { DomainError } from './domain-error.ts';

/** Invalid input (missing/blank required field, wrong shape). Maps to HTTP 400. */
export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 400);
  }
}
