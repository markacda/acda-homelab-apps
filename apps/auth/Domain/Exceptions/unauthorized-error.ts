import { DomainError } from './domain-error.ts';

/** Authentication failed or is missing (bad credentials, invalid/expired/missing token). Maps to HTTP 401. */
export class UnauthorizedError extends DomainError {
  constructor(message: string) {
    super(message, 401);
  }
}
