import { DomainError } from './domain-error.ts';

/** A requested aggregate (recipe, book, generated output) does not exist. Maps to HTTP 404. */
export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message, 404);
  }
}
