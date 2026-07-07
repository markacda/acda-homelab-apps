import type { ErrorRequestHandler } from "express";
import { DomainError } from "../../Domain/Exceptions/domain-error.ts";

/**
 * Turn any DomainError thrown by a controller/service into `status { error }`.
 * Anything else is re-forwarded so server-kit's handler logs it and responds 500.
 * Mount AFTER all routes and BEFORE server-kit's errorLogger/errorHandler.
 */
export function errorMapping(): ErrorRequestHandler {
  return (err, _req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof DomainError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    next(err);
  };
}
