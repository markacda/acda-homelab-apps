import type { ErrorRequestHandler } from 'express'
import { DomainError } from '../../Domain/Exceptions/domain-error.ts'

/**
 * Terminal-ish error filter: turn any DomainError thrown by a controller/service
 * into `status { error: message }`. Anything else is re-forwarded so the shared
 * server-kit handler logs it and responds 500. Mount AFTER all routes and BEFORE
 * server-kit's errorLogger/errorHandler (startServer adds those last). Express 5
 * forwards both sync and async route errors here automatically.
 */
export function errorMapping(): ErrorRequestHandler {
  return (err, _req, res, next) => {
    if (res.headersSent) return next(err)
    if (err instanceof DomainError) {
      res.status(err.status).json({ error: err.message })
      return
    }
    next(err)
  }
}
