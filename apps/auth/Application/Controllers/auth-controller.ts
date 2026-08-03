import { Router } from 'express';
import type { Response } from 'express';
import { AuthService } from '../Services/auth-service.ts';
import type { AccessTokenIssuer, AccessTokenClaims } from '../../Domain/Ports/access-token-issuer.ts';
import { toCredentials } from '../Mappers/auth-mapper.ts';
import { authenticate } from '../Filters/authenticate.ts';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  ACCESS_MAX_AGE_MS,
  REFRESH_MAX_AGE_MS,
  sessionCookieOptions,
  clearCookieOptions,
  readCookie,
} from '../Filters/cookies.ts';

// HTTP surface for authentication, mounted under /api. Handlers are thin: parse
// via the mapper, delegate to AuthService, and set/clear the session cookies.
// Thrown DomainErrors (ValidationError 400, ConflictError 409, UnauthorizedError
// 401) flow to the error-mapping filter; Express 5 forwards async rejections, so
// no try/catch is needed here.
export class AuthController {
  readonly router: Router;
  private auth: AuthService;

  constructor(auth: AuthService, tokens: AccessTokenIssuer) {
    this.auth = auth;
    const router = Router();

    router.post('/register', async (req, res) => {
      const { email, password } = toCredentials(req.body);
      res.status(201).json(await this.auth.register(email, password));
    });

    router.post('/login', async (req, res) => {
      const { email, password } = toCredentials(req.body);
      const result = await this.auth.login(email, password);
      setSessionCookies(res, result.accessToken, result.refreshToken);
      res.json(result.person);
    });

    router.post('/refresh', async (req, res) => {
      const tokensOut = await this.auth.refresh(readCookie(req, REFRESH_COOKIE));
      setSessionCookies(res, tokensOut.accessToken, tokensOut.refreshToken);
      res.json({ ok: true });
    });

    router.post('/logout', async (req, res) => {
      await this.auth.logout(readCookie(req, REFRESH_COOKIE));
      clearSessionCookies(res);
      res.status(204).end();
    });

    router.get('/me', authenticate(tokens), async (_req, res) => {
      const claims = res.locals.auth as AccessTokenClaims;
      res.json(await this.auth.currentPerson(claims.sub));
    });

    this.router = router;
  }
}

/** Set the access + refresh token cookies on the response. */
function setSessionCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_COOKIE, accessToken, sessionCookieOptions(ACCESS_MAX_AGE_MS));
  res.cookie(REFRESH_COOKIE, refreshToken, sessionCookieOptions(REFRESH_MAX_AGE_MS));
}

/** Clear both session cookies (logout). */
function clearSessionCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, clearCookieOptions());
  res.clearCookie(REFRESH_COOKIE, clearCookieOptions());
}
