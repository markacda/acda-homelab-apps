import { DomainError } from './domain-error.ts';

/** A resource conflicts with existing state (e.g. an email already registered). Maps to HTTP 409. */
export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 409);
  }
}
