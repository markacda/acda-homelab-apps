import type { ErrorRequestHandler } from 'express'
import { DomainError } from '../../Domain/Exceptions/domain-error.ts'

/**
 * Turn any DomainError into `status { error, ...extra }` (extra carries the
 * forwarded upstream `status` or a timeout/fetch `message`). Anything else is
 * re-forwarded to server-kit's 500 handler. Express 5 forwards async rejections
 * here automatically. Mount after the routes, before startServer's handlers.
 */
export function errorMapping(): ErrorRequestHandler {
  return (err, _req, res, next) => {
    if (res.headersSent) return next(err)
    if (err instanceof DomainError) {
      res.status(err.status).json({ error: err.message, ...(err.extra ?? {}) })
      return
    }
    next(err)
  }
}
