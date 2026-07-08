import { DomainError } from "./domain-error.ts";

/** Invalid request parameters (out-of-range coordinates/radius). Maps to HTTP 400. */
export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 400);
  }
}
