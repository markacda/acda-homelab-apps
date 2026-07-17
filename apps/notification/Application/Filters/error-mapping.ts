import type { ErrorRequestHandler } from 'express';
import { ValidationError } from '../../Domain/Exceptions/validation-error.ts';

/**
 * Map domain errors to HTTP responses. ValidationError -> 400; anything else
 * falls through to server-kit's terminal handler (logged + 500). Mount after the
 * routes and before startServer adds its handlers.
 */
export function errorMapping(): ErrorRequestHandler {
  return (err, _req, res, next) => {
    if (err instanceof ValidationError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    next(err);
  };
}
