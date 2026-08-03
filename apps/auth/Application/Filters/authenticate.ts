import type { RequestHandler } from 'express';
import type { AccessTokenIssuer } from '../../Domain/Ports/access-token-issuer.ts';
import { UnauthorizedError } from '../../Domain/Exceptions/unauthorized-error.ts';
import { ACCESS_COOKIE, readCookie } from './cookies.ts';

// Guard for authenticated routes: read the access-token cookie, verify it, and
// stash the resulting claims on res.locals.auth for the handler. A missing or
// invalid token throws UnauthorizedError (→ 401 via the error-mapping filter).
// Express 5 forwards the async rejection, so no try/catch is needed downstream.
export function authenticate(tokens: AccessTokenIssuer): RequestHandler {
  return async (req, res, next) => {
    const token = readCookie(req, ACCESS_COOKIE);
    if (!token) throw new UnauthorizedError('Not authenticated.');
    res.locals.auth = await tokens.verify(token);
    next();
  };
}
